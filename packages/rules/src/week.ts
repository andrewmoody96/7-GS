// The weekly lineup card (GAME_DESIGN §4a). Each series is planned as a week: anything
// goes until the week's first pitch, then lineups only grow (pinch hitters, bench adds).

import { SERIES_LENGTH } from './constants';
import { calendarPosition } from './calendar';
import { effectiveLockedAt } from './checkoff';
import { addDays, compareDates, nextMondayOnOrAfter, weekday, type LocalDate } from './dates';

export interface WeekGameLock {
  playedDate: LocalDate;
  lockedAt: Date | null;
  lockTime: string | null;
}

/**
 * The week locks at its first first pitch: the earliest lock (first check-off, manual
 * lock, or a scheduled lock time that has passed) of any game in the series.
 */
export function weekLockedAt(games: readonly WeekGameLock[], timeZone: string, now: Date): Date | null {
  let earliest: Date | null = null;
  for (const g of games) {
    const lock = effectiveLockedAt({ lockedAt: g.lockedAt, playedDate: g.playedDate, lockTime: g.lockTime, timeZone, now });
    if (lock && (earliest === null || lock.getTime() < earliest.getTime())) earliest = lock;
  }
  return earliest;
}

/**
 * - free: plan anything (add, remove, reorder, must-hits, runs to win)
 * - additions_only: after the week's first pitch; pinch hitters and bench adds only
 * - closed: the game is final or its day is over
 */
export const LINEUP_EDIT_POLICIES = ['free', 'additions_only', 'closed'] as const;
export type LineupEditPolicy = (typeof LINEUP_EDIT_POLICIES)[number];

export function lineupEditPolicy(input: { weekLocked: boolean; gameFinal: boolean; dayOver: boolean }): LineupEditPolicy {
  if (input.gameFinal || input.dayOver) return 'closed';
  return input.weekLocked ? 'additions_only' : 'free';
}

/** A pinch hitter is a new must-hit; runs to win rises by exactly its runs. */
export function pinchHitThreshold(threshold: number, points: number): number {
  return threshold + points;
}

/** First day of next week's card opening: Friday (weekday 5). */
export const NEXT_WEEK_OPENS_WEEKDAY = 5;

/**
 * Series start dates the user can plan right now: the current week during the season
 * (or Opening Week during Spring Training), plus next week from Friday on when next
 * week is a game week.
 */
export function plannableWeeks(signupDate: LocalDate, today: LocalDate): LocalDate[] {
  const position = calendarPosition(signupDate, today);
  const weeks: LocalDate[] = [];
  if (position.phase === 'preseason') return [position.openingDay];
  if (position.phase === 'season') weeks.push(position.seriesStart);
  if (weekday(today) >= NEXT_WEEK_OPENS_WEEKDAY) {
    const nextMonday = nextMondayOnOrAfter(addDays(today, 1));
    if (calendarPosition(signupDate, nextMonday).phase === 'season') weeks.push(nextMonday);
  }
  return weeks;
}

/** The next date after `after` with a game (skips Review Week). For one-off carryovers. */
export function nextGameDate(signupDate: LocalDate, after: LocalDate): LocalDate {
  let d = addDays(after, 1);
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    if (calendarPosition(signupDate, d).phase === 'season') return d;
  }
  throw new RangeError(`No game day found after ${after}`);
}

/** Dates of the series that starts on `seriesStart`. */
export function weekDates(seriesStart: LocalDate): LocalDate[] {
  return Array.from({ length: SERIES_LENGTH }, (_, i) => addDays(seriesStart, i));
}

/** True when `date` falls in the series that starts on `seriesStart`. */
export function isInWeek(seriesStart: LocalDate, date: LocalDate): boolean {
  return compareDates(date, seriesStart) >= 0 && compareDates(date, addDays(seriesStart, SERIES_LENGTH - 1)) <= 0;
}
