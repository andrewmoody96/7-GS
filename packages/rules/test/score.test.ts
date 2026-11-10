import { describe, expect, it } from 'vitest';
import { displayScore, opponentScore, scoreline } from '../src';

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

describe('basketball display scores', () => {
  const seed = 4; // margin 3 + 4 = 7
  const bb = (us: number, them: number, threshold = 4) => displayScore('basketball', { us, them }, threshold, seed);

  it('lands near 100 at the target and loses or wins by a few points', () => {
    expect(bb(0, 3)).toEqual({ us: 0, them: 93 });
    expect(bb(2, 3)).toEqual({ us: 50, them: 93 });
    expect(bb(4, 3)).toEqual({ us: 100, them: 93 });
    expect(bb(5, 3)).toEqual({ us: 125, them: 93 });
    expect(bb(3, 4)).toEqual({ us: 75, them: 93 }); // one short at midnight
  });

  it('ties while a must-make is open, holds steady after, and never drops your score', () => {
    expect(bb(4, 4)).toEqual({ us: 100, them: 100 }); // tied: must-make open
    expect(bb(5, 4)).toEqual({ us: 125, them: 100 }); // must-make in: opponent held
    expect(bb(4, 5)).toEqual({ us: 100, them: 107 }); // missed must-make: you keep 100
  });

  it('keeps the same winner for every target and margin', () => {
    for (let threshold = 1; threshold <= 40; threshold++) {
      for (let s = 0; s < 7; s++) {
        for (let us = 0; us <= threshold + 4; us++) {
          // Every line rules.scoreline can produce: the opponent never sits below one
          // under the target (its baseline), keeps pace, or is one ahead.
          for (const them of [threshold - 1, us, us + 1, Math.max(threshold - 1, us - 1)]) {
            const d = displayScore('basketball', { us, them }, threshold, s);
            expect(Math.sign(d.us - d.them)).toBe(Math.sign(us - them));
          }
        }
      }
    }
  });

  it('leaves baseball alone', () => {
    expect(displayScore('baseball', { us: 4, them: 3 }, 4, seed)).toEqual({ us: 4, them: 3 });
  });
});

describe('hockey display scores', () => {
  const hk = (us: number, them: number, threshold: number) => displayScore('hockey', { us, them }, threshold, 0);

  it('keeps small targets one goal per task', () => {
    expect(hk(0, 2, 3)).toEqual({ us: 0, them: 2 });
    expect(hk(3, 2, 3)).toEqual({ us: 3, them: 2 });
    expect(hk(2, 3, 3)).toEqual({ us: 2, them: 3 });
  });

  it('turns a big target into about four goals, and most games end by one', () => {
    expect(hk(0, 7, 8)).toEqual({ us: 0, them: 3 });
    expect(hk(4, 7, 8)).toEqual({ us: 2, them: 3 });
    expect(hk(8, 7, 8)).toEqual({ us: 4, them: 3 });
    expect(hk(10, 7, 8)).toEqual({ us: 5, them: 3 });
    expect(hk(6, 7, 8)).toEqual({ us: 3, them: 4 }); // short at midnight
    expect(hk(8, 9, 8)).toEqual({ us: 4, them: 5 }); // missed must-score: you keep 4
    expect(hk(8, 8, 8)).toEqual({ us: 4, them: 4 }); // tied: must-score open
  });

  it('keeps the same winner for every possible scoreline', () => {
    for (let threshold = 1; threshold <= 40; threshold++) {
      for (let us = 0; us <= threshold + 6; us++) {
        for (const them of [threshold - 1, us, us + 1, Math.max(threshold - 1, us - 1)]) {
          const d = hk(us, them, threshold);
          expect(Math.sign(d.us - d.them)).toBe(Math.sign(us - them));
          expect(Math.max(d.us, d.them)).toBeLessThanOrEqual(Math.max(5, Math.ceil(((threshold + 7) * 4) / threshold)));
        }
      }
    }
  });
});
