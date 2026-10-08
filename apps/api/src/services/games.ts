// Game endpoints: pre-lock lineup edits, locking, check-offs, the "warning track"
// partial flag and post-lock substitutions (GAME_DESIGN §4, DATA_MODEL §4).

import type { LineupPatchDto } from '@7gs/contracts';
import { LIMITS, localDateOf, pinchHitThreshold, validateCheckoff, type CheckoffRejection } from '@7gs/rules';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, lineupEntries, taskDefinitions, type GameRow, type UserRow } from '../db/schema';
import { ApiException, conflict, notFound, validationFailed, type Issue } from '../errors';
import { uuidv7 } from '../ids';
import {
  addPinchHit,
  assertBuilt,
  assertNotFinal,
  gameTimeZone,
  loadEntries,
  loadEntry,
  loadUserGame,
  lockNow,
  materializeLock,
  recordFirstPitch,
  refreshScore,
} from './lineups';
import { loadUserSeries } from './seasons';
import { seriesGames } from './standings';
import { assertPlannable } from './weekCard';
import { weekLockOf } from './weeks';
import { dropHoldsForGame } from './ilHolds';

const STALE_MESSAGES: Record<CheckoffRejection, string> = {
  GAME_FINAL: 'This game is already final.',
  NOT_IN_LINEUP: 'Only tasks in the lineup can be checked off.',
  BEFORE_GAME_DAY: 'That check-off happened before this game day started.',
  AFTER_MIDNIGHT: 'Check-offs close at midnight; this one came too late.',
  CLIENT_CLOCK_AHEAD: "The device clock is ahead of the server's clock.",
};

function staleCheckoff(reason: CheckoffRejection): ApiException {
  return conflict('STALE_CHECKOFF', STALE_MESSAGES[reason], reason);
}

/** rules.validateCheckoff for an action happening now on the server (undo, partial). */
function assertCheckoffWindow(game: GameRow, user: UserRow, role: Parameters<typeof validateCheckoff>[0]['role'], now: Date) {
  const check = validateCheckoff({
    playedDate: game.playedDate,
    timeZone: gameTimeZone(game, user),
    gameStatus: game.status,
    role,
    clientAt: now,
    receivedAt: now,
  });
  if (!check.ok) throw staleCheckoff(check.reason);
}

/** Pre-lock edits: threshold, minimum, and the whole lineup and bench. */
export async function patchLineup(
  tx: Db,
  user: UserRow,
  gameId: string,
  patch: LineupPatchDto,
  now: Date,
): Promise<GameRow> {
  let game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  if (game.status === 'final') throw conflict('GAME_FINAL', 'This game is already final.');
  assertBuilt(game);
  assertNotFinal(game, user, now);
  game = await materializeLock(tx, game, now);
  // Free edits end at the week's first pitch (GAME_DESIGN §4a); after it, lineups only
  // grow (pinch hitters, bench adds). A game's own first pitch locks its week too.
  const seriesRow = await loadUserSeries(tx, user.id, game.seriesId);
  assertPlannable(user, seriesRow.startDate, localDateOf(now, user.timezone));
  const siblings = (await seriesGames(tx, game.seriesId)).map((g) => (g.id === game.id ? game : g));
  if (weekLockOf(siblings, user, now) !== null || game.lockedAt) {
    throw conflict(
      'GAME_LOCKED',
      "The week's first pitch has passed; lineups can only grow now (pinch hitters and bench adds).",
      'WEEK_LOCKED',
    );
  }

  const set: Partial<typeof games.$inferInsert> = {};
  if (patch.threshold !== undefined) set.threshold = patch.threshold;
  if (patch.minTasks !== undefined) set.minTasks = patch.minTasks;
  if (Object.keys(set).length > 0) {
    const [row] = await tx.update(games).set(set).where(eq(games.id, game.id)).returning();
    if (row) game = row;
  }
  if (patch.entries !== undefined) {
    await replaceEntries(tx, user, game, patch.entries);
    // The day was re-planned while a task was on the IL: the user's plan stands.
    await dropHoldsForGame(tx, game.id);
  }
  return refreshScore(tx, game);
}

