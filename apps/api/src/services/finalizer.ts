// The scheduled finalizer (DATA_MODEL §5). For each user it settles every local date
// whose `rules.finalizeAfter` (midnight + 30 min settle window) has passed, one date
// per transaction, in order:
//
//   1. finalize that date's games (rules.evaluateGame, rally deadline),
//   2. update task streaks and the series / season aggregates,
//   3. close the series on Sunday (Iron Man, bonus Rainout, series-bonus Rally token),
//   4. prepare the next day: roll seasons / Review Week, create its games and build
//      their lineups, grant the month's allowances on its first game day,
//   5. advance the user's cursor (`users.finalized_through`).
//
// Each step is keyed by user + date (cursor, unique constraints, rebuild-from-rows
// aggregates), so a re-run or a crash never double-grants or double-finalizes.

import {
  addDays,
  calendarPosition,
  finalizeAfter,
  isGameDay,
  localDateOf,
  rallyDeadline,
  type LocalDate,
} from '@7gs/rules';
import { and, eq, inArray, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, lineupEntries, loginTokens, sessions, users, type GameRow, type UserRow } from '../db/schema';
import type { Logger } from '../logger';
import { ensureMonthlyAllowances } from './allowances';
import { ensureDay, findSeriesByStart, syncSeasons } from './calendar';
import {
  buildLineupIfDue,
  buildLineupNow,
  evaluateRows,
  gameTimeZone,
  loadEntries,
  materializeLock,
  reloadGame,
} from './lineups';
import { closeSeries, recomputeSeason, recomputeSeries, recomputeTaskStreaks } from './standings';

/** Safety valve: never settle more than this many days for one user in one call. */
const MAX_DAYS_PER_CALL = 400;

export async function finalizeGame(tx: Db, user: UserRow, game: GameRow, now: Date): Promise<GameRow> {
  if (game.status === 'final') return game;
  // A game nobody opened is built now (from the current starter) and decided as played.
  let row = await buildLineupNow(tx, user, game, now);
  row = await materializeLock(tx, row, now);
  const ev = evaluateRows(row, await loadEntries(tx, [row.id]));
  const [final] = await tx
    .update(games)
    .set({
      status: 'final',
      runs: ev.runs,
      tasksDone: ev.tasksDone,
      missedRequired: ev.missedRequired,
      result: ev.result,
      resultDetail: ev.detail,
      rallyDeadline: ev.rallyEligible ? rallyDeadline(row.playedDate, gameTimeZone(row, user)) : null,
      finalizedAt: now,
    })
    .where(and(eq(games.id, row.id), ne(games.status, 'final')))
    .returning();
  return final ?? reloadGame(tx, row.id);
}

/** Calendar bookkeeping for a date: season rows and statuses, the month's allowances. */
export async function syncAccount(tx: Db, user: UserRow, date: LocalDate, now: Date): Promise<void> {
  await syncSeasons(tx, user, date, now);
  if (isGameDay(user.startDate, date)) await ensureMonthlyAllowances(tx, user, date, now);
}

/** Prepare a day that has started: games exist, lineups built, scheduled locks applied. */
export async function prepareDay(tx: Db, user: UserRow, date: LocalDate, now: Date): Promise<GameRow[]> {
  await syncAccount(tx, user, date, now);
  const prepared: GameRow[] = [];
  for (const game of await ensureDay(tx, user, date, now)) {
    prepared.push(await materializeLock(tx, await buildLineupIfDue(tx, user, game, now), now));
  }
  return prepared;
}

/**
 * Settle one local date for a user. Returns false (and changes nothing that matters)
 * when a game on that date isn't ready yet — e.g. it started in a zone that is still
 * before its settle time after the user travelled.
 */
