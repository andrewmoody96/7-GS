// Game-state mechanics shared by the request path and the finalizer: building a game's
// lineup at the start of its played day, keeping the live score, and locking.
//
// Status lifecycle: `scheduled` (lineup editable) → `live` (first pitch: manual lock,
// first check-off, or the scheduled lock time passing) → `final` (finalizer).

import {
  buildLineup,
  effectiveLockedAt,
  endOfLocalDay,
  evaluateGame,
  LIMITS,
  lineupThreshold,
  pinchHitThreshold,
  startOfLocalDay,
  weekday,
  type GameEvaluation,
  type LocalDate,
} from '@7gs/rules';
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  dayTemplateTasks,
  games,
  lineupEntries,
  taskDefinitions,
  type EntryRow,
  type GameRow,
  type TaskRow,
  type UserRow,
  ilHolds,
} from '../db/schema';
import { conflict, notFound } from '../errors';
import { uuidv7 } from '../ids';
import { starterFor } from './starters';
import { recordHolds, type HeldSpot } from './ilHolds';
import { seriesGames } from './standings';
import { weekLockOf } from './weeks';

export async function loadUserGame(
  tx: Db,
  userId: string,
  gameId: string,
  options: { forUpdate?: boolean } = {},
): Promise<GameRow> {
  const query = tx
    .select()
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.userId, userId)));
  const [row] = options.forUpdate ? await query.for('update') : await query;
  if (!row) throw notFound('Game');
  return row;
}

export async function reloadGame(tx: Db, gameId: string): Promise<GameRow> {
  const [row] = await tx.select().from(games).where(eq(games.id, gameId));
  if (!row) throw notFound('Game');
  return row;
}

export async function loadEntry(tx: Db, game: GameRow, entryId: string): Promise<EntryRow> {
  const [row] = await tx
    .select()
    .from(lineupEntries)
    .where(and(eq(lineupEntries.id, entryId), eq(lineupEntries.gameId, game.id)));
  if (!row) throw notFound('Lineup entry');
  return row;
}

export function loadEntries(tx: Db, gameIds: string[]): Promise<EntryRow[]> {
  if (gameIds.length === 0) return Promise.resolve([]);
  return tx.select().from(lineupEntries).where(inArray(lineupEntries.gameId, gameIds));
}

/** The zone a game is played in: its snapshot once built (travel rule), else the user's. */
export function gameTimeZone(game: GameRow, user: UserRow): string {
  return game.timeZone ?? user.timezone;
}

export function isDayOver(game: GameRow, user: UserRow, now: Date): boolean {
  return now.getTime() >= endOfLocalDay(game.playedDate, gameTimeZone(game, user)).getTime();
}

export function hasDayStarted(game: GameRow, user: UserRow, now: Date): boolean {
  return now.getTime() >= startOfLocalDay(game.playedDate, gameTimeZone(game, user)).getTime();
}

export function evaluateRows(game: GameRow, entries: readonly EntryRow[]): GameEvaluation {
  return evaluateGame(
    entries.map((e) => ({
      points: e.points,
      required: e.required,
      role: e.role,
      completed: e.completedClientAt !== null,
      partial: e.partial,
    })),
    { threshold: game.threshold ?? 1, minTasks: game.minTasks },
  );
}

/** Store the live score (runs, tasks done, must-hits still open) on a non-final game. */
/**
 * Close gaps in the batting order and bench after entries leave (IL, retirement), so
 * positions read 1, 2, 3. A subbed-out entry shares its replacement's position (that's
 * how the box score pairs them), so it moves with it.
 */
export async function compactPositions(tx: Db, gameId: string): Promise<void> {
  const entries = await loadEntries(tx, [gameId]);
  for (const role of ['lineup', 'bench'] as const) {
    const list = entries.filter((e) => e.role === role).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
    const moved = new Map<number, number>();
    for (const [i, e] of list.entries()) {
      if (e.position === i + 1) continue;
      moved.set(e.position, i + 1);
      await tx.update(lineupEntries).set({ position: i + 1 }).where(eq(lineupEntries.id, e.id));
    }
    if (role !== 'lineup' || moved.size === 0) continue;
    for (const out of entries.filter((e) => e.role === 'subbed_out')) {
      const to = moved.get(out.position);
      if (to !== undefined) await tx.update(lineupEntries).set({ position: to }).where(eq(lineupEntries.id, out.id));
    }
  }
}

export async function refreshScore(tx: Db, game: GameRow): Promise<GameRow> {
  if (game.status === 'final') return game;
  const ev = evaluateRows(game, await loadEntries(tx, [game.id]));
  if (ev.runs === game.runs && ev.tasksDone === game.tasksDone && ev.missedRequired === game.missedRequired) {
    return game;
  }
  const [row] = await tx
    .update(games)
    .set({ runs: ev.runs, tasksDone: ev.tasksDone, missedRequired: ev.missedRequired })
    .where(eq(games.id, game.id))
    .returning();
  return row ?? game;
}

