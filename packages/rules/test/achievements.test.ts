import { describe, expect, it } from 'vitest';
import {
  achievementStatsFromHistory,
  addDays,
  ACHIEVEMENT_TIERS,
  ACHIEVEMENTS,
  EMPTY_STATS,
  evaluateAchievements,
  newlyEarned,
  newSim,
  simulateDay,
  skipDay,
  type AchievementHistory,
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

describe('stats from history', () => {
  type G = AchievementHistory['games'][number];
  const day = (i: number) => addDays('2026-10-05', i);
  const game = (i: number, result: 'W' | 'L' | null, more: Partial<G> = {}): G => ({
    seriesId: `s${Math.floor(i / 7)}`,
    gameNumber: (i % 7) + 1,
    playedDate: day(i),
    slot: 1,
    result,
    rally: false,
    tasksDone: result === null ? 0 : 3,
    allDone: false,
    ...more,
  });
  const base: AchievementHistory = { openDays: [], teamPhoto: false, defaultLineupsSet: 0, games: [], series: [], seasons: [] };

  it('is empty for a new account', () => {
    expect(achievementStatsFromHistory(base)).toEqual(EMPTY_STATS);
  });

  it('counts streaks across days and games in order, whatever order they arrive in', () => {
    const results: ('W' | 'L')[] = ['W', 'L', 'W', 'W', 'W', 'L', 'W'];
    const games = results.map((r, i) => game(i, r, { allDone: i === 2 || i === 3, rally: i === 6 })).reverse();
    const s = achievementStatsFromHistory({
      ...base,
      // Days 0–2 and 4–9 opened (a gap on day 3), one twice.
      openDays: [day(0), day(1), day(2), day(4), day(5), day(6), day(7), day(8), day(9), day(9)],
      teamPhoto: true,
      defaultLineupsSet: 7,
      games,
    });
    expect(s).toMatchObject({
      daysOpened: 9,
      longestOpenStreak: 6,
      teamPhoto: 1,
      defaultLineupsSet: 7,
      tasksDone: 21,
      longestCheckStreak: 7,
      gamesPlayed: 7,
      wins: 5,
      longestWinStreak: 3,
      perfectGames: 2,
      bestPerfectInSeries: 2,
      bounceBacks: 2,
      rallyWins: 1,
    });
  });

  it('skips no-decisions in streaks but a day with nothing done breaks the check-off streak', () => {
    const s = achievementStatsFromHistory({ ...base, games: [game(0, 'W'), game(1, null), game(2, 'W')] });
    expect(s).toMatchObject({ gamesPlayed: 2, longestWinStreak: 2, bounceBacks: 0, longestCheckStreak: 1 });
  });

  it('judges finished series: sweeps, reverse sweeps, Game 7s and Iron Man weeks', () => {
    const week = (n: number, results: ('W' | 'L')[]) => results.map((r, i) => game(n * 7 + i, r));
    const sweep = week(0, ['W', 'W', 'W', 'W', 'W', 'W', 'W']);
    const reverse = week(1, ['L', 'L', 'L', 'W', 'W', 'W', 'W']);
    const lost = week(2, ['L', 'W', 'L', 'W', 'L', 'W', 'L']);
    const game7 = week(3, ['W', 'L', 'W', 'L', 'W', 'L', 'W']);
    const s = achievementStatsFromHistory({
      ...base,
      games: [...sweep, ...reverse, ...lost, ...game7],
      series: [
        { id: 's0', result: 'won', wins: 7, ironMan: true },
        { id: 's1', result: 'won', wins: 4, ironMan: true },
        { id: 's2', result: 'lost', wins: 3, ironMan: false },
        { id: 's3', result: 'won', wins: 4, ironMan: true },
      ],
    });
    expect(s).toMatchObject({ seriesWon: 3, sweeps: 1, reverseSweeps: 1, game7Wins: 2, ironMans: 3 });
  });

  it('counts a win goal when reached, and season results once the season is over', () => {
    const s = achievementStatsFromHistory({
      ...base,
      seasons: [
        { wins: 60, losses: 24, winGoal: 50, finished: true, seriesWon: 12, seriesLost: 0 },
        { wins: 40, losses: 44, winGoal: 60, finished: true, seriesWon: 5, seriesLost: 7 },
        { wins: 55, losses: 10, winGoal: 55, finished: false, seriesWon: 9, seriesLost: 0 },
      ],
    });
    expect(s).toMatchObject({ goalsReached: 2, winningSeasons: 1, perfectSeasons: 1 });
  });
});
