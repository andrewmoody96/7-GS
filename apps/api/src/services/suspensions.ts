// Suspended games (GAME_DESIGN §7): for emergencies, during the game's day or until noon
// the next day. Progress is kept and the game resumes later in the series as slot 2 of a
// doubleheader; with no day left it ends as a no-decision. Either way it uses one
// Rainout from the shared allowance. Eligibility and dates come from
// rules.suspensionOptions; the server only applies the move.

import type { SuspensionQuoteDto } from '@7gs/contracts';
import {
  localDateOf,
  suspensionOptions,
  type SuspensionGame,
  type SuspensionIneligibleReason,
} from '@7gs/rules';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, rainoutAllowances, rallyRolls, series, type GameRow, type SeriesRow, type UserRow } from '../db/schema';
import { conflict, type ApiException } from '../errors';
import { availableRainouts } from './allowances';
import { iso } from './dto';
import { evaluateRows, gameTimeZone, loadEntries, loadUserGame, materializeLock, refreshScore, reloadGame } from './lineups';
import { loadUserSeries } from './seasons';
import { closeSeries, recomputeSeason, recomputeSeries, recomputeTaskStreaks } from './standings';

function toSuspensionGame(game: GameRow): SuspensionGame {
  return {
    id: game.id,
    scheduledDate: game.scheduledDate,
    playedDate: game.playedDate,
    status: game.status,
    result: game.result,
    postponed: game.postponed,
    suspended: game.suspended,
  };
}

const REJECTIONS: Record<SuspensionIneligibleReason, () => ApiException> = {
  FUTURE_GAME: () =>
    conflict('NOT_ELIGIBLE', "This game day hasn't started yet; call a Rainout to plan around it.", 'FUTURE_GAME'),
  GAME_WON: () => conflict('NOT_ELIGIBLE', 'This game was a win.', 'GAME_WON'),
  NO_DECISION: () => conflict('NOT_ELIGIBLE', 'This game already ended with no decision.', 'NO_DECISION'),
  WINDOW_CLOSED: () =>
    conflict('NOT_ELIGIBLE', 'Suspensions close at noon the day after the game.', 'WINDOW_CLOSED'),
  RALLY_ROLLED: () => conflict('NOT_ELIGIBLE', 'This game already had its Rally Cap roll.', 'RALLY_ROLLED'),
  NO_ALLOWANCE: () => conflict('NO_ALLOWANCE', 'No Rainouts left this month.', 'NO_ALLOWANCE'),
};

async function quote(tx: Db, user: UserRow, game: GameRow, now: Date, forUpdate: boolean) {
  const today = localDateOf(now, user.timezone);
  const siblingsQuery = tx.select().from(games).where(eq(games.seriesId, game.seriesId)).orderBy(asc(games.gameNumber));
  const siblings = forUpdate ? await siblingsQuery.for('update') : await siblingsQuery;
  const available = await availableRainouts(tx, user.id, today);
  const [roll] = await tx.select({ id: rallyRolls.id }).from(rallyRolls).where(eq(rallyRolls.gameId, game.id));
  const options = suspensionOptions({
    game: toSuspensionGame(game),
    seriesGames: siblings.map((g) => toSuspensionGame(g.id === game.id ? game : g)),
    allowancesAvailable: available.all.length,
    rallyRolled: roll !== undefined,
    today,
    now,
    timeZone: gameTimeZone(game, user),
  });
  return { options, available };
}

export async function suspensionQuote(tx: Db, user: UserRow, gameId: string, now: Date): Promise<SuspensionQuoteDto> {
  const game = await materializeLock(tx, await loadUserGame(tx, user.id, gameId), now);
  const { options, available } = await quote(tx, user, game, now, false);
  return {
    ok: options.ok,
    reason: options.ok ? null : options.reason,
    resumeDates: options.ok ? options.resumeDates : [],
    deadline: options.ok ? iso(options.deadline) : null,
    allowancesAvailable: available.all.length,
  };
}

/**
 * Suspend a game. With `resumeDate` (one of the quote's dates) it moves there as slot 2
 * and keeps its entries, check-offs, must-hits and runs to win. With null (only when no
 * day is left) it ends final with no decision. A final L suspended the next morning has
 * its effects undone: series and season aggregates, streaks, the Rally Cap window, and
 * a closed series' bonuses are recomputed.
 */
export async function suspendGame(
  tx: Db,
  user: UserRow,
  gameId: string,
  resumeDate: string | null,
  now: Date,
): Promise<SeriesRow> {
  const game = await materializeLock(tx, await loadUserGame(tx, user.id, gameId, { forUpdate: true }), now);
  const { options, available } = await quote(tx, user, game, now, true);
  if (!options.ok) throw REJECTIONS[options.reason]();
  if (resumeDate === null && options.resumeDates.length > 0) {
    throw conflict(
      'INVALID_MAKEUP_DATE',
      `Pick a day later in this series to resume: ${options.resumeDates.join(', ')}.`,
      'RESUME_DATE_REQUIRED',
    );
  }
  if (resumeDate !== null && !options.resumeDates.includes(resumeDate)) {
    throw conflict(
      'INVALID_MAKEUP_DATE',
      options.resumeDates.length > 0
        ? `Pick a day later in this series to resume: ${options.resumeDates.join(', ')}.`
        : 'No days are left in this series; the game ends with no decision.',
    );
  }

  const allowance = available.all[0];
  const [claimed] = allowance
    ? await tx
        .update(rainoutAllowances)
        .set({ usedGameId: game.id, usedAt: now })
        .where(and(eq(rainoutAllowances.id, allowance.id), isNull(rainoutAllowances.usedGameId)))
        .returning()
    : [];
  if (!claimed) throw REJECTIONS.NO_ALLOWANCE();

  const wasFinal = game.status === 'final';
  if (resumeDate !== null) {
    await tx
      .update(games)
      .set({
        suspended: true,
        slot: 2,
        playedDate: resumeDate,
        status: game.lockedAt ? 'live' : 'scheduled',
        result: null,
        resultDetail: null,
        rallyDeadline: null,
        finalizedAt: null,
      })
      .where(eq(games.id, game.id));
    await refreshScore(tx, await reloadGame(tx, game.id));
  } else {
    const ev = evaluateRows(game, await loadEntries(tx, [game.id]));
    await tx
      .update(games)
      .set({
        status: 'final',
        runs: ev.runs,
        tasksDone: ev.tasksDone,
        missedRequired: ev.missedRequired,
        result: null,
        resultDetail: 'suspended',
        rallyDeadline: null,
        finalizedAt: now,
      })
      .where(eq(games.id, game.id));
  }

  if (wasFinal) {
    const entries = await loadEntries(tx, [game.id]);
    await recomputeTaskStreaks(
      tx,
      entries.filter((e) => e.role === 'lineup').map((e) => e.taskId),
    );
  }
  const updated = await recomputeSeries(tx, game.seriesId);
  await recomputeSeason(tx, updated.seasonId);
  if (updated.closedAt) {
    const closed = await closeSeries(tx, user, updated.id, now);
    // A no-decision denies Iron Man: take back a bonus Rainout this series earned, unless
    // it has been used already.
    if (!closed.ironMan) {
      await tx
        .delete(rainoutAllowances)
        .where(
          and(
            eq(rainoutAllowances.seriesId, closed.id),
            eq(rainoutAllowances.source, 'iron_man'),
            isNull(rainoutAllowances.usedGameId),
          ),
        );
    }
  }
  const [row] = await tx.select().from(series).where(eq(series.id, game.seriesId));
  return row ?? loadUserSeries(tx, user.id, game.seriesId);
}