/**
 * Snapshot the starter into the game (rules.buildLineup) — runs to win from its lineup, lock time
 * (falling back to the user's default) and the time zone — even if the day is past
 * (the finalizer builds never-opened games before deciding them).
 */
export async function buildLineupNow(tx: Db, user: UserRow, game: GameRow, now: Date): Promise<GameRow> {
  if (game.lineupBuiltAt) return game;
  // A makeup game keeps its original starter (GAME_DESIGN §7: "Game B is the postponed starter").
  const starter = await starterFor(tx, user, weekday(game.scheduledDate), now);
  const slots = await tx.select().from(dayTemplateTasks).where(eq(dayTemplateTasks.templateId, starter.id));
  const roster =
    slots.length === 0
      ? []
      : await tx
          .select({
            id: taskDefinitions.id,
            name: taskDefinitions.name,
            points: taskDefinitions.points,
            status: taskDefinitions.status,
          })
          .from(taskDefinitions)
          .where(
            and(
              eq(taskDefinitions.userId, user.id),
              inArray(
                taskDefinitions.id,
                slots.map((s) => s.taskId),
              ),
            ),
          );
  const snapshot = buildLineup(
    slots.map((s) => ({ taskId: s.taskId, position: s.position, required: s.required, role: s.role })),
    roster,
  );

  // Runs to win from the lineup (rules.lineupThreshold). Spots held for tasks on the IL
  // count, so the IL never lowers the bar.
  const threshold = lineupThreshold(
    slots
      .filter((s) => s.role === 'lineup')
      .map((s) => ({ slot: s, task: roster.find((t) => t.id === s.taskId) }))
      .filter((x) => x.task && (x.task.status === 'active' || x.task.status === 'injured'))
      .map((x) => ({ points: x.task!.points, required: x.slot.required })),
  );
  const [claimed] = await tx
    .update(games)
    .set({
      templateId: starter.id,
      starterName: starter.name,
      threshold,
      minTasks: null,
      lockTime: starter.lockTime ?? user.defaultLockTime,
      timeZone: user.timezone,
      lineupBuiltAt: now,
    })
    .where(and(eq(games.id, game.id), isNull(games.lineupBuiltAt)))
    .returning();
  if (!claimed) return reloadGame(tx, game.id);

  // Slots whose task is on the IL become holds, so activation can return it here.
  const held: HeldSpot[] = [];
  for (const role of ['lineup', 'bench'] as const) {
    const ordered = slots
      .filter((s) => s.role === role)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ slot: s, task: roster.find((t) => t.id === s.taskId) }))
      .filter((x) => x.task && (x.task.status === 'active' || x.task.status === 'injured'));
    ordered.forEach(({ slot, task }, i) => {
      if (task?.status !== 'injured') return;
      held.push({ taskId: task.id, taskName: task.name, points: task.points, required: slot.required, position: i + 1, role });
    });
  }
  await recordHolds(tx, user.id, claimed.id, held, now);

  if (snapshot.length > 0) {
    await tx.insert(lineupEntries).values(
      snapshot.map((e) => ({
        id: uuidv7(),
        gameId: claimed.id,
        taskId: e.taskId,
        taskName: e.taskName,
        points: e.points,
        required: e.required,
        position: e.position,
        role: e.role,
      })),
    );
  }
  // Missed one-off must-hits waiting for the next game join as pinch hitters (§4a).
  return applyCarryovers(tx, user, await refreshScore(tx, claimed), now);
}

export type PinchHitOutcome = 'added' | 'promoted' | 'required' | 'already_required';

/**
 * Make `task` a must-hit in `game` as a pinch hitter (GAME_DESIGN §4a): a new lineup
 * entry at the end of the batting order, or a bench entry promoted. Runs to win rises by
 * exactly its points (rules.pinchHitThreshold), because those runs are new to the lineup;
 * a day that was already out of reach restarts from what its lineup could score.
 * A non-required lineup entry just becomes required: its runs were already available, so
 * runs to win stays put and the cushion is unchanged. An entry
 * that is already a must-hit is left as it is (only marked `carriedOver` when asked), so
 * a task is never in a game twice. Callers check the game is still open.
 *
 * With `required: false` the task joins (or comes off the bench) as a regular lineup
 * task instead. Callers only allow that for a later day, and never for a task that is
 * already batting.
 *
 * Before the week's first pitch (`weekLocked: false`) the day is still being planned, so
 * runs to win is simply worked out again from the lineup (rules.lineupThreshold). Once the
 * week is locked, only a new must-hit raises it (rules.pinchHitThreshold); a regular task
 * or an existing task becoming a must-hit leaves it where it is.
 */
