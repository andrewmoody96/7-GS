import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_TIERS,
  ACHIEVEMENTS,
  EMPTY_STATS,
  evaluateAchievements,
  newlyEarned,
  newSim,
  simulateDay,
  skipDay,
  type AchievementSim,
  type SimDay,
} from '../src';

const play = (sim: AchievementSim, days: SimDay[]) => days.reduce(simulateDay, sim);
const earned = (sim: AchievementSim) =>
  evaluateAchievements(sim.stats)
    .filter((p) => p.earned)
    .map((p) => p.achievement.id);
const W: SimDay = { kind: 'game', result: 'W' };
const P: SimDay = { kind: 'game', result: 'W', perfect: true };
const L: SimDay = { kind: 'game', result: 'L' };

describe('achievement catalog', () => {
  it('has unique ids and badges in every tier', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const tier of ACHIEVEMENT_TIERS) expect(ACHIEVEMENTS.some((a) => a.tier === tier)).toBe(true);
  });

  it('starts with nothing and caps progress at the target', () => {
    expect(evaluateAchievements(EMPTY_STATS).every((p) => !p.earned && p.current === 0)).toBe(true);
    const warmUp = evaluateAchievements({ ...EMPTY_STATS, tasksDone: 40 }).find((p) => p.achievement.id === 'warm-up')!;
    expect(warmUp).toMatchObject({ earned: true, current: 25 });
  });
});

describe('simulating days', () => {
  it('earns the first-day badges', () => {
    const sim = play(newSim(), [P]);
    expect(earned(sim)).toEqual(['first-pitch', 'on-the-board', 'perfect-game']);
  });

  it('counts a week of check-offs, and an empty day breaks it', () => {
    const six = play(newSim(), [W, L, W, L, W, L]);
    expect(earned(six)).not.toContain('on-a-roll');
    expect(newlyEarned(six.stats, simulateDay(six, L).stats).map((a) => a.id)).toContain('on-a-roll');
    const broken = play(simulateDay(six, { kind: 'open' }), [W]);
    expect(broken.checkStreak).toBe(1);
    expect(earned(broken)).not.toContain('on-a-roll');
  });

  it('wins a series, a sweep, a reverse sweep and a Game 7', () => {
    const sweep = play(newSim(), [W, W, W, W, W, W, W]);
    expect(sweep.stats).toMatchObject({ seriesWon: 1, sweeps: 1, ironMans: 1, longestWinStreak: 7 });
    const reverse = play(newSim(), [L, L, L, W, W, W, W]);
    expect(reverse.stats).toMatchObject({ seriesWon: 1, reverseSweeps: 1, game7Wins: 1, sweeps: 0 });
    const lost = play(newSim(), [W, W, W, L, L, L, L]);
    expect(lost.stats).toMatchObject({ seriesWon: 0, game7Wins: 0, bounceBacks: 0 });
  });

  it('closes a season: winning, goal reached, perfect', () => {
    const season = play(newSim(), Array<SimDay>(84).fill(W));
    expect(season.stats).toMatchObject({ winningSeasons: 1, goalsReached: 1, perfectSeasons: 1, seriesWon: 12 });
    expect(season.season).toEqual({ wins: 0, losses: 0, seriesWon: 0, seriesPlayed: 0 });
  });

  it('tracks open streaks across skipped days', () => {
    let sim = play(newSim(), Array<SimDay>(6).fill({ kind: 'open' }));
    sim = play(skipDay(sim), [{ kind: 'open' }]);
    expect(sim.stats).toMatchObject({ daysOpened: 7, longestOpenStreak: 6 });
    expect(earned(sim)).not.toContain('regular');
  });
});

describe('medals', () => {
  it('gives every badge its own icon', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.icon)).size).toBe(ACHIEVEMENTS.length);
  });
});
