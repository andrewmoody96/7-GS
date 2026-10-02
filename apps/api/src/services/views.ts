// Assembling Game / Series / Season DTOs. Games whose lineup isn't built yet show the
// current starter's values (that's what they will snapshot on their game day).

import type { GameDto, GameSummaryDto, SeasonDto, SeriesDto } from '@7gs/contracts';
import { addDays, weekday } from '@7gs/rules';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { rallyRolls, seasons, type EntryRow, type GameRow, type SeasonRow, type SeriesRow, type UserRow } from '../db/schema';
import { iso, slotOf, sortEntries, toEntryDto, toRallyRollDto } from './dto';
import { loadEntries } from './lineups';
import { seasonWinStreaks, seriesGames } from './standings';
import { ensureStarters, projectStarter, type StarterProjection } from './starters';

async function projections(
  tx: Db,
  user: UserRow,
  rows: readonly GameRow[],
  now: Date,
): Promise<Map<string, StarterProjection>> {
  const unbuilt = rows.filter((r) => !r.lineupBuiltAt);
  if (unbuilt.length === 0) return new Map();
  const starters = new Map((await ensureStarters(tx, user, now)).map((s) => [s.weekday, s]));
  return new Map(
    unbuilt.map((r) => {
      const starter = starters.get(weekday(r.scheduledDate));
      if (!starter) throw new Error(`No starter for ${r.scheduledDate}`);
      return [r.id, projectStarter(starter, user)];
    }),
  );
}

function snapshotOf(row: GameRow, projection: StarterProjection | undefined): StarterProjection {
  if (row.lineupBuiltAt) {
    return {
      starterName: row.starterName ?? '',
      threshold: row.threshold ?? 1,
      minTasks: row.minTasks,
      lockTime: row.lockTime,
    };
  }
  if (!projection) throw new Error(`Missing starter projection for game ${row.id}`);
  return projection;
}

function toSummary(row: GameRow, snap: StarterProjection): GameSummaryDto {
  return {
    id: row.id,
    seriesId: row.seriesId,
    gameNumber: row.gameNumber,
    scheduledDate: row.scheduledDate,
    playedDate: row.playedDate,
    slot: slotOf(row),
    postponed: row.postponed,
    starterName: snap.starterName,
    threshold: snap.threshold,
    minTasks: snap.minTasks,
    status: row.status,
    runs: row.runs,
    tasksDone: row.tasksDone,
    missedRequired: row.missedRequired,
    result: row.result,
    resultDetail: row.resultDetail,
  };
}

export async function gameViews(tx: Db, user: UserRow, rows: readonly GameRow[], now: Date): Promise<GameDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const proj = await projections(tx, user, rows, now);
  const entries = await loadEntries(tx, ids);
  const rolls = await tx.select().from(rallyRolls).where(inArray(rallyRolls.gameId, ids));
  const entriesByGame = new Map<string, EntryRow[]>();
  for (const e of entries) entriesByGame.set(e.gameId, [...(entriesByGame.get(e.gameId) ?? []), e]);

  return rows.map((row) => {
    const snap = snapshotOf(row, proj.get(row.id));
    const roll = rolls.find((r) => r.gameId === row.id);
    return {
      ...toSummary(row, snap),
      lockTime: snap.lockTime,
      lockedAt: iso(row.lockedAt),
      rallyDeadline: iso(row.rallyDeadline),
      finalizedAt: iso(row.finalizedAt),
      entries: sortEntries(entriesByGame.get(row.id) ?? []).map(toEntryDto),
      rally: roll ? toRallyRollDto(roll) : null,
    };
  });
}

export async function gameView(tx: Db, user: UserRow, row: GameRow, now: Date): Promise<GameDto> {
  const [view] = await gameViews(tx, user, [row], now);
  if (!view) throw new Error(`Game ${row.id} view failed`);
  return view;
}

export async function seriesView(tx: Db, user: UserRow, row: SeriesRow, now: Date): Promise<SeriesDto> {
  const [season] = await tx.select({ number: seasons.number }).from(seasons).where(eq(seasons.id, row.seasonId));
  const rows = await seriesGames(tx, row.id);
  const proj = await projections(tx, user, rows, now);
  const [c1, c2] = row.opponentColors;
  return {
    id: row.id,
    seasonNumber: season?.number ?? 1,
    number: row.number,
    startDate: row.startDate,
    endDate: addDays(row.startDate, 6),
    opponent: { seed: row.opponentSeed, name: row.opponentName, colors: [c1 ?? '#000000', c2 ?? '#FFFFFF'] },
    wins: row.wins,
    losses: row.losses,
    result: row.result,
    ironMan: row.closedAt ? row.ironMan : null,
    games: rows.map((g) => toSummary(g, snapshotOf(g, proj.get(g.id)))),
  };
}

export async function seasonView(tx: Db, row: SeasonRow): Promise<SeasonDto> {
  const streaks = await seasonWinStreaks(tx, row.id);
  return {
    id: row.id,
    number: row.number,
    startDate: row.startDate,
    playEndDate: row.playEndDate,
    offseasonEndDate: row.offseasonEndDate,
    status: row.status,
    winGoal: row.winGoal,
    wins: row.wins,
    losses: row.losses,
    rallyWins: row.rallyWins,
    seriesWon: row.seriesWon,
    seriesLost: row.seriesLost,
    runDifferential: row.runDifferential,
    currentWinStreak: streaks.current,
    longestWinStreak: streaks.longest,
  };
}
