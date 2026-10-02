// Cached aggregates (series W–L/result, season record) and streaks. Every function
// rebuilds from the game rows, so calling it again changes nothing (finalizer
// idempotency) and a Rally Cap hit can refresh them immediately.

import {
  currentWinStreak,
  isIronMan,
  longestWinStreak,
  seasonRecord,
  seriesStatus,
  taskStreaks,
  type GameResult,
  type SeriesGameState,
} from '@7gs/rules';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  games,
  lineupEntries,
  rallyRolls,
  seasons,
  series,
  taskDefinitions,
  type GameRow,
  type SeasonRow,
  type SeriesRow,
  type UserRow,
} from '../db/schema';
import { grantIronManRainout, grantSeriesBonusToken } from './allowances';

export function seriesGameStates(rows: readonly GameRow[]): SeriesGameState[] {
  return rows.map((g) => ({
    gameNumber: g.gameNumber,
    playedDate: g.playedDate,
    slot: g.slot,
    postponed: g.postponed,
    result: g.status === 'final' ? g.result : null,
  }));
}

export function seriesGames(tx: Db, seriesId: string): Promise<GameRow[]> {
  return tx.select().from(games).where(eq(games.seriesId, seriesId)).orderBy(asc(games.gameNumber));
}

export async function recomputeSeries(tx: Db, seriesId: string): Promise<SeriesRow> {
  const rows = await seriesGames(tx, seriesId);
  const states = seriesGameStates(rows);
  const status = seriesStatus(states);
  const [current] = await tx.select().from(series).where(eq(series.id, seriesId));
  if (!current) throw new Error(`Series ${seriesId} not found`);
  const ironMan = current.closedAt ? isIronMan(states) : null;
  if (
    current.wins === status.wins &&
    current.losses === status.losses &&
    current.result === status.result &&
    current.ironMan === ironMan
  ) {
    return current;
  }
  const [row] = await tx
    .update(series)
    .set({ wins: status.wins, losses: status.losses, result: status.result, ironMan })
    .where(eq(series.id, seriesId))
    .returning();
  return row ?? current;
}

/** Final games of a season in chronological order (played_date, slot). */
export function seasonFinalGames(tx: Db, seasonId: string) {
  return tx
    .select({
      id: games.id,
      playedDate: games.playedDate,
      slot: games.slot,
      result: games.result,
      resultDetail: games.resultDetail,
      runs: games.runs,
      threshold: games.threshold,
    })
    .from(games)
    .innerJoin(series, eq(series.id, games.seriesId))
    .where(and(eq(series.seasonId, seasonId), eq(games.status, 'final')))
    .orderBy(asc(games.playedDate), asc(games.slot));
}

export async function recomputeSeason(tx: Db, seasonId: string): Promise<SeasonRow> {
  const finals = await seasonFinalGames(tx, seasonId);
  const record = seasonRecord(
    finals.map((g) => ({ result: g.result, resultDetail: g.resultDetail, runs: g.runs, threshold: g.threshold ?? 0 })),
  );
  const decided = await tx
    .select({ result: series.result, n: count() })
    .from(series)
    .where(eq(series.seasonId, seasonId))
    .groupBy(series.result);
  const seriesWon = decided.find((d) => d.result === 'won')?.n ?? 0;
  const seriesLost = decided.find((d) => d.result === 'lost')?.n ?? 0;
  const [row] = await tx
    .update(seasons)
    .set({
      wins: record.wins,
      losses: record.losses,
      rallyWins: record.rallyWins,
      runDifferential: record.runDifferential,
      seriesWon,
      seriesLost,
    })
    .where(eq(seasons.id, seasonId))
    .returning();
  if (!row) throw new Error(`Season ${seasonId} not found`);
  return row;
}

export async function seasonWinStreaks(tx: Db, seasonId: string): Promise<{ current: number; longest: number }> {
  const results = (await seasonFinalGames(tx, seasonId)).map((g) => g.result as GameResult);
  return { current: currentWinStreak(results), longest: longestWinStreak(results) };
}

/**
 * Task streaks over lineup appearances in final games, oldest first (DATA_MODEL §6).
 * Days a task isn't in the lineup (bench, IL, Review Week) don't count either way.
 */
export async function recomputeTaskStreaks(tx: Db, taskIds: readonly string[]): Promise<void> {
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return;
  const rows = await tx
    .select({ taskId: lineupEntries.taskId, completedAt: lineupEntries.completedClientAt })
    .from(lineupEntries)
    .innerJoin(games, eq(games.id, lineupEntries.gameId))
    .where(and(inArray(lineupEntries.taskId, ids), eq(lineupEntries.role, 'lineup'), eq(games.status, 'final')))
    .orderBy(asc(games.playedDate), asc(games.slot));
  const appearances = new Map<string, boolean[]>(ids.map((id) => [id, []]));
  for (const row of rows) appearances.get(row.taskId)?.push(row.completedAt !== null);

  for (const [taskId, list] of appearances) {
    const { current, longest } = taskStreaks(list);
    await tx
      .update(taskDefinitions)
      .set({ currentStreak: current, longestStreak: longest })
      .where(eq(taskDefinitions.id, taskId));
  }
}

export async function seriesRallyUsed(tx: Db, seriesId: string): Promise<boolean> {
  const [row] = await tx
    .select({ n: count() })
    .from(rallyRolls)
    .innerJoin(games, eq(games.id, rallyRolls.gameId))
    .where(eq(games.seriesId, seriesId));
  return (row?.n ?? 0) > 0;
}

/**
 * Close a series once its Sunday is settled: record Iron Man and grant the bonuses
 * (GAME_DESIGN §6–7). Safe to call again (e.g. after a Rally Cap hit changes a result).
 */
export async function closeSeries(tx: Db, user: UserRow, seriesId: string, now: Date): Promise<SeriesRow> {
  const rows = await seriesGames(tx, seriesId);
  const [current] = await tx.select().from(series).where(eq(series.id, seriesId));
  if (!current) throw new Error(`Series ${seriesId} not found`);
  if (rows.length < 7 || rows.some((g) => g.status !== 'final')) return current;

  if (!current.closedAt) await tx.update(series).set({ closedAt: now }).where(eq(series.id, seriesId));
  const closed = await recomputeSeries(tx, seriesId);
  const [season] = await tx.select().from(seasons).where(eq(seasons.id, closed.seasonId));
  if (!season) throw new Error(`Season ${closed.seasonId} not found`);
  await recomputeSeason(tx, season.id);

  if (closed.ironMan) await grantIronManRainout(tx, user, closed, season, now);
  if (closed.result === 'won' && !(await seriesRallyUsed(tx, seriesId))) {
    await grantSeriesBonusToken(tx, user, closed, now);
  }
  return closed;
}
