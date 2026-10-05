import { describe, expect, it } from 'vitest';
import {
  baseOddsForStreak,
  isRallyHit,
  percentileDice,
  rallyDeadline,
  rallyEligibility,
  rallyOdds,
  type RallyEligibilityInput,
} from '../src';

describe('rally odds', () => {
  it('scales the base with the season win streak', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(baseOddsForStreak)).toEqual([20, 20, 24, 28, 31, 34, 34]);
  });

  // The four worked examples from GAME_DESIGN §6.
  it('example: 5-game streak, partial must-hit missed, scored 8 vs 5 → 35%', () => {
    const odds = rallyOdds({
      seasonWinStreak: 5,
      runs: 8,
      threshold: 5,
      tasksDone: 4,
      minTasks: null,
      missedRequired: 1,
      partialOnMissed: true,
    });
    expect(odds).toMatchObject({ base: 34, closeness: 0, missedMustHit: -5, warningTrack: 4, runCushion: 2, pct: 35 });
  });

  it('example: no streak, all must-hits done, scored 4 vs 5 → 20%', () => {
    const odds = rallyOdds({
      seasonWinStreak: 0,
      runs: 4,
      threshold: 5,
      tasksDone: 4,
      minTasks: null,
      missedRequired: 0,
      partialOnMissed: false,
    });
    expect(odds.pct).toBe(20);
  });

  it('example: 3-game streak, missed one must-hit, scored 2 vs 5 → 13%', () => {
    const odds = rallyOdds({
      seasonWinStreak: 3,
      runs: 2,
      threshold: 5,
      tasksDone: 2,
      minTasks: null,
      missedRequired: 1,
      partialOnMissed: false,
    });
    expect(odds).toMatchObject({ base: 28, closeness: -10, missedMustHit: -5, pct: 13, limit: null });
  });

  it('example: no streak, one must-hit missed, nothing else done → floor of 10%', () => {
    const odds = rallyOdds({
      seasonWinStreak: 0,
      runs: 0,
      threshold: 5,
      tasksDone: 0,
      minTasks: null,
      missedRequired: 1,
      partialOnMissed: false,
    });
    expect(odds).toMatchObject({ raw: 5, pct: 10, limit: 'floor' });
  });

  it('uses the lower of the run and minimum-task ratios for closeness', () => {
    const odds = rallyOdds({
      seasonWinStreak: 0,
      runs: 5,
      threshold: 5,
      tasksDone: 1,
      minTasks: 3,
      missedRequired: 0,
      partialOnMissed: false,
    });
    expect(odds.closenessRatio).toBeCloseTo(1 / 3);
    expect(odds.closeness).toBe(-10);
  });

  it('applies the 50–74% closeness band', () => {
    const odds = rallyOdds({
      seasonWinStreak: 0,
      runs: 3,
      threshold: 5,
      tasksDone: 3,
      minTasks: null,
      missedRequired: 0,
      partialOnMissed: false,
    });
    expect(odds).toMatchObject({ closeness: -5, pct: 15 });
  });

  it('never exceeds the 40% cap', () => {
    // The maximum reachable raw value is 34 + 4 + 2 - 5 = 35, so the cap is a guard.
    const odds = rallyOdds({
      seasonWinStreak: 12,
      runs: 30,
      threshold: 5,
      tasksDone: 10,
      minTasks: null,
      missedRequired: 0,
      partialOnMissed: false,
    });
    expect(odds.pct).toBeLessThanOrEqual(40);
  });

  it('refuses two or more missed must-hits', () => {
    expect(() =>
      rallyOdds({
        seasonWinStreak: 0,
        runs: 0,
        threshold: 1,
        tasksDone: 0,
        minTasks: null,
        missedRequired: 2,
        partialOnMissed: false,
      }),
    ).toThrow(RangeError);
  });
});

describe('rally eligibility', () => {
  const now = new Date('2026-10-06T15:00:00Z');
  const base: RallyEligibilityInput = {
    inSeason: true,
    gameStatus: 'final',
    result: 'L',
    missedRequired: 1,
    rallyDeadline: new Date('2026-10-06T17:00:00Z'),
    now,
    alreadyRolled: false,
    seriesRallyUsed: false,
    tokensAvailable: 1,
  };

  it('allows a final loss with at most one missed must-hit inside the window', () => {
    expect(rallyEligibility(base)).toEqual({ eligible: true });
  });

  it.each([
    [{ inSeason: false }, 'OUT_OF_SEASON'],
    [{ alreadyRolled: true }, 'ALREADY_ROLLED'],
    [{ gameStatus: 'live' as const }, 'GAME_NOT_FINAL'],
    [{ result: null }, 'NO_DECISION'],
    [{ result: 'W' as const }, 'GAME_WON'],
    [{ missedRequired: 2 }, 'TOO_MANY_MISSED'],
    [{ rallyDeadline: new Date('2026-10-06T15:00:00Z') }, 'WINDOW_CLOSED'],
    [{ seriesRallyUsed: true }, 'SERIES_LIMIT'],
    [{ tokensAvailable: 0 }, 'NO_TOKEN'],
  ])('rejects %o with %s', (patch, reason) => {
    expect(rallyEligibility({ ...base, ...patch })).toEqual({ eligible: false, reason });
  });

  it('closes the window at noon local time the next day', () => {
    expect(rallyDeadline('2026-10-05', 'America/Chicago').toISOString()).toBe('2026-10-06T17:00:00.000Z');
  });
});

describe('rolls and dice', () => {
  it('hits when the roll is at or under the odds', () => {
    expect(isRallyHit(34, 34)).toBe(true);
    expect(isRallyHit(35, 34)).toBe(false);
    expect(() => isRallyHit(0, 34)).toThrow(RangeError);
    expect(() => isRallyHit(101, 34)).toThrow(RangeError);
  });

  it('maps rolls to percentile dice faces', () => {
    expect(percentileDice(34)).toEqual({ tens: 30, ones: 4 });
    expect(percentileDice(7)).toEqual({ tens: 0, ones: 7 });
    expect(percentileDice(40)).toEqual({ tens: 40, ones: 0 });
    expect(percentileDice(100)).toEqual({ tens: 0, ones: 0 });
  });
});
