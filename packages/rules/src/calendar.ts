// Season calendar (GAME_DESIGN §5): each season is 25 Monday–Sunday series followed
// by 1 offseason (Review Week) week. Season 1 opens on the first Monday on or after
// sign-up; the days before that are Spring Training.

import {
  OFFSEASON_WEEKS,
  SEASON_DAYS,
  SERIES_LENGTH,
  SERIES_PER_SEASON,
} from './constants';
import { addDays, compareDates, diffDays, nextMondayOnOrAfter, type LocalDate } from './dates';

export interface SeasonWindow {
  number: number;
  /** Monday of series 1. */
  start: LocalDate;
  /** Sunday of series 25. */
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

export function firstSeasonStart(signupDate: LocalDate): LocalDate {
  return nextMondayOnOrAfter(signupDate);
}

export function seasonWindow(signupDate: LocalDate, seasonNumber: number): SeasonWindow {
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
    throw new RangeError(`Invalid season number: ${seasonNumber}`);
  }
  const start = addDays(firstSeasonStart(signupDate), (seasonNumber - 1) * SEASON_DAYS);
  const playEnd = addDays(start, SERIES_PER_SEASON * SERIES_LENGTH - 1);
  return {
    number: seasonNumber,
    start,
    playEnd,
    offseasonStart: addDays(playEnd, 1),
    offseasonEnd: addDays(playEnd, OFFSEASON_WEEKS * 7),
  };
}

export function calendarPosition(signupDate: LocalDate, date: LocalDate): CalendarPosition {
  const openingDay = firstSeasonStart(signupDate);
  if (compareDates(date, openingDay) < 0) {
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
      nextSeasonStart: seasonWindow(signupDate, seasonNumber + 1).start,
    };
  }

  const seriesIndex = Math.floor(dayInSeason / SERIES_LENGTH);
  const seriesStart = addDays(seasonWindow(signupDate, seasonNumber).start, seriesIndex * 7);
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
export function isGameDay(signupDate: LocalDate, date: LocalDate): boolean {
  return calendarPosition(signupDate, date).phase === 'season';
}
