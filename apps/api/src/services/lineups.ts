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
  startOfLocalDay,
  weekday,
  type GameEvaluation,
} from '@7gs/rules';
import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dayTemplateTasks, games, lineupEntries, taskDefinitions, type EntryRow, type GameRow, type UserRow } from '../db/schema';
import { conflict, notFound } from '../errors';
import { uuidv7 } from '../ids';
import { starterFor } from './starters';

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
 * Snapshot the starter into the game (rules.buildLineup) — threshold, minimum, lock time
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

  const [claimed] = await tx
    .update(games)
    .set({
      templateId: starter.id,
      starterName: starter.name,
      threshold: starter.threshold,
      minTasks: starter.minTasks,
      lockTime: starter.lockTime ?? user.defaultLockTime,
      timeZone: user.timezone,
      lineupBuiltAt: now,
    })
    .where(and(eq(games.id, game.id), isNull(games.lineupBuiltAt)))
    .returning();
  if (!claimed) return reloadGame(tx, game.id);

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
  return refreshScore(tx, claimed);
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
