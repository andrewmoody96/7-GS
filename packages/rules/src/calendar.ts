// Season calendar (GAME_DESIGN §5): a season is 12 Monday–Sunday series followed by 1
// offseason (Review Week) week. Season 1's Opening Day is the first Monday on or after
// sign-up. The days before it are Spring Training, unless the user chose to start right
// away: then they are a Head Start, whose games count toward the season record but aren't
// scored as a series (series number 0). Later seasons never start on their own: the player
// starts each one during or after the Review Week before it (nextSeasonStartFor), and until
// then it's the offseason.

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
 * When a later season (2, 3, …) starts, chosen by the player during or after the Review
 * Week before it: its Opening Day (a Monday), and the first day of a Head Start if they
 * started playing before that Monday. Seasons never start on their own.
 */
export interface LaterSeasonStart {
  openingDay: LocalDate;
  headStartFrom: LocalDate | null;
}

/**
 * What anchors a user's calendar: the sign-up date, the date they chose to start Season 1
 * early (null/absent = wait for Opening Day), and the starts they chose for Season 2 on
 * (`seasonStarts[0]` is Season 2). A bare date means Season 1 with no head start.
 */
export type SeasonAnchor =
  | LocalDate
  | { startDate: LocalDate; headStartFrom?: LocalDate | null; seasonStarts?: readonly LaterSeasonStart[] | null };

interface StartedSeason {
  number: number;
  openingDay: LocalDate;
  headStartFrom: LocalDate | null;
}

function anchorOf(anchor: SeasonAnchor): { signupDate: LocalDate; headStartFrom: LocalDate | null } {
  if (typeof anchor === 'string') return { signupDate: anchor, headStartFrom: null };
  const openingDay = nextMondayOnOrAfter(anchor.startDate);
  const from = anchor.headStartFrom ?? null;
  // Only days between sign-up and Opening Day can be a head start.
  const valid = from !== null && compareDates(from, anchor.startDate) >= 0 && compareDates(from, openingDay) < 0;
  return { signupDate: anchor.startDate, headStartFrom: valid ? from : null };
}

/** Every season that has a start: Season 1 always, later ones once the player chose. */
function startedSeasons(anchor: SeasonAnchor): StartedSeason[] {
  const a = anchorOf(anchor);
  const list: StartedSeason[] = [{ number: 1, openingDay: nextMondayOnOrAfter(a.signupDate), headStartFrom: a.headStartFrom }];
  if (typeof anchor !== 'string') {
    for (const next of anchor.seasonStarts ?? []) {
      list.push({ number: list.length + 1, openingDay: next.openingDay, headStartFrom: next.headStartFrom ?? null });
    }
  }
  return list;
}

const firstDayOf = (s: StartedSeason) => s.headStartFrom ?? s.openingDay;

/** Whether a season has a start yet (Season 1 always does; later ones once chosen). */
export function seasonScheduled(anchor: SeasonAnchor, seasonNumber: number): boolean {
  return seasonNumber >= 1 && seasonNumber <= startedSeasons(anchor).length;
}

/** The number of the last season that has a start. */
export function lastScheduledSeason(anchor: SeasonAnchor): number {
  return startedSeasons(anchor).length;
}

/** The first day of Season 1's Head Start, or null when the user waited for Opening Day. */
export function headStartFrom(anchor: SeasonAnchor): LocalDate | null {
  return anchorOf(anchor).headStartFrom;
}

/** Head Start games: the days from the early start through the Sunday before Opening Day. */
export function headStartGames(anchor: SeasonAnchor, seasonNumber = 1): number {
  const s = startedSeasons(anchor)[seasonNumber - 1];
  return s?.headStartFrom ? diffDays(s.openingDay, s.headStartFrom) : 0;
}

/** Games in a season: 84, plus any Head Start games. */
export function gamesInSeason(anchor: SeasonAnchor, seasonNumber: number): number {
  return SERIES_PER_SEASON * SERIES_LENGTH + headStartGames(anchor, seasonNumber);
}