async function replaceEntries(
  tx: Db,
  user: UserRow,
  game: GameRow,
  requested: NonNullable<LineupPatchDto['entries']>,
): Promise<void> {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  requested.forEach((e, i) => {
    if (seen.has(e.taskId)) issues.push({ path: `entries.${i}.taskId`, message: 'This task is listed twice.' });
    seen.add(e.taskId);
  });
  const ids = [...seen];
  const tasks =
    ids.length === 0
      ? []
      : await tx
          .select()
          .from(taskDefinitions)
          .where(and(eq(taskDefinitions.userId, user.id), inArray(taskDefinitions.id, ids)));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  requested.forEach((e, i) => {
    const task = taskById.get(e.taskId);
    if (!task) issues.push({ path: `entries.${i}.taskId`, message: 'Unknown task.' });
    else if (task.status === 'injured') issues.push({ path: `entries.${i}.taskId`, message: 'This task is on the injured list.' });
    else if (task.status === 'retired') issues.push({ path: `entries.${i}.taskId`, message: 'This task is retired.' });
  });
  if (issues.length > 0) throw validationFailed(issues);

  // Batting order per role follows the requested positions (ties keep request order).
  const ordered = (['lineup', 'bench'] as const).flatMap((role) =>
    requested
      .map((e, index) => ({ ...e, index }))
      .filter((e) => e.role === role)
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map((e, i) => ({ taskId: e.taskId, role, position: i + 1, required: role === 'lineup' && e.required })),
  );

  const existing = await loadEntries(tx, [game.id]);
  const keep = new Set(ordered.map((e) => e.taskId));
  const removed = existing.filter((e) => !keep.has(e.taskId)).map((e) => e.id);
  if (removed.length > 0) await tx.delete(lineupEntries).where(inArray(lineupEntries.id, removed));

  const byTask = new Map(existing.map((e) => [e.taskId, e]));
  for (const e of ordered) {
    const current = byTask.get(e.taskId);
    if (current) {
      await tx
        .update(lineupEntries)
        .set({ role: e.role, position: e.position, required: e.required, partial: e.required && current.partial })
        .where(eq(lineupEntries.id, current.id));
    } else {
      const task = taskById.get(e.taskId);
      if (!task) continue;
      await tx.insert(lineupEntries).values({
        id: uuidv7(),
        gameId: game.id,
        taskId: task.id,
        taskName: task.name,
        points: task.points,
        required: e.required,
        position: e.position,
        role: e.role,
      });
    }
  }
}

/** Manual first pitch. Idempotent. */
export async function lockGame(tx: Db, user: UserRow, gameId: string, now: Date): Promise<GameRow> {
  let game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  if (game.status === 'final') throw conflict('GAME_FINAL', 'This game is already final.');
  assertBuilt(game);
  game = await materializeLock(tx, game, now);
  if (game.lockedAt) return game;
  assertNotFinal(game, user, now);
  return lockNow(tx, game, now);
}

/**
 * Check off a lineup task. `clientAt` is when the device recorded it (offline replays
 * included); rules.validateCheckoff decides if it counts. The first check-off is
 * first pitch. Replaying an accepted check-off returns the game unchanged.
 */
export async function completeEntry(
  tx: Db,
  user: UserRow,
  gameId: string,
  entryId: string,
  clientAt: Date,
  now: Date,
): Promise<GameRow> {
  let game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  const entry = await loadEntry(tx, game, entryId);
  if (entry.completedClientAt) return game;
  const check = validateCheckoff({
    playedDate: game.playedDate,
    timeZone: gameTimeZone(game, user),
    gameStatus: game.status,
    role: entry.role,
    clientAt,
    receivedAt: now,
  });
  if (!check.ok) throw staleCheckoff(check.reason);

  // A check-off is first pitch unless something locked the game earlier. It counts at
  // the device time for an offline replay (never later than receipt), so an 11:58 p.m.
  // check-off synced at 12:10 a.m. doesn't record a first pitch after the day ended.
  game = await recordFirstPitch(tx, game, clientAt.getTime() < now.getTime() ? clientAt : now, now);
  await tx
    .update(lineupEntries)
    .set({ completedClientAt: clientAt, completedReceivedAt: now })
    .where(eq(lineupEntries.id, entry.id));
  return refreshScore(tx, game);
}

/** Undo a check-off, before midnight only. Idempotent. */
export async function uncompleteEntry(tx: Db, user: UserRow, gameId: string, entryId: string, now: Date): Promise<GameRow> {
  const game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  const entry = await loadEntry(tx, game, entryId);
  if (!entry.completedClientAt) return game;
  assertCheckoffWindow(game, user, entry.role, now);
  await tx
    .update(lineupEntries)
    .set({ completedClientAt: null, completedReceivedAt: null })
    .where(eq(lineupEntries.id, entry.id));
  return refreshScore(tx, game);
}

/** "Warning track": mark an incomplete must-hit as partly done (before midnight). */
export async function setPartial(
  tx: Db,
  user: UserRow,
  gameId: string,
  entryId: string,
  partial: boolean,
  now: Date,
): Promise<GameRow> {
  const game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  const entry = await loadEntry(tx, game, entryId);
  assertCheckoffWindow(game, user, entry.role, now);
  if (partial && !entry.required) {
    throw conflict('CONFLICT', 'Only a must-hit can be marked as partly done.', 'NOT_REQUIRED');
  }
  if (partial && entry.completedClientAt) {
    throw conflict('CONFLICT', 'This must-hit is already complete.', 'ALREADY_COMPLETED');
  }
  if (entry.partial !== partial) {
    await tx.update(lineupEntries).set({ partial }).where(eq(lineupEntries.id, entry.id));
  }
  return game;
}

