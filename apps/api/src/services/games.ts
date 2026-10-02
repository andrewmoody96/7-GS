// Game endpoints: pre-lock lineup edits, locking, check-offs, the "warning track"
// partial flag and post-lock substitutions (GAME_DESIGN §4, DATA_MODEL §4).

import type { LineupPatchDto } from '@7gs/contracts';
import { validateCheckoff, type CheckoffRejection } from '@7gs/rules';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, lineupEntries, taskDefinitions, type GameRow, type UserRow } from '../db/schema';
import { ApiException, conflict, validationFailed, type Issue } from '../errors';
import { uuidv7 } from '../ids';
import {
  assertBuilt,
  assertNotFinal,
  gameTimeZone,
  loadEntries,
  loadEntry,
  loadUserGame,
  lockNow,
  materializeLock,
  refreshScore,
} from './lineups';

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
  if (game.lockedAt) {
    throw conflict('GAME_LOCKED', 'First pitch has passed; the lineup, must-hits and threshold are locked.');
  }

  const set: Partial<typeof games.$inferInsert> = {};
  if (patch.threshold !== undefined) set.threshold = patch.threshold;
  if (patch.minTasks !== undefined) set.minTasks = patch.minTasks;
  if (Object.keys(set).length > 0) {
    const [row] = await tx.update(games).set(set).where(eq(games.id, game.id)).returning();
    if (row) game = row;
  }
  if (patch.entries !== undefined) await replaceEntries(tx, user, game, patch.entries);
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

  // First pitch is when the first check-off happened: the device time for an offline
  // replay (never later than receipt), so a 11:58 p.m. check-off synced at 12:10 a.m.
  // doesn't record a first pitch after the game day ended.
  const pitchAt = clientAt.getTime() < now.getTime() ? clientAt : now;
  game = await lockNow(tx, await materializeLock(tx, game, now), pitchAt);
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