export async function addPinchHit(
  tx: Db,
  game: GameRow,
  task: Pick<TaskRow, 'id' | 'name' | 'points'>,
  now: Date,
  options: { carriedOver?: boolean; required?: boolean; weekLocked: boolean },
): Promise<{ game: GameRow; outcome: PinchHitOutcome }> {
  const carriedOver = options.carriedOver ?? false;
  const weekLocked = options.weekLocked;
  const required = options.required ?? true;
  const entries = await loadEntries(tx, [game.id]);
  const existing = entries.find((e) => e.taskId === task.id);
  if (existing && existing.role === 'lineup' && existing.required) {
    if (carriedOver && !existing.carriedOver) {
      await tx.update(lineupEntries).set({ carriedOver: true }).where(eq(lineupEntries.id, existing.id));
    }
    return { game, outcome: 'already_required' };
  }

  const nextPosition = Math.max(0, ...entries.filter((e) => e.role === 'lineup').map((e) => e.position)) + 1;
  // What the lineup could score, counting spots held for tasks on the IL (they come back).
  const held = await tx.select({ points: ilHolds.points }).from(ilHolds).where(and(eq(ilHolds.gameId, game.id), eq(ilHolds.role, 'lineup')));
  const lineupRuns = [...entries.filter((e) => e.role === 'lineup'), ...held].reduce((sum, e) => sum + e.points, 0);
  const points = existing?.points ?? task.points;
  let outcome: PinchHitOutcome;
  if (!existing) {
    outcome = 'added';
    await tx.insert(lineupEntries).values({
      id: uuidv7(),
      gameId: game.id,
      taskId: task.id,
      taskName: task.name,
      points,
      required,
      position: nextPosition,
      role: 'lineup',
      pinchHitAt: now,
      carriedOver,
    });
  } else if (existing.role === 'lineup') {
    await tx
      .update(lineupEntries)
      .set({ required: true, carriedOver: existing.carriedOver || carriedOver })
      .where(eq(lineupEntries.id, existing.id));
    if (weekLocked) return { game: await refreshScore(tx, game), outcome: 'required' };
    outcome = 'required';
  } else {
    outcome = 'promoted';
    await tx
      .update(lineupEntries)
      .set({
        role: 'lineup',
        required,
        position: nextPosition,
        partial: false,
        pinchHitAt: now,
        carriedOver: existing.carriedOver || carriedOver,
      })
      .where(eq(lineupEntries.id, existing.id));
  }
  const threshold = !weekLocked
    ? await plannedThreshold(tx, game.id)
    : required
      ? Math.min(LIMITS.thresholdMax, pinchHitThreshold(game.threshold ?? 1, points, lineupRuns))
      : (game.threshold ?? 1);
  const [row] = await tx.update(games).set({ threshold }).where(eq(games.id, game.id)).returning();
  return { game: await refreshScore(tx, row ?? (await reloadGame(tx, game.id))), outcome };
}

/** Runs to win for a day still being planned: from its lineup, IL-held spots included. */
export async function plannedThreshold(tx: Db, gameId: string): Promise<number> {
  const entries = (await loadEntries(tx, [gameId])).filter((e) => e.role === 'lineup');
  const held = await tx
    .select({ points: ilHolds.points, required: ilHolds.required })
    .from(ilHolds)
    .where(and(eq(ilHolds.gameId, gameId), eq(ilHolds.role, 'lineup')));
  return Math.min(LIMITS.thresholdMax, lineupThreshold([...entries, ...held]));
}

/** Whether `game`'s week has had its first pitch (then lineups only grow). */
export async function isWeekLocked(tx: Db, user: UserRow, game: GameRow, now: Date): Promise<boolean> {
  if (game.lockedAt) return true;
  const siblings = (await seriesGames(tx, game.seriesId)).map((g) => (g.id === game.id ? game : g));
  return weekLockOf(siblings, user, now) !== null;
}

/**
 * Add every one-off flagged `carryover` (a missed must-hit) to `game` as a carried-over
 * pinch hitter and clear the flag. Injured tasks keep the flag until they're back.
 */
export async function applyCarryovers(tx: Db, user: UserRow, game: GameRow, now: Date): Promise<GameRow> {
  if (game.status === 'final' || !game.lineupBuiltAt) return game;
  const pending = await tx
    .select()
    .from(taskDefinitions)
    .where(and(eq(taskDefinitions.userId, user.id), eq(taskDefinitions.carryover, true)))
    .orderBy(asc(taskDefinitions.createdAt), asc(taskDefinitions.id));
  let current = game;
  for (const task of pending) {
    if (task.status === 'injured') continue;
    if (task.status === 'active') {
      const weekLocked = await isWeekLocked(tx, user, current, now);
      current = (await addPinchHit(tx, current, task, now, { carriedOver: true, weekLocked })).game;
    }
    await tx.update(taskDefinitions).set({ carryover: false, updatedAt: now }).where(eq(taskDefinitions.id, task.id));
  }
  return current;
}

