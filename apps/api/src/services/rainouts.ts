// Rainouts (GAME_DESIGN §7): a game called off before first pitch becomes slot 2 of a
// doubleheader later in the same series. Eligibility and makeup dates come from
// rules.rainoutOptions; the server only applies the move.

import type { RainoutQuoteDto } from '@7gs/contracts';
import { localDateOf, rainoutOptions, type RainoutGame, type RainoutIneligibleReason } from '@7gs/rules';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, rainoutAllowances, type GameRow, type SeriesRow, type UserRow } from '../db/schema';
import { conflict, type ApiException } from '../errors';
import { availableRainouts } from './allowances';
import { loadUserGame, materializeLock } from './lineups';
import { loadUserSeries } from './seasons';

function toRainoutGame(game: GameRow): RainoutGame {
  return {
    id: game.id,
    scheduledDate: game.scheduledDate,
    playedDate: game.playedDate,
    postponed: game.postponed,
    suspended: game.suspended,
    status: game.status,
    lockedAt: game.lockedAt,
  };
}

const REJECTIONS: Record<RainoutIneligibleReason, () => ApiException> = {
  GAME_FINAL: () => conflict('GAME_FINAL', 'This game is already final.', 'GAME_FINAL'),
  GAME_LOCKED: () => conflict('GAME_LOCKED', 'First pitch has passed; this game must be played.', 'GAME_LOCKED'),
  MAKEUP_GAME: () => conflict('NOT_ELIGIBLE', 'A makeup game cannot be rained out again.', 'MAKEUP_GAME'),
  SUNDAY: () => conflict('NOT_ELIGIBLE', 'No dates left in the series.', 'SUNDAY'),
  PAST_GAME: () => conflict('NOT_ELIGIBLE', 'This game day has already passed.', 'PAST_GAME'),
  NO_ALLOWANCE: () => conflict('NO_ALLOWANCE', 'No Rainouts left this month.', 'NO_ALLOWANCE'),
  NO_MAKEUP_DATES: () => conflict('NOT_ELIGIBLE', 'No dates left in the series.', 'NO_MAKEUP_DATES'),
};

async function seriesGamesFor(tx: Db, seriesId: string, forUpdate: boolean): Promise<GameRow[]> {
  const query = tx.select().from(games).where(eq(games.seriesId, seriesId)).orderBy(asc(games.gameNumber));
  return forUpdate ? query.for('update') : query;
}

async function quote(tx: Db, user: UserRow, game: GameRow, now: Date, forUpdate: boolean) {
  const today = localDateOf(now, user.timezone);
  const siblings = await seriesGamesFor(tx, game.seriesId, forUpdate);
  const available = await availableRainouts(tx, user.id, today);
  const options = rainoutOptions({
    game: toRainoutGame(game),
    seriesGames: siblings.map((g) => (g.id === game.id ? toRainoutGame(game) : toRainoutGame(g))),
    allowancesAvailable: available.all.length,
    today,
  });
  return { options, available };
}

export async function rainoutQuote(tx: Db, user: UserRow, gameId: string, now: Date): Promise<RainoutQuoteDto> {
  const game = await materializeLock(tx, await loadUserGame(tx, user.id, gameId), now);
  const { options, available } = await quote(tx, user, game, now, false);
  return {
    ok: options.ok,
    reason: options.ok ? null : options.reason,
    makeupDates: options.ok ? options.makeupDates : [],
    allowancesAvailable: available.all.length,
  };
}

/**
 * Call a Rainout: uses an allowance (this month's first, then the Iron Man bonus) and
 * moves the game to `makeupDate` as slot 2. A built lineup moves with it (GAME_DESIGN
 * §7: same must-hits, runs to win, pinch hitters and one-offs); an unbuilt game is built
 * from its original starter when it is played or planned.
 */
export async function callRainout(
  tx: Db,
  user: UserRow,
  gameId: string,
  makeupDate: string,
  now: Date,
): Promise<SeriesRow> {
  const game = await materializeLock(tx, await loadUserGame(tx, user.id, gameId, { forUpdate: true }), now);
  const { options, available } = await quote(tx, user, game, now, true);
  if (!options.ok) throw REJECTIONS[options.reason]();
  if (!options.makeupDates.includes(makeupDate)) {
    throw conflict('INVALID_MAKEUP_DATE', `Pick a makeup date later in this series: ${options.makeupDates.join(', ')}.`);
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

  await tx
    .update(games)
    .set({ postponed: true, slot: 2, playedDate: makeupDate, lockedAt: null, status: 'scheduled' })
    .where(eq(games.id, game.id));
  return loadUserSeries(tx, user.id, game.seriesId);
}
