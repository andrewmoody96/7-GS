import { calendarPosition, localDateOf } from '@7gs/rules';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { seasons, series, type SeasonRow, type SeriesRow, type UserRow } from '../db/schema';
import { conflict, notFound } from '../errors';
import { findSeason, findSeriesByStart } from './calendar';

/**
 * The season whose window contains today: Season 1 during Spring Training, and the
 * season being reviewed during its Review Week.
 */
export async function currentSeason(tx: Db, user: UserRow, now: Date): Promise<SeasonRow | undefined> {
  const pos = calendarPosition(user.startDate, localDateOf(now, user.timezone));
  return findSeason(tx, user.id, pos.seasonNumber);
}

export async function loadUserSeason(tx: Db, userId: string, seasonId: string, forUpdate = false): Promise<SeasonRow> {
  const query = tx
    .select()
    .from(seasons)
    .where(and(eq(seasons.id, seasonId), eq(seasons.userId, userId)));
  const [row] = forUpdate ? await query.for('update') : await query;
  if (!row) throw notFound('Season');
  return row;
}

/** The series being played today, or null in Spring Training / Review Week. */
export async function currentSeries(tx: Db, user: UserRow, now: Date): Promise<SeriesRow | undefined> {
  const pos = calendarPosition(user.startDate, localDateOf(now, user.timezone));
  return pos.phase === 'season' ? findSeriesByStart(tx, user.id, pos.seriesStart) : undefined;
}

export async function loadUserSeries(tx: Db, userId: string, seriesId: string): Promise<SeriesRow> {
  const [row] = await tx
    .select()
    .from(series)
    .where(and(eq(series.id, seriesId), eq(series.userId, userId)));
  if (!row) throw notFound('Series');
  return row;
}

/**
 * Season goal: only for a season that hasn't started, and only during Spring Training
 * or Review Week (GAME_DESIGN §5 front office). Rejections use OUT_OF_SEASON ("only
 * out of season") with a reason.
 */
export async function setWinGoal(tx: Db, user: UserRow, seasonId: string, winGoal: number, now: Date): Promise<SeasonRow> {
  const season = await loadUserSeason(tx, user.id, seasonId, true);
  const pos = calendarPosition(user.startDate, localDateOf(now, user.timezone));
  if (pos.phase === 'season') {
    throw conflict(
      'OUT_OF_SEASON',
      'Season goals can only be set during Spring Training or Review Week.',
      'SEASON_IN_PROGRESS',
    );
  }
  if (season.status !== 'upcoming') {
    throw conflict(
      'OUT_OF_SEASON',
      `Season ${season.number} has already started; set the goal for the upcoming season instead.`,
      'SEASON_STARTED',
    );
  }
  const [row] = await tx.update(seasons).set({ winGoal }).where(eq(seasons.id, season.id)).returning();
  return row ?? season;
}