/**
 * Add any active roster task to the game's bench, before or after first pitch, until the
 * game is final. Bench tasks only count once subbed in for a non-must-hit, so this never
 * changes what a W requires.
 */
export async function addToBench(tx: Db, user: UserRow, gameId: string, taskId: string, now: Date): Promise<GameRow> {
  const game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  if (game.status === 'final') throw conflict('GAME_FINAL', 'This game is already final.');
  assertBuilt(game);
  assertNotFinal(game, user, now);
  const [task] = await tx
    .select()
    .from(taskDefinitions)
    .where(and(eq(taskDefinitions.id, taskId), eq(taskDefinitions.userId, user.id)));
  if (!task) throw notFound('Task');
  if (task.status !== 'active') throw conflict('CONFLICT', 'Only active tasks can join the bench.', 'TASK_NOT_ACTIVE');
  const entries = await loadEntries(tx, [game.id]);
  if (entries.some((e) => e.taskId === taskId)) {
    throw conflict('CONFLICT', 'That task is already in this game.', 'ALREADY_IN_GAME');
  }
  const benchPositions = entries.filter((e) => e.role === 'bench').map((e) => e.position);
  await tx.insert(lineupEntries).values({
    id: uuidv7(),
    gameId: game.id,
    taskId: task.id,
    taskName: task.name,
    points: task.points,
    required: false,
    position: Math.max(0, ...benchPositions) + 1,
    role: 'bench',
  });
  return game;
}

/** Post-lock bench substitution: a non-required, unfinished lineup task out, a bench task in. */
export async function substitute(
  tx: Db,
  user: UserRow,
  gameId: string,
  outEntryId: string,
  inEntryId: string,
  now: Date,
): Promise<GameRow> {
  let game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  if (game.status === 'final') throw conflict('GAME_FINAL', 'This game is already final.');
  assertBuilt(game);
  assertNotFinal(game, user, now);
  game = await materializeLock(tx, game, now);
  if (!game.lockedAt) {
    throw conflict('CONFLICT', 'Substitutions start at first pitch. Before then, edit the lineup instead.', 'NOT_LOCKED');
  }
  const out = await loadEntry(tx, game, outEntryId);
  const into = await loadEntry(tx, game, inEntryId);
  if (out.role !== 'lineup') throw conflict('CONFLICT', 'Only a task in the lineup can be subbed out.', 'NOT_IN_LINEUP');
  if (out.required) {
    throw conflict('GAME_LOCKED', 'Must-hits are locked after first pitch and cannot be subbed out.', 'REQUIRED');
  }
  if (out.completedClientAt) throw conflict('CONFLICT', 'A completed task cannot be subbed out.', 'ALREADY_COMPLETED');
  if (into.role !== 'bench') throw conflict('CONFLICT', 'Only a bench task can be subbed in.', 'NOT_ON_BENCH');

  await tx.update(lineupEntries).set({ role: 'subbed_out' }).where(eq(lineupEntries.id, out.id));
  await tx
    .update(lineupEntries)
    .set({ role: 'lineup', position: out.position, required: false, partial: false, subbedInAt: now })
    .where(eq(lineupEntries.id, into.id));
  return refreshScore(tx, game);
}

/**
 * Pinch hitter (GAME_DESIGN §4a): make a roster task a must-hit in this game, today or
 * any later built day, until the game is final. A new task joins at the end of the
 * batting order; a bench or non-required lineup entry is promoted. Runs to win rises by
 * exactly its points, before or after the week's first pitch.
 */
export async function pinchHit(tx: Db, user: UserRow, gameId: string, taskId: string, now: Date): Promise<GameRow> {
  let game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  if (game.status === 'final') throw conflict('GAME_FINAL', 'This game is already final.');
  assertBuilt(game);
  assertNotFinal(game, user, now);
  game = await materializeLock(tx, game, now);
  const [task] = await tx
    .select()
    .from(taskDefinitions)
    .where(and(eq(taskDefinitions.id, taskId), eq(taskDefinitions.userId, user.id)));
  if (!task) throw notFound('Task');
  if (task.status !== 'active') throw conflict('CONFLICT', 'Only active tasks can pinch hit.', 'TASK_NOT_ACTIVE');

  const existing = (await loadEntries(tx, [game.id])).find((e) => e.taskId === taskId);
  if (existing?.role === 'lineup' && existing.required) {
    throw conflict('CONFLICT', 'That task is already a must-hit in this game.', 'ALREADY_REQUIRED');
  }
  if (existing?.role === 'subbed_out') {
    throw conflict('CONFLICT', 'A task that was subbed out cannot come back in this game.', 'SUBBED_OUT');
  }
  const raises = existing?.role !== 'lineup';
  if (raises && pinchHitThreshold(game.threshold ?? 1, existing?.points ?? task.points) > LIMITS.thresholdMax) {
    throw conflict('CONFLICT', `Runs to win can't go above ${LIMITS.thresholdMax}.`, 'THRESHOLD_MAX');
  }
  return (await addPinchHit(tx, game, task, now)).game;
}
