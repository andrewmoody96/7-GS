// What the scoreboard shows (GAME_DESIGN §4). A final can never be tied: a W always
// shows more runs than the opponent and an L always shows fewer, like a real box score.

import type { GameResult, ResultDetail } from './enums';

export interface ScoreInput {
  /** null while the game is still being played. */
  result: GameResult | null;
  resultDetail?: ResultDetail | null;
  runs: number;
  /** "Runs to win" as set by the user. */
  threshold: number;
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
  return { us: input.runs, them: baseline, walkOffRuns: 0, opponentBonusRuns: 0 };
}
