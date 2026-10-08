// The Injured List under the weekly lock (GAME_DESIGN §7). A stint takes a task out of
// planned lineups without lowering runs to win, and remembers each spot it vacated (a
// "hold") so activation puts the task back exactly where it was.

import { IL_MIN_DAYS } from './constants';
import { isGameDay } from './calendar';
import { addDays, compareDates, type LocalDate } from './dates';

/**
 * The first date a stint starting on `start` may end: IL_MIN_DAYS game days later.
 * Days without games (Spring Training, Review Week) don't count, so a stint pauses
 * through the offseason. In season this is `start + 3 days`.
 */
export function ilMinUntil(signupDate: LocalDate, start: LocalDate): LocalDate {
  let day = start;
  let counted = 0;
  for (let i = 0; i < 400 && counted < IL_MIN_DAYS; i++) {
    if (isGameDay(signupDate, day)) counted++;
    day = addDays(day, 1);
  }
  return day;
}

/**
 * When a stint starts. A task in today's game must still be played today once that game
 * (or its week) has had first pitch, so its stint starts tomorrow; otherwise today.
 */
export function ilStartDate(today: LocalDate, inStartedGameToday: boolean): LocalDate {
  return inStartedGameToday ? addDays(today, 1) : today;
}

/**
 * The first game date a task returns to on activation. Activating rejoins lineups from
 * the next day; cancelling a stint that hasn't started yet returns it everywhere.
 */
export function ilReturnDate(today: LocalDate, stintStart: LocalDate): LocalDate {
  return compareDates(today, stintStart) < 0 ? stintStart : addDays(today, 1);
}

export interface PositionedEntry {
  role: 'lineup' | 'bench' | 'subbed_out';
  position: number;
}

/**
 * Where a held entry goes back: its old spot in the batting order (or bench), capped at
 * the end. Entries of the same role at or after that spot move down one.
 */
export function restorePosition(
  entries: readonly PositionedEntry[],
  role: 'lineup' | 'bench',
  wanted: number,
): { position: number; shiftFrom: number } {
  const last = Math.max(0, ...entries.filter((e) => e.role === role).map((e) => e.position));
  const position = Math.max(1, Math.min(wanted, last + 1));
  return { position, shiftFrom: position };
}