export async function settleDate(tx: Db, user: UserRow, date: LocalDate, now: Date): Promise<boolean> {
  const dayGames = await ensureDay(tx, user, date, now);
  for (const game of dayGames) {
    if (game.status === 'final') continue;
    if (finalizeAfter(date, gameTimeZone(game, user)).getTime() > now.getTime()) return false;
  }

  const finalized: GameRow[] = [];
  for (const game of dayGames) finalized.push(await finalizeGame(tx, user, game, now));

  if (finalized.length > 0) {
    const appearances = await tx
      .select({ taskId: lineupEntries.taskId })
      .from(lineupEntries)
      .where(
        and(
          inArray(
            lineupEntries.gameId,
            finalized.map((g) => g.id),
          ),
          eq(lineupEntries.role, 'lineup'),
        ),
      );
    await recomputeTaskStreaks(
      tx,
      appearances.map((a) => a.taskId),
    );
    for (const seriesId of new Set(finalized.map((g) => g.seriesId))) {
      const row = await recomputeSeries(tx, seriesId);
      await recomputeSeason(tx, row.seasonId);
    }
  }

  const pos = calendarPosition(user.startDate, date);
  if (pos.phase === 'season' && pos.gameNumber === 7) {
    const row = await findSeriesByStart(tx, user.id, pos.seriesStart);
    if (row) await closeSeries(tx, user, row.id, now);
  }

  // `date` has ended in the user's zone, so the next day has started.
  await prepareDay(tx, user, addDays(date, 1), now);
  return true;
}

/** Settle every date that is due for one user. Returns how many dates were settled. */
export async function catchUpUser(db: Db, userId: string, now: Date): Promise<number> {
  let settled = 0;
  for (let i = 0; i < MAX_DAYS_PER_CALL; i++) {
    const progressed = await db.transaction(async (tx) => {
      // Lock the user so the interval job and a request never settle the same day twice.
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user) return false;
      const next = addDays(user.finalizedThrough, 1);
      if (finalizeAfter(next, user.timezone).getTime() > now.getTime()) return false;
      if (!(await settleDate(tx, user, next, now))) return false;
      await tx.update(users).set({ finalizedThrough: next }).where(eq(users.id, user.id));
      return true;
    });
    if (!progressed) break;
    settled++;
  }
  return settled;
}

/** Cheap check (no query) for whether a user has a date due for settling. */
export function hasDueDate(user: Pick<UserRow, 'finalizedThrough' | 'timezone'>, now: Date): boolean {
  return finalizeAfter(addDays(user.finalizedThrough, 1), user.timezone).getTime() <= now.getTime();
}

export interface FinalizerReport {
  usersChecked: number;
  datesSettled: number;
  failures: number;
  expiredCredentialsDeleted: number;
}

/**
 * Run the finalizer for every user with a date due as of `now`. Idempotent: running it
 * again with the same `now` changes nothing. Also prunes expired login links and sessions.
 */
export async function runFinalizer(deps: { db: Db; log: Logger }, now: Date): Promise<FinalizerReport> {
  const deletedTokens = await deps.db
    .delete(loginTokens)
    .where(lt(loginTokens.expiresAt, now))
    .returning({ hash: loginTokens.tokenHash });
  const deletedSessions = await deps.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ hash: sessions.idHash });

  // No zone is more than a day ahead of UTC, so a user whose cursor has reached the
  // UTC date has nothing due.
  const utcToday = localDateOf(now, 'UTC');
  const candidates = await deps.db
    .select({ id: users.id, finalizedThrough: users.finalizedThrough, timezone: users.timezone })
    .from(users)
    .where(lt(users.finalizedThrough, utcToday));

  const report: FinalizerReport = {
    usersChecked: 0,
    datesSettled: 0,
    failures: 0,
    expiredCredentialsDeleted: deletedTokens.length + deletedSessions.length,
  };
  for (const user of candidates) {
    if (!hasDueDate(user, now)) continue;
    report.usersChecked++;
    try {
      report.datesSettled += await catchUpUser(deps.db, user.id, now);
    } catch (error) {
      report.failures++;
      deps.log.error('finalizer: user failed', { userId: user.id, error: String(error) });
    }
  }
  return report;
}
