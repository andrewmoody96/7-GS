import { describe, expect, it } from 'vitest';
import { opponentScore, scoreline } from '../src';

describe('scoreline', () => {
  it('puts the opponent one run below the runs to win', () => {
    expect(opponentScore(4)).toBe(3);
    expect(opponentScore(1)).toBe(0);
  });

  it('shows a W reached exactly on the number as a one-run win, not a tie', () => {
    expect(scoreline({ result: 'W', resultDetail: 'clean', runs: 4, threshold: 4 })).toEqual({
      us: 4,
      them: 3,
      walkOffRuns: 0,
      opponentBonusRuns: 0,
    });
  });

  it('keeps every real run on a big win', () => {
    expect(scoreline({ result: 'W', resultDetail: 'clean', runs: 9, threshold: 4 })).toMatchObject({ us: 9, them: 3 });
  });

  it('credits walk-off runs on a Rally Cap win that was short', () => {
    expect(scoreline({ result: 'W', resultDetail: 'rally', runs: 2, threshold: 5 })).toEqual({
      us: 5,
      them: 4,
      walkOffRuns: 3,
      opponentBonusRuns: 0,
    });
  });

  it('never shows a loss as a tie', () => {
    expect(scoreline({ result: 'L', resultDetail: 'short', runs: 3, threshold: 4 })).toEqual({
      us: 3,
      them: 4,
      walkOffRuns: 0,
      opponentBonusRuns: 1,
    });
    expect(scoreline({ result: 'L', resultDetail: 'short', runs: 1, threshold: 4 })).toMatchObject({ us: 1, them: 3 });
  });

  it('never shows a loss with more runs than the opponent (missed must-hit)', () => {
    expect(scoreline({ result: 'L', resultDetail: 'forfeit', runs: 8, threshold: 4 })).toMatchObject({ us: 8, them: 9 });
  });

  it('allows ties while the game is still live', () => {
    expect(scoreline({ result: null, runs: 3, threshold: 4 })).toMatchObject({ us: 3, them: 3 });
  });

  it('never produces a tied final', () => {
    for (let threshold = 1; threshold <= 12; threshold++) {
      for (let runs = 0; runs <= 15; runs++) {
        for (const result of ['W', 'L'] as const) {
          const { us, them } = scoreline({ result, runs, threshold });
          expect(result === 'W' ? us > them : us < them).toBe(true);
        }
      }
    }
  });
});
