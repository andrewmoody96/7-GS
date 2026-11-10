// Season calendar (GAME_DESIGN §5): each season is a quarter, 12 Monday–Sunday series
// followed by 1 offseason (Review Week) week. Season 1's Opening Day is the first Monday
// on or after sign-up. The days before it are Spring Training, unless the user chose to
// start right away: then they are a Head Start, whose games count toward the season
// record but aren't scored as a series (series number 0).

import {
  OFFSEASON_WEEKS,
  SEASON_DAYS,
  SERIES_LENGTH,
  SERIES_PER_SEASON,
} from './constants';
import { addDays, compareDates, diffDays, nextMondayOnOrAfter, startOfWeek, type LocalDate } from './dates';

/** Series number of the Head Start (the partial week before Opening Day). */
export const HEAD_START_SERIES = 0;

/**
 * What anchors a user's calendar: the sign-up date, plus the date they chose to start
 * playing early (null/absent = wait for Opening Day). A bare date means no head start.
 */
export type SeasonAnchor = LocalDate | { startDate: LocalDate; headStartFrom?: LocalDate | null };

function anchorOf(anchor: SeasonAnchor): { signupDate: LocalDate; headStartFrom: LocalDate | null } {
  if (typeof anchor === 'string') return { signupDate: anchor, headStartFrom: null };
  const openingDay = nextMondayOnOrAfter(anchor.startDate);
  const from = anchor.headStartFrom ?? null;
  // Only days between sign-up and Opening Day can be a head start.
  const valid = from !== null && compareDates(from, anchor.startDate) >= 0 && compareDates(from, openingDay) < 0;
  return { signupDate: anchor.startDate, headStartFrom: valid ? from : null };
}

/** The first day of the Head Start, or null when the user waits for Opening Day. */
export function headStartFrom(anchor: SeasonAnchor): LocalDate | null {
  return anchorOf(anchor).headStartFrom;
}

/** Head Start games: the days from the early start through the Sunday before Opening Day. */
export function headStartGames(anchor: SeasonAnchor): number {
  const a = anchorOf(anchor);
  return a.headStartFrom === null ? 0 : diffDays(nextMondayOnOrAfter(a.signupDate), a.headStartFrom);
}

/** Games in a season: 84, plus the Head Start games in Season 1. */
export function gamesInSeason(anchor: SeasonAnchor, seasonNumber: number): number {
  return SERIES_PER_SEASON * SERIES_LENGTH + (seasonNumber === 1 ? headStartGames(anchor) : 0);
}

export interface SeasonWindow {
  number: number;
  /** Monday of series 1 (Season 1 with a Head Start: the first Head Start day). */
  start: LocalDate;
  /** Sunday of the last series. */
  playEnd: LocalDate;
  /** Monday of Review Week. */
  offseasonStart: LocalDate;
  /** Sunday of Review Week. The next season starts the following day. */
  offseasonEnd: LocalDate;
}

export type CalendarPosition =
  | { phase: 'preseason'; seasonNumber: 1; openingDay: LocalDate; daysUntilOpeningDay: number }
  | {
      phase: 'season';
      seasonNumber: number;
      seriesNumber: number;
      /** 1 = Monday … 7 = Sunday, matching the game number in the series. */
      gameNumber: number;
      seriesStart: LocalDate;
      seriesEnd: LocalDate;
    }
  | { phase: 'offseason'; seasonNumber: number; nextSeasonStart: LocalDate };

/** Opening Day of Season 1: the first Monday on or after sign-up. */
export function firstSeasonStart(anchor: SeasonAnchor): LocalDate {
  return nextMondayOnOrAfter(anchorOf(anchor).signupDate);
}

export function seasonWindow(anchor: SeasonAnchor, seasonNumber: number): SeasonWindow {
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
    throw new RangeError(`Invalid season number: ${seasonNumber}`);
  }
  const monday = addDays(firstSeasonStart(anchor), (seasonNumber - 1) * SEASON_DAYS);
  const playEnd = addDays(monday, SERIES_PER_SEASON * SERIES_LENGTH - 1);
  const early = seasonNumber === 1 ? anchorOf(anchor).headStartFrom : null;
  return {
    number: seasonNumber,
    start: early ?? monday,
    playEnd,
    offseasonStart: addDays(playEnd, 1),
    offseasonEnd: addDays(playEnd, OFFSEASON_WEEKS * 7),
  };
}

export function calendarPosition(anchor: SeasonAnchor, date: LocalDate): CalendarPosition {
  const openingDay = firstSeasonStart(anchor);
  if (compareDates(date, openingDay) < 0) {
    const early = anchorOf(anchor).headStartFrom;
    if (early !== null && compareDates(date, early) >= 0) {
      // Head Start: real games on the days left this week. Game numbers stay weekday-aligned.
      const seriesStart = startOfWeek(date);
      return {
        phase: 'season',
        seasonNumber: 1,
        seriesNumber: HEAD_START_SERIES,
        gameNumber: diffDays(date, seriesStart) + 1,
        seriesStart,
        seriesEnd: addDays(seriesStart, SERIES_LENGTH - 1),
      };
    }
    return {
      phase: 'preseason',
      seasonNumber: 1,
      openingDay,
      daysUntilOpeningDay: diffDays(openingDay, date),
    };
  }

  const elapsed = diffDays(date, openingDay);
  const seasonIndex = Math.floor(elapsed / SEASON_DAYS);
  const dayInSeason = elapsed % SEASON_DAYS;
  const seasonNumber = seasonIndex + 1;

  if (dayInSeason >= SERIES_PER_SEASON * SERIES_LENGTH) {
    return {
      phase: 'offseason',
      seasonNumber,
      nextSeasonStart: seasonWindow(anchor, seasonNumber + 1).start,
    };
  }

  const seriesIndex = Math.floor(dayInSeason / SERIES_LENGTH);
  const seriesStart = addDays(openingDay, seasonIndex * SEASON_DAYS + seriesIndex * 7);
  return {
    phase: 'season',
    seasonNumber,
    seriesNumber: seriesIndex + 1,
    gameNumber: (dayInSeason % SERIES_LENGTH) + 1,
    seriesStart,
    seriesEnd: addDays(seriesStart, SERIES_LENGTH - 1),
  };
}

/** True when games are played on `date` (not Spring Training or Review Week). */
export function isGameDay(anchor: SeasonAnchor, date: LocalDate): boolean {
  return calendarPosition(anchor, date).phase === 'season';
}

/**
 * The season-phase position of the week that starts on Monday `weekStart`, or null when
 * no games are played that week. A Head Start week begins after its Monday, so it is
 * looked up by its first game day.
 */
export function weekPosition(anchor: SeasonAnchor, weekStart: LocalDate): Extract<CalendarPosition, { phase: 'season' }> | null {
  const early = anchorOf(anchor).headStartFrom;
  const probe = early !== null && startOfWeek(early) === weekStart ? early : weekStart;
  const pos = calendarPosition(anchor, probe);
  return pos.phase === 'season' && pos.seriesStart === weekStart ? pos : null;
}
