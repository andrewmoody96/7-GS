// Lazily materialising the season calendar: season → series → the 7 game rows.
// Everything here is idempotent (unique keys + ON CONFLICT DO NOTHING), so the request
// path and the finalizer can both call it.

import {
  addDays,
  calendarPosition,
  compareDates,
  generateOpponent,
  hashSeed,
  seasonWindow,
  SERIES_LENGTH,
  type LocalDate,
  type SeasonStatus,
} from '@7gs/rules';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, seasons, series, type GameRow, type SeasonRow, type SeriesRow, type UserRow } from '../db/schema';
import { uuidv7 } from '../ids';

const STATUS_RANK: Record<SeasonStatus, number> = { upcoming: 0, active: 1, offseason: 2, complete: 3 };

export function seasonStatusOn(
  window: { start: LocalDate; playEnd: LocalDate; offseasonEnd: LocalDate },
  date: LocalDate,
): SeasonStatus {
  if (compareDates(date, window.start) < 0) return 'upcoming';
  if (compareDates(date, window.playEnd) <= 0) return 'active';
  if (compareDates(date, window.offseasonEnd) <= 0) return 'offseason';
  return 'complete';
}

export async function findSeason(tx: Db, userId: string, number: number): Promise<SeasonRow | undefined> {
  const [row] = await tx
    .select()
    .from(seasons)
    .where(and(eq(seasons.userId, userId), eq(seasons.number, number)));
  return row;
}

export async function ensureSeason(
  tx: Db,
  user: UserRow,
  number: number,
  asOf: LocalDate,
  now: Date,
): Promise<SeasonRow> {
  const existing = await findSeason(tx, user.id, number);
  if (existing) return existing;
  const w = seasonWindow(user.startDate, number);
  await tx
    .insert(seasons)
    .values({
      id: uuidv7(),
      userId: user.id,
      number,
      startDate: w.start,
      playEndDate: w.playEnd,
      offseasonEndDate: w.offseasonEnd,
      status: seasonStatusOn(w, asOf),
      createdAt: now,
    })
    .onConflictDoNothing();
  const created = await findSeason(tx, user.id, number);
  if (!created) throw new Error(`Season ${number} could not be created`);
  return created;
}

/**
 * Make sure the season rows `date` needs exist (the upcoming one during Review Week, so
 * its goal can be set) and roll statuses forward: upcoming → active → offseason → complete.
 */
export async function syncSeasons(tx: Db, user: UserRow, date: LocalDate, now: Date): Promise<void> {
  const pos = calendarPosition(user.startDate, date);
  await ensureSeason(tx, user, pos.seasonNumber, date, now);
  if (pos.phase === 'offseason') await ensureSeason(tx, user, pos.seasonNumber + 1, date, now);

  const rows = await tx
    .select()
    .from(seasons)
    .where(and(eq(seasons.userId, user.id), ne(seasons.status, 'complete')));
  for (const row of rows) {
    const status = seasonStatusOn(
      { start: row.startDate, playEnd: row.playEndDate, offseasonEnd: row.offseasonEndDate },
      date,
    );
    // Only ever move forward, so a user travelling west can't flip a season back.
    if (STATUS_RANK[status] > STATUS_RANK[row.status]) {
      await tx.update(seasons).set({ status }).where(eq(seasons.id, row.id));
    }
  }
}

export async function findSeriesByStart(tx: Db, userId: string, startDate: LocalDate): Promise<SeriesRow | undefined> {
  const [row] = await tx
    .select()
    .from(series)
    .where(and(eq(series.userId, userId), eq(series.startDate, startDate)));
  return row;
}

export async function ensureSeries(
  tx: Db,
  user: UserRow,
  season: SeasonRow,
  number: number,
  startDate: LocalDate,
  now: Date,
): Promise<SeriesRow> {
  const existing = await findSeriesByStart(tx, user.id, startDate);
  if (existing) return existing;
  const opponent = generateOpponent(hashSeed(`${user.id}:${season.number}:${number}`));
  await tx
    .insert(series)
    .values({
      id: uuidv7(),
      userId: user.id,
      seasonId: season.id,
      number,
      startDate,
      opponentName: opponent.name,
      opponentColors: [...opponent.colors],
      opponentSeed: opponent.seed,
      createdAt: now,
    })
    .onConflictDoNothing();
  const created = await findSeriesByStart(tx, user.id, startDate);
  if (!created) throw new Error(`Series ${number} could not be created`);
  return created;
}

export async function ensureSeriesGames(tx: Db, user: UserRow, row: SeriesRow, now: Date): Promise<void> {
  const existing = await tx.select({ gameNumber: games.gameNumber }).from(games).where(eq(games.seriesId, row.id));
  if (existing.length >= SERIES_LENGTH) return;
  const have = new Set(existing.map((g) => g.gameNumber));
  const values = [];
  for (let i = 0; i < SERIES_LENGTH; i++) {
    if (have.has(i + 1)) continue;
    const date = addDays(row.startDate, i);
    values.push({
      id: uuidv7(),
      userId: user.id,
      seriesId: row.id,
      gameNumber: i + 1,
      scheduledDate: date,
      playedDate: date,
      slot: 1,
      postponed: false,
      createdAt: now,
    });
  }
  if (values.length > 0) await tx.insert(games).values(values).onConflictDoNothing();
}

/**
 * Ensure the season, series and 7 game rows for `date` exist, and return the games
 * played on `date` (0 in Spring Training / Review Week or after a rainout, 2 on a
 * doubleheader day), ordered by slot.
 */
export async function ensureDay(tx: Db, user: UserRow, date: LocalDate, now: Date): Promise<GameRow[]> {
  const pos = calendarPosition(user.startDate, date);
  if (pos.phase !== 'season') return [];
  const season = await ensureSeason(tx, user, pos.seasonNumber, date, now);
  const row = await ensureSeries(tx, user, season, pos.seriesNumber, pos.seriesStart, now);
  await ensureSeriesGames(tx, user, row, now);
  return gamesOn(tx, user.id, date);
}

export async function gamesOn(tx: Db, userId: string, date: LocalDate): Promise<GameRow[]> {
  return tx
    .select()
    .from(games)
    .where(and(eq(games.userId, userId), eq(games.playedDate, date)))
    .orderBy(asc(games.slot));
}
