// History and career (GAME_DESIGN §5): every season so far, each season's series, and
// lifetime totals. Read-only views over the cached season and series rows.

import type { CareerDto, SeasonDto, SeriesSummaryDto } from '@7gs/contracts';
import { bestSeason, currentWinStreak, longestWinStreak, type GameResult } from '@7gs/rules';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, seasons, series, type UserRow } from '../db/schema';
import { loadUserSeason } from './seasons';
import { seasonView, seriesSummaryView } from './views';

export async function listSeasons(tx: Db, user: UserRow): Promise<SeasonDto[]> {
  const rows = await tx.select().from(seasons).where(eq(seasons.userId, user.id)).orderBy(desc(seasons.number));
  const out: SeasonDto[] = [];
  for (const row of rows) out.push(await seasonView(tx, row));
  return out;
}

export async function listSeasonSeries(tx: Db, user: UserRow, seasonId: string): Promise<SeriesSummaryDto[]> {
  const season = await loadUserSeason(tx, user.id, seasonId);
  const rows = await tx.select().from(series).where(eq(series.seasonId, season.id)).orderBy(asc(series.number));
  return rows.map((row) => seriesSummaryView(row, season.number));
}

export async function career(tx: Db, user: UserRow): Promise<CareerDto> {
  const rows = await tx.select().from(seasons).where(eq(seasons.userId, user.id));
  const sum = (pick: (s: (typeof rows)[number]) => number) => rows.reduce((n, s) => n + pick(s), 0);
  const wins = sum((s) => s.wins);
  const losses = sum((s) => s.losses);
  // Streaks run on across Review Weeks: they pause there, never break (GAME_DESIGN §5).
  const results = (
    await tx
      .select({ result: games.result })
      .from(games)
      .where(and(eq(games.userId, user.id), eq(games.status, 'final'), isNotNull(games.result)))
      .orderBy(asc(games.playedDate), asc(games.slot))
  ).flatMap((g) => (g.result ? [g.result as GameResult] : []));
  const best = bestSeason(rows.map((s) => ({ number: s.number, wins: s.wins, losses: s.losses })));
  return {
    seasonsPlayed: rows.filter((s) => s.wins + s.losses > 0).length,
    wins,
    losses,
    winPct: wins + losses === 0 ? null : Math.round((wins / (wins + losses)) * 1000) / 1000,
    rallyWins: sum((s) => s.rallyWins),
    seriesWon: sum((s) => s.seriesWon),
    seriesLost: sum((s) => s.seriesLost),
    runDifferential: sum((s) => s.runDifferential),
    currentWinStreak: currentWinStreak(results),
    longestWinStreak: longestWinStreak(results),
    bestSeason: best ? { number: best.number, wins: best.wins, losses: best.losses, winPct: best.winPct } : null,
  };
}
