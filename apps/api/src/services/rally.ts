// Rally Cap (GAME_DESIGN §6). Eligibility and odds come from the rules package; the
// roll is made here with a CSPRNG, once per game ever, and a hit flips the game to
// W (rally) and refreshes the series and season immediately (DATA_MODEL §5).

import type { RallyQuoteDto } from '@7gs/contracts';
import {
  currentWinStreak,
  isGameDay,
  isRallyHit,
  localDateOf,
  monthKey,
  rallyEligibility,
  rallyOdds,
  type GameResult,
  type RallyEligibility,
  type RallyIneligibleReason,
  type RallyOdds,
} from '@7gs/rules';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, rallyRolls, rallyTokens, series, type GameRow, type RallyRollRow, type UserRow } from '../db/schema';
import { conflict, notFound, type ApiException } from '../errors';
import { uuidv7 } from '../ids';
import { availableRallyTokens } from './allowances';
import { iso } from './dto';
import { evaluateRows, loadEntries, loadUserGame, reloadGame } from './lineups';
import { closeSeries, recomputeSeason, recomputeSeries, seasonFinalGames, seriesRallyUsed } from './standings';

/** Percentile dice: an integer from 1 to 100. Injected so tests can force hits and misses. */
export type RollDice = () => number;

const REJECTIONS: Record<RallyIneligibleReason, () => ApiException> = {
  OUT_OF_SEASON: () => conflict('OUT_OF_SEASON', 'Rally Caps can only be used during the season.', 'OUT_OF_SEASON'),
  GAME_NOT_FINAL: () => conflict('NOT_ELIGIBLE', 'Rally Caps open once the game is final.', 'GAME_NOT_FINAL'),
  GAME_WON: () => conflict('NOT_ELIGIBLE', 'This game was a win.', 'GAME_WON'),
  TOO_MANY_MISSED: () => conflict('NOT_ELIGIBLE', 'Two or more missed must-hits cannot be appealed.', 'TOO_MANY_MISSED'),
  WINDOW_CLOSED: () => conflict('NOT_ELIGIBLE', 'The Rally Cap window closed at noon the day after the game.', 'WINDOW_CLOSED'),
  ALREADY_ROLLED: () => conflict('NOT_ELIGIBLE', 'This game already had its Rally Cap roll.', 'ALREADY_ROLLED'),
  SERIES_LIMIT: () => conflict('NOT_ELIGIBLE', 'Only one Rally Cap per series.', 'SERIES_LIMIT'),
  NO_TOKEN: () => conflict('NO_ALLOWANCE', 'No Rally Cap tokens left this month.', 'NO_TOKEN'),
};

/** Consecutive wins before `game`, counting only games of its season (GAME_DESIGN §6). */
export async function seasonWinStreakBefore(tx: Db, game: GameRow): Promise<number> {
  const [row] = await tx.select({ seasonId: series.seasonId }).from(series).where(eq(series.id, game.seriesId));
  if (!row) return 0;
  const finals = await seasonFinalGames(tx, row.seasonId);
  const before = finals.filter(
    (g) => g.playedDate < game.playedDate || (g.playedDate === game.playedDate && g.slot < game.slot),
  );
  return currentWinStreak(before.map((g) => g.result as GameResult));
}

interface RallyState {
  eligibility: RallyEligibility;
  odds: RallyOdds | null;
  tokens: Awaited<ReturnType<typeof availableRallyTokens>>;
  seasonWinStreak: number;
  existing: RallyRollRow | undefined;
}