/**
 * Apply pending carryovers to the next built, non-final game on `from` or later. With
 * none built yet, the flags stay and the next lineup built picks them up.
 */
export async function applyCarryoversFrom(tx: Db, user: UserRow, from: LocalDate, now: Date): Promise<void> {
  const [target] = await tx
    .select()
    .from(games)
    .where(
      and(
        eq(games.userId, user.id),
        gte(games.playedDate, from),
        isNotNull(games.lineupBuiltAt),
        ne(games.status, 'final'),
      ),
    )
    .orderBy(asc(games.playedDate), asc(games.slot))
    .limit(1);
  if (target) await applyCarryovers(tx, user, target, now);
}

/** Build the lineup once its played day has started (in the user's zone). */
export async function buildLineupIfDue(tx: Db, user: UserRow, game: GameRow, now: Date): Promise<GameRow> {
  if (game.lineupBuiltAt || game.status === 'final' || !hasDayStarted(game, user, now)) return game;
  return buildLineupNow(tx, user, game, now);
}

/** rules.effectiveLockedAt: the recorded lock, or the scheduled lock time once passed. */
export function effectiveLock(game: GameRow, now: Date): Date | null {
  if (!game.lineupBuiltAt || !game.timeZone) return null;
  return effectiveLockedAt({
    lockedAt: game.lockedAt,
    playedDate: game.playedDate,
    lockTime: game.lockTime,
    timeZone: game.timeZone,
    now,
  });
}

/** Persist a lock that happened because the scheduled first-pitch time passed. */
export async function materializeLock(tx: Db, game: GameRow, now: Date): Promise<GameRow> {
  if (game.status !== 'scheduled') return game;
  const at = effectiveLock(game, now);
  if (!at) return game;
  const [row] = await tx
    .update(games)
    .set({ lockedAt: at, status: 'live' })
    .where(and(eq(games.id, game.id), eq(games.status, 'scheduled')))
    .returning();
  return row ?? reloadGame(tx, game.id);
}

/**
 * Record a check-off as a lock event. First pitch is the earliest lock event (manual
 * lock, check-off, or the scheduled time once passed), so an offline check-off that
 * syncs late can move an already-recorded lock earlier.
 */
export async function recordFirstPitch(tx: Db, game: GameRow, at: Date, now: Date): Promise<GameRow> {
  const current = effectiveLock(game, now);
  const lockAt = current && current.getTime() <= at.getTime() ? current : at;
  if (game.lockedAt?.getTime() === lockAt.getTime() && game.status === 'live') return game;
  const [row] = await tx
    .update(games)
    .set({ lockedAt: lockAt, status: 'live' })
    .where(and(eq(games.id, game.id), ne(games.status, 'final')))
    .returning();
  return row ?? reloadGame(tx, game.id);
}

/** First pitch at `at` (manual lock or first check-off), unless already locked. */
export async function lockNow(tx: Db, game: GameRow, at: Date): Promise<GameRow> {
  if (game.lockedAt) return game;
  const [row] = await tx
    .update(games)
    .set({ lockedAt: at, status: 'live' })
    .where(and(eq(games.id, game.id), isNull(games.lockedAt), eq(games.status, 'scheduled')))
    .returning();
  return row ?? reloadGame(tx, game.id);
}

export function assertBuilt(game: GameRow): void {
  if (!game.lineupBuiltAt) {
    throw conflict(
      'CONFLICT',
      "This game's lineup is set at the start of its game day. Edit the starter to change it before then.",
      'NOT_STARTED',
    );
  }
}

export function assertNotFinal(game: GameRow, user: UserRow, now: Date): void {
  if (game.status === 'final') throw conflict('GAME_FINAL', 'This game is already final.');
  if (isDayOver(game, user, now)) {
    throw conflict('GAME_FINAL', 'The game day is over; the result is being finalized.', 'DAY_OVER');
  }
}

/**
 * Built games that are still pre-lock (after persisting any lock whose time passed).
 * Roster changes (renames, points, IL, retirement) are applied to these, since their
 * lineups are still editable.
 */
export async function openGames(tx: Db, user: UserRow, now: Date): Promise<GameRow[]> {
  const rows = await tx
    .select()
    .from(games)
    .where(and(eq(games.userId, user.id), eq(games.status, 'scheduled'), isNotNull(games.lineupBuiltAt)));
  const open: GameRow[] = [];
  for (const row of rows) {
    const game = await materializeLock(tx, row, now);
    if (game.status === 'scheduled' && !isDayOver(game, user, now)) open.push(game);
  }
  return open;
}
