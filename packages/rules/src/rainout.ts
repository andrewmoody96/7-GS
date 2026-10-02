// Rainouts become makeup doubleheaders later in the same series (GAME_DESIGN §7).

import { SERIES_LENGTH } from './constants';
import { addDays, compareDates, startOfWeek, weekday, type LocalDate } from './dates';
import type { GameStatus } from './enums';

export interface RainoutGame {
  id: string;
  scheduledDate: LocalDate;
  playedDate: LocalDate;
  /** True once this game has been rained out and moved (it is now a makeup game). */
  postponed: boolean;
  status: GameStatus;
  lockedAt: Date | string | null;
}

export const RAINOUT_INELIGIBLE_REASONS = [
  'GAME_FINAL',
  'GAME_LOCKED',
  'MAKEUP_GAME',
  'SUNDAY',
  'PAST_GAME',
  'NO_ALLOWANCE',
  'NO_MAKEUP_DATES',
] as const;
export type RainoutIneligibleReason = (typeof RAINOUT_INELIGIBLE_REASONS)[number];

export interface RainoutInput {
  game: RainoutGame;
  /** Every game in the same series, including `game`. */
  seriesGames: readonly RainoutGame[];
  allowancesAvailable: number;
  /** The user's local date right now. */
  today: LocalDate;
}

export type RainoutOptions =
  | { ok: true; makeupDates: LocalDate[] }
  | { ok: false; reason: RainoutIneligibleReason };

export function rainoutOptions(input: RainoutInput): RainoutOptions {
  const { game, seriesGames, allowancesAvailable, today } = input;
  const no = (reason: RainoutIneligibleReason): RainoutOptions => ({ ok: false, reason });

  if (game.status === 'final') return no('GAME_FINAL');
  if (game.postponed) return no('MAKEUP_GAME');
  if (game.lockedAt !== null) return no('GAME_LOCKED');
  if (compareDates(game.scheduledDate, today) < 0) return no('PAST_GAME');
  if (weekday(game.scheduledDate) === 7) return no('SUNDAY');
  if (allowancesAvailable < 1) return no('NO_ALLOWANCE');

  const seriesEnd = addDays(startOfWeek(game.scheduledDate), SERIES_LENGTH - 1);
  const hostsMakeup = new Set(
    seriesGames.filter((g) => g.postponed && g.id !== game.id).map((g) => g.playedDate),
  );

  const makeupDates: LocalDate[] = [];
  for (let d = addDays(game.scheduledDate, 1); compareDates(d, seriesEnd) <= 0; d = addDays(d, 1)) {
    if (!hostsMakeup.has(d)) makeupDates.push(d);
  }
  if (makeupDates.length === 0) return no('NO_MAKEUP_DATES');
  return { ok: true, makeupDates };
}

/** Defaults to the next available day, per the design. */
export function defaultMakeupDate(options: RainoutOptions): LocalDate | null {
  return options.ok ? (options.makeupDates[0] ?? null) : null;
}
