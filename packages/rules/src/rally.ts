// Rally Cap comeback tokens (GAME_DESIGN §6).

import { RALLY } from './constants';
import { addDays, type LocalDate } from './dates';
import type { GameResult, GameStatus } from './enums';
import { zonedTimeToInstant } from './time';

export interface RallyOddsInput {
  /** Consecutive wins before the appealed game, counting only the current season. */
  seasonWinStreak: number;
  runs: number;
  threshold: number;
  tasksDone: number;
  minTasks: number | null;
  missedRequired: number;
  partialOnMissed: boolean;
}

export interface RallyOdds {
  base: number;
  closeness: number;
  missedMustHit: number;
  warningTrack: number;
  runCushion: number;
  /** Sum before the floor and cap. */
  raw: number;
  /** Final chance in whole percent; the roll hits when roll (1–100) <= pct. */
  pct: number;
  limit: 'floor' | 'cap' | null;
  /** Lower of runs/threshold and tasks/minimum, capped at 1. */
  closenessRatio: number;
}

export function baseOddsForStreak(seasonWinStreak: number): number {
  if (seasonWinStreak >= 5) return 34;
  if (seasonWinStreak === 4) return 31;
  if (seasonWinStreak === 3) return 28;
  if (seasonWinStreak === 2) return 24;
  return 20;
}

export function closenessRatio(
  runs: number,
  threshold: number,
  tasksDone: number,
  minTasks: number | null,
): number {
  const runRatio = threshold > 0 ? runs / threshold : 1;
  const taskRatio = minTasks !== null && minTasks > 0 ? tasksDone / minTasks : 1;
  return Math.min(1, runRatio, taskRatio);
}

export function rallyOdds(input: RallyOddsInput): RallyOdds {
  if (input.missedRequired >= 2) {
    throw new RangeError('Rally Cap is not available with two or more missed must-hits');
  }
  const ratio = closenessRatio(input.runs, input.threshold, input.tasksDone, input.minTasks);

  const base = baseOddsForStreak(input.seasonWinStreak);
  const closeness = ratio >= 0.75 ? 0 : ratio >= 0.5 ? -5 : -10;
  const missedMustHit = input.missedRequired === 1 ? -5 : 0;
  const warningTrack = input.missedRequired === 1 && input.partialOnMissed ? 4 : 0;
  // Runs at least 150% of the threshold, in integer math.
  const runCushion = input.threshold > 0 && input.runs * 2 >= input.threshold * 3 ? 2 : 0;

  const raw = base + closeness + missedMustHit + warningTrack + runCushion;
  const pct = Math.min(RALLY.capPct, Math.max(RALLY.floorPct, raw));
  const limit = raw < RALLY.floorPct ? 'floor' : raw > RALLY.capPct ? 'cap' : null;

  return { base, closeness, missedMustHit, warningTrack, runCushion, raw, pct, limit, closenessRatio: ratio };
}

export const RALLY_INELIGIBLE_REASONS = [
  'OUT_OF_SEASON',
  'GAME_NOT_FINAL',
  'GAME_WON',
  'TOO_MANY_MISSED',
  'WINDOW_CLOSED',
  'ALREADY_ROLLED',
  'SERIES_LIMIT',
  'NO_TOKEN',
] as const;
export type RallyIneligibleReason = (typeof RALLY_INELIGIBLE_REASONS)[number];

export interface RallyEligibilityInput {
  inSeason: boolean;
  gameStatus: GameStatus;
  result: GameResult | null;
  missedRequired: number;
  rallyDeadline: Date | null;
  now: Date;
  alreadyRolled: boolean;
  seriesRallyUsed: boolean;
  tokensAvailable: number;
}

export type RallyEligibility =
  | { eligible: true }
  | { eligible: false; reason: RallyIneligibleReason };

export function rallyEligibility(input: RallyEligibilityInput): RallyEligibility {
  const no = (reason: RallyIneligibleReason): RallyEligibility => ({ eligible: false, reason });
  if (!input.inSeason) return no('OUT_OF_SEASON');
  if (input.alreadyRolled) return no('ALREADY_ROLLED');
  if (input.gameStatus !== 'final' || input.result === null) return no('GAME_NOT_FINAL');
  if (input.result === 'W') return no('GAME_WON');
  if (input.missedRequired >= 2) return no('TOO_MANY_MISSED');
  if (input.rallyDeadline === null || input.now.getTime() >= input.rallyDeadline.getTime()) {
    return no('WINDOW_CLOSED');
  }
  if (input.seriesRallyUsed) return no('SERIES_LIMIT');
  if (input.tokensAvailable < 1) return no('NO_TOKEN');
  return { eligible: true };
}

/** Noon local time on the day after the game (exclusive). */
export function rallyDeadline(playedDate: LocalDate, timeZone: string): Date {
  return zonedTimeToInstant(addDays(playedDate, 1), RALLY.windowClosesAt, timeZone);
}

function assertRoll(roll: number): void {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) {
    throw new RangeError(`Roll must be an integer from 1 to 100, got ${roll}`);
  }
}

export function isRallyHit(roll: number, pct: number): boolean {
  assertRoll(roll);
  return roll <= pct;
}

/** Two d10s as shown on screen: tens die 00–90, ones die 0–9; 00 + 0 reads as 100. */
export function percentileDice(roll: number): { tens: number; ones: number } {
  assertRoll(roll);
  return { tens: Math.floor((roll % 100) / 10) * 10, ones: roll % 10 };
}
