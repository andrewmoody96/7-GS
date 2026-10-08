import { describe, expect, it } from 'vitest';
import { ilMinUntil, ilReturnDate, ilStartDate, restorePosition, seasonPace, seasonWindow } from '../src';

const SIGNUP = '2026-10-02';

describe('Injured List', () => {
  it('starts today, or tomorrow when the task is in a game that already had first pitch', () => {
    expect(ilStartDate('2026-10-07', false)).toBe('2026-10-07');
    expect(ilStartDate('2026-10-07', true)).toBe('2026-10-08');
  });

  it('has a 3-game-day minimum that pauses through Review Week', () => {
    expect(ilMinUntil(SIGNUP, '2026-10-07')).toBe('2026-10-10');
    const s1 = seasonWindow(SIGNUP, 1);
    // Starts on the last Saturday of the season: Sat, Sun, then Review Week, then Monday.
    expect(ilMinUntil(SIGNUP, '2027-03-27')).toBe('2027-04-06');
    expect(s1.playEnd).toBe('2027-03-28');
  });

  it('returns the task from tomorrow, or everywhere if the stint hasn’t started', () => {
    expect(ilReturnDate('2026-10-10', '2026-10-07')).toBe('2026-10-11');
    expect(ilReturnDate('2026-10-07', '2026-10-08')).toBe('2026-10-08');
  });

  it('puts a held entry back in its old spot, capped at the end of the order', () => {
    const entries = [
      { role: 'lineup' as const, position: 1 },
      { role: 'lineup' as const, position: 2 },
      { role: 'bench' as const, position: 1 },
    ];
    expect(restorePosition(entries, 'lineup', 2)).toEqual({ position: 2, shiftFrom: 2 });
    expect(restorePosition(entries, 'lineup', 7)).toEqual({ position: 3, shiftFrom: 3 });
    expect(restorePosition(entries, 'bench', 1)).toEqual({ position: 1, shiftFrom: 1 });
    expect(restorePosition([], 'lineup', 4)).toEqual({ position: 1, shiftFrom: 1 });
  });
});

describe('season pace with no-decisions', () => {
  it('keeps the goal over fewer decidable games', () => {
    // 174 decidable games; goal 87 → pace is exactly half.
    expect(seasonPace(10, 10, 87, 1)).toMatchObject({ remaining: 154, expectedWins: 10, gamesBehind: 0 });
    expect(seasonPace(10, 10, 87)).toMatchObject({ remaining: 155 });
  });
});
