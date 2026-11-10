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

describe('live scoreboard: no lead until every must-hit is in', () => {
  const t = (minute: number) => `2026-10-05T14:${String(minute).padStart(2, '0')}:00Z`;
  const entry = (points: number, required: boolean, at: number | null) => ({
    points,
    required,
    role: 'lineup' as const,
    completedAt: at === null ? null : t(at),
  });

  it('sits at its baseline when the game has no must-hits, or you are short of it', () => {
    expect(scoreline({ result: null, runs: 5, threshold: 4, entries: [entry(5, false, 1)] })).toMatchObject({ us: 5, them: 3 });
    expect(scoreline({ result: null, runs: 1, threshold: 4, entries: [entry(1, false, 1), entry(1, true, null)] })).toMatchObject({ us: 1, them: 3 });
  });

  it('keeps pace while a must-hit is open: tied at best', () => {
    const entries = [entry(1, false, 1), entry(1, false, 2), entry(1, false, 3), entry(1, false, 4), entry(1, true, null)];
    expect(scoreline({ result: null, runs: 4, threshold: 4, entries })).toMatchObject({ us: 4, them: 4 });
  });

  it('stops where it was when the last must-hit goes in, and the lead grows from there', () => {
    const done = [entry(1, false, 1), entry(1, false, 2), entry(1, false, 3), entry(1, false, 4), entry(1, true, 5)];
    expect(scoreline({ result: null, runs: 5, threshold: 4, entries: done })).toMatchObject({ us: 5, them: 4 });
    const more = [...done, entry(2, false, 6)];
    expect(scoreline({ result: null, runs: 7, threshold: 4, entries: more })).toMatchObject({ us: 7, them: 4 });
  });

  it('shows the plain lead when the must-hits went in before the target', () => {
    const entries = [entry(1, true, 1), entry(1, false, 2), entry(1, false, 3), entry(1, false, 4)];
    expect(scoreline({ result: null, runs: 4, threshold: 4, entries })).toMatchObject({ us: 4, them: 3 });
  });

  it('never lets your score drop at the final: a missed must-hit puts the opponent one ahead', () => {
    expect(scoreline({ result: 'L', resultDetail: 'forfeit', runs: 4, threshold: 4 })).toMatchObject({ us: 4, them: 5 });
  });
});