export interface SeasonWindow {
  number: number;
  /** Monday of series 1 (with a Head Start: the first Head Start day). */
  start: LocalDate;
  /** Sunday of the last series. */
  playEnd: LocalDate;
  /** Monday of Review Week. */
  offseasonStart: LocalDate;
  /** Sunday of Review Week. The next season can start the following Monday, once chosen. */
  offseasonEnd: LocalDate;
  /**
   * False for a season the player hasn't started yet: its dates are the earliest it could
   * run (the Monday after the Review Week before it), not a plan.
   */
  scheduled: boolean;
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
  | {
      phase: 'offseason';
      /** The season just played. */
      seasonNumber: number;
      /** True during the Review Week after it; false once that week is over. */
      reviewWeek: boolean;
      /** Opening Day of the next season, or null until the player starts it. */
      nextSeasonStart: LocalDate | null;
    };

/** Opening Day of Season 1: the first Monday on or after sign-up. */
export function firstSeasonStart(anchor: SeasonAnchor): LocalDate {
  return nextMondayOnOrAfter(anchorOf(anchor).signupDate);
}

/** The earliest Opening Day for the season after `seasonNumber`: the Monday after its Review Week. */
export function earliestNextOpeningDay(anchor: SeasonAnchor, seasonNumber: number): LocalDate {
  return addDays(seasonWindow(anchor, seasonNumber).offseasonEnd, 1);
}

export function seasonWindow(anchor: SeasonAnchor, seasonNumber: number): SeasonWindow {
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
    throw new RangeError(`Invalid season number: ${seasonNumber}`);
  }
  const started = startedSeasons(anchor)[seasonNumber - 1];
  const monday = started ? started.openingDay : earliestNextOpeningDay(anchor, seasonNumber - 1);
  const playEnd = addDays(monday, SERIES_PER_SEASON * SERIES_LENGTH - 1);
  return {
    number: seasonNumber,
    start: started ? firstDayOf(started) : monday,
    playEnd,
    offseasonStart: addDays(playEnd, 1),
    offseasonEnd: addDays(playEnd, OFFSEASON_WEEKS * 7),
    scheduled: started !== undefined,
  };
}

export function calendarPosition(anchor: SeasonAnchor, date: LocalDate): CalendarPosition {
  const list = startedSeasons(anchor);
  const first = list[0]!;
  if (compareDates(date, firstDayOf(first)) < 0) {
    return {
      phase: 'preseason',
      seasonNumber: 1,
      openingDay: first.openingDay,
      daysUntilOpeningDay: diffDays(first.openingDay, date),
    };
  }
  // The latest season that has begun by `date`.
  let current = first;
  for (const s of list) if (compareDates(firstDayOf(s), date) <= 0) current = s;

  if (compareDates(date, current.openingDay) < 0) {
    // Head Start: real games on the days left this week. Game numbers stay weekday-aligned.
    const seriesStart = startOfWeek(date);
    return {
      phase: 'season',
      seasonNumber: current.number,
      seriesNumber: HEAD_START_SERIES,
      gameNumber: diffDays(date, seriesStart) + 1,
      seriesStart,
      seriesEnd: addDays(seriesStart, SERIES_LENGTH - 1),
    };
  }

  const dayInSeason = diffDays(date, current.openingDay);
  if (dayInSeason >= SERIES_PER_SEASON * SERIES_LENGTH) {
    // Review Week, then as long as the player likes until they start the next season.
    const next = list[current.number];
    return {
      phase: 'offseason',
      seasonNumber: current.number,
      reviewWeek: dayInSeason < SEASON_DAYS,
      nextSeasonStart: next ? next.openingDay : null,
    };
  }

  const seriesIndex = Math.floor(dayInSeason / SERIES_LENGTH);
  const seriesStart = addDays(current.openingDay, seriesIndex * 7);
  return {
    phase: 'season',
    seasonNumber: current.number,
    seriesNumber: seriesIndex + 1,
    gameNumber: (dayInSeason % SERIES_LENGTH) + 1,
    seriesStart,
    seriesEnd: addDays(seriesStart, SERIES_LENGTH - 1),
  };
}

/**
 * The start a player gets by choosing to begin the next season on `today` (GAME_DESIGN §5),
 * or null if they can't: only in the offseason. Opening Day is the first Monday on or after
 * both today and the end of Review Week. `headStart` plays from today instead, only once
 * Review Week is over and today isn't Opening Day itself. A season already started can
 * still add a Head Start before its Opening Day.
 */
export function nextSeasonStartFor(
  anchor: SeasonAnchor,
  today: LocalDate,
  headStart: boolean,
): { seasonNumber: number; start: LaterSeasonStart } | null {
  const pos = calendarPosition(anchor, today);
  if (pos.phase !== 'offseason') return null;
  const seasonNumber = pos.seasonNumber + 1;
  const earliest = earliestNextOpeningDay(anchor, pos.seasonNumber);
  const openingDay = pos.nextSeasonStart ?? nextMondayOnOrAfter(compareDates(today, earliest) > 0 ? today : earliest);
  if (!headStart) return pos.nextSeasonStart ? null : { seasonNumber, start: { openingDay, headStartFrom: null } };
  if (pos.reviewWeek || compareDates(today, openingDay) >= 0) return null;
  return { seasonNumber, start: { openingDay, headStartFrom: today } };
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
  const early = startedSeasons(anchor).find((s) => s.headStartFrom !== null && startOfWeek(s.headStartFrom) === weekStart);
  const probe = early?.headStartFrom ?? weekStart;
  const pos = calendarPosition(anchor, probe);
  return pos.phase === 'season' && pos.seriesStart === weekStart ? pos : null;
}
