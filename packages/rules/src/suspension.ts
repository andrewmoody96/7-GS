// Suspended games (GAME_DESIGN §7): for real emergencies. Called during the day or until
// noon the next day, progress is kept and the game resumes later in the week as a
// doubleheader. With no day left to resume, it ends as a no-decision. Uses a Rainout.

import { SERIES_LENGTH } from './constants';
import { addDays, compareDates, startOfWeek, type LocalDate } from './dates';
import type { GameResult, GameStatus } from './enums';
import { rallyDeadline } from './rally';

export interface SuspensionGame {
  id: string;
  scheduledDate: LocalDate;
  playedDate: LocalDate;
  status: GameStatus;
  result: GameResult | null;
  /** Already moved once (rained out or suspended); it can't move again. */
  postponed: boolean;
  suspended?: boolean;
}

export const SUSPENSION_INELIGIBLE_REASONS = [
  'FUTURE_GAME',
  'GAME_WON',
  'NO_DECISION',
  'WINDOW_CLOSED',
  'RALLY_ROLLED',
  'NO_ALLOWANCE',
] as const;
export type SuspensionIneligibleReason = (typeof SUSPENSION_INELIGIBLE_REASONS)[number];

export interface SuspensionInput {
  game: SuspensionGame;
  /** Every game in the same series, including `game`. */
  seriesGames: readonly SuspensionGame[];
  allowancesAvailable: number;
  rallyRolled: boolean;
  /** The user's local date right now. */
  today: LocalDate;
  now: Date;
  timeZone: string;
}

export type SuspensionOptions =
  | {
      ok: true;
      /** Later days in the series it can resume on. Empty = it ends as a no-decision. */
      resumeDates: LocalDate[];
      /** When the suspension window closes (noon the day after the game). */
      deadline: Date;
    }
  | { ok: false; reason: SuspensionIneligibleReason };

/** Same window as the Rally Cap: noon local time on the day after the game. */
export function suspensionDeadline(playedDate: LocalDate, timeZone: string): Date {
  return rallyDeadline(playedDate, timeZone);
}

export function suspensionOptions(input: SuspensionInput): SuspensionOptions {
  const { game, seriesGames, today, now, timeZone } = input;
  const no = (reason: SuspensionIneligibleReason): SuspensionOptions => ({ ok: false, reason });

  // A day that hasn't started is planned around with a Rainout instead.
  if (compareDates(game.playedDate, today) > 0) return no('FUTURE_GAME');
  if (game.result === 'W') return no('GAME_WON');
  if (game.status === 'final' && game.result === null) return no('NO_DECISION');
  const deadline = suspensionDeadline(game.playedDate, timeZone);
  if (now.getTime() >= deadline.getTime()) return no('WINDOW_CLOSED');
  if (input.rallyRolled) return no('RALLY_ROLLED');
  if (input.allowancesAvailable < 1) return no('NO_ALLOWANCE');

  if (game.postponed || game.suspended) return { ok: true, resumeDates: [], deadline };

  const seriesEnd = addDays(startOfWeek(game.scheduledDate), SERIES_LENGTH - 1);
  const hostsMakeup = new Set(
    seriesGames.filter((g) => (g.postponed || g.suspended) && g.id !== game.id).map((g) => g.playedDate),
  );
  const resumeDates: LocalDate[] = [];
  let d = addDays(game.playedDate, 1);
  if (compareDates(d, today) < 0) d = today;
  for (; compareDates(d, seriesEnd) <= 0; d = addDays(d, 1)) {
    if (!hostsMakeup.has(d)) resumeDates.push(d);
  }
  return { ok: true, resumeDates, deadline };
}
