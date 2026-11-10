// What the scoreboard shows (GAME_DESIGN §4). A final can never be tied: a W always
// shows more runs than the opponent and an L always shows fewer, like a real box score.

import type { GameResult, ResultDetail } from './enums';

/** A lineup entry, as much as the live scoreboard needs to know about it. */
export interface ScoreEntry {
  points: number;
  required: boolean;
  role: 'lineup' | 'bench' | 'subbed_out';
  /** When it was checked off (any sortable timestamp), or null. */
  completedAt: string | null;
}

export interface ScoreInput {
  /** null while the game is still being played. */
  result: GameResult | null;
  resultDetail?: ResultDetail | null;
  runs: number;
  /** "Runs to win" as set by the user. */
  threshold: number;
  /**
   * The lineup, for a game in progress: with it, an open must-hit keeps the opponent level
   * (see liveOpponent). Without it, the opponent sits at its baseline.
   */
  entries?: readonly ScoreEntry[];
}

export interface Scoreline {
  us: number;
  them: number;
  /** Walk-off runs credited to the user on a Rally Cap win that was short on runs. */
  walkOffRuns: number;
  /** Runs credited to the opponent on a loss that would otherwise read as a tie or a win. */
  opponentBonusRuns: number;
}

/** The opponent's baseline score: one less than the user's runs to win. */
export function opponentScore(threshold: number): number {
  return Math.max(0, threshold - 1);
}

export function scoreline(input: ScoreInput): Scoreline {
  const baseline = opponentScore(input.threshold);
  if (input.result === 'W') {
    const us = Math.max(input.runs, baseline + 1);
    return { us, them: baseline, walkOffRuns: us - input.runs, opponentBonusRuns: 0 };
  }
  if (input.result === 'L') {
    const them = Math.max(baseline, input.runs + 1);
    return { us: input.runs, them, walkOffRuns: 0, opponentBonusRuns: them - baseline };
  }
  // In progress: ties are fine until the game is final.
  const them = input.entries ? liveOpponent(input.runs, input.threshold, input.entries) : baseline;
  return { us: input.runs, them, walkOffRuns: 0, opponentBonusRuns: 0 };
}

/**
 * The opponent's score during a game. You never show a lead you haven't earned:
 * - while a must-hit is open, the opponent keeps pace, so the best you can be is tied;
 * - finishing the last must-hit breaks the tie: the opponent stops where it was (your
 *   runs just before that must-hit) and every task after widens the lead.
 * Your own score only ever goes up with check-offs.
 */
export function liveOpponent(runs: number, threshold: number, entries: readonly ScoreEntry[]): number {
  const baseline = opponentScore(threshold);
  const musts = entries.filter((e) => e.role === 'lineup' && e.required);
  if (musts.length === 0) return baseline;
  if (musts.some((e) => e.completedAt === null)) return Math.max(baseline, runs);
  // All must-hits in: freeze the opponent at your runs just before the last one.
  const last = musts.reduce((a, b) => ((b.completedAt ?? '') > (a.completedAt ?? '') ? b : a));
  const before = entries
    .filter((e) => e.role === 'lineup' && e.completedAt !== null && e !== last && (e.completedAt ?? '') <= (last.completedAt ?? ''))
    .reduce((n, e) => n + e.points, 0);
  return Math.max(baseline, Math.min(before, runs - 1));
}