async function rallyState(tx: Db, user: UserRow, game: GameRow, now: Date): Promise<RallyState> {
  const today = localDateOf(now, user.timezone);
  const [existing] = await tx.select().from(rallyRolls).where(eq(rallyRolls.gameId, game.id));
  const tokens = await availableRallyTokens(tx, user.id, monthKey(today));
  const seasonWinStreak = await seasonWinStreakBefore(tx, game);
  const eligibility = rallyEligibility({
    // No Rally Caps are used during Spring Training or Review Week (GAME_DESIGN §5–6).
    inSeason: isGameDay(user.startDate, today) && isGameDay(user.startDate, game.playedDate),
    gameStatus: game.status,
    result: game.result,
    missedRequired: game.missedRequired,
    rallyDeadline: game.rallyDeadline,
    now,
    alreadyRolled: existing !== undefined,
    seriesRallyUsed: await seriesRallyUsed(tx, game.seriesId),
    tokensAvailable: tokens.length,
  });
  let odds: RallyOdds | null = null;
  if (eligibility.eligible) {
    const ev = evaluateRows(game, await loadEntries(tx, [game.id]));
    odds = rallyOdds({
      seasonWinStreak,
      runs: game.runs,
      threshold: game.threshold ?? 1,
      tasksDone: game.tasksDone,
      minTasks: game.minTasks,
      missedRequired: game.missedRequired,
      partialOnMissed: ev.partialOnMissed,
    });
  }
  return { eligibility, odds, tokens, seasonWinStreak, existing };
}

export async function rallyQuote(tx: Db, user: UserRow, gameId: string, now: Date): Promise<RallyQuoteDto> {
  const game = await loadUserGame(tx, user.id, gameId);
  const state = await rallyState(tx, user, game, now);
  return {
    eligible: state.eligibility.eligible,
    reason: state.eligibility.eligible ? null : state.eligibility.reason,
    odds: state.odds,
    deadline: iso(game.rallyDeadline),
    tokensAvailable: state.tokens.length,
    seasonWinStreak: state.seasonWinStreak,
  };
}

/**
 * Roll once. Repeating the call for the same game returns the stored roll (whatever the
 * key); reusing a key for a different game is rejected.
 */
export async function rollRally(
  tx: Db,
  user: UserRow,
  gameId: string,
  idempotencyKey: string,
  rollDice: RollDice,
  now: Date,
): Promise<{ roll: RallyRollRow; game: GameRow }> {
  const game = await loadUserGame(tx, user.id, gameId, { forUpdate: true });
  const state = await rallyState(tx, user, game, now);
  if (state.existing) return { roll: state.existing, game };

  const [keyUsed] = await tx
    .select({ gameId: rallyRolls.gameId })
    .from(rallyRolls)
    .where(and(eq(rallyRolls.userId, user.id), eq(rallyRolls.idempotencyKey, idempotencyKey)));
  if (keyUsed) {
    throw conflict('CONFLICT', 'This Idempotency-Key was already used for another game.', 'IDEMPOTENCY_KEY_REUSED');
  }
  if (!state.eligibility.eligible) throw REJECTIONS[state.eligibility.reason]();
  const odds = state.odds;
  const token = state.tokens[0];
  if (!odds || !token) throw REJECTIONS.NO_TOKEN();

  const [claimed] = await tx
    .update(rallyTokens)
    .set({ usedGameId: game.id, usedAt: now })
    .where(and(eq(rallyTokens.id, token.id), isNull(rallyTokens.usedGameId)))
    .returning();
  if (!claimed) throw REJECTIONS.NO_TOKEN();

  const roll = rollDice();
  const hit = isRallyHit(roll, odds.pct);
  const [stored] = await tx
    .insert(rallyRolls)
    .values({
      id: uuidv7(),
      userId: user.id,
      gameId: game.id,
      tokenId: claimed.id,
      oddsPct: odds.pct,
      oddsBreakdown: odds,
      roll,
      hit,
      idempotencyKey,
      createdAt: now,
    })
    .returning();
  if (!stored) throw notFound('Rally roll');

  if (hit) {
    await tx.update(games).set({ result: 'W', resultDetail: 'rally' }).where(eq(games.id, game.id));
    const updated = await recomputeSeries(tx, game.seriesId);
    await recomputeSeason(tx, updated.seasonId);
    // A closed series may now earn Iron Man (rally wins count as wins).
    if (updated.closedAt) await closeSeries(tx, user, updated.id, now);
  }
  return { roll: stored, game: await reloadGame(tx, game.id) };
}
