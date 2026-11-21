import type { GameDto } from '@7gs/contracts';
import { addDays, evaluateAchievements } from '@7gs/rules';
import { describe, expect, it } from 'vitest';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

/**
 * Chicago user, sign-up Friday 2026-10-02. Every day: Gym (3) and Read must-hits, Walk and
 * Stretch. Runs to win: 4 + half of 2 = 5. Gym, Read and Walk win; all four is perfect
 * (and counts for badges: 5+ runs to win, 3+ tasks).
 */
async function setup(email: string) {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn(email, CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 3 }, { name: 'Read' }, { name: 'Walk' }, { name: 'Stretch' }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: true },
          { taskId: ids.Walk!, position: 3, required: false },
          { taskId: ids.Stretch!, position: 4, required: false },
        ],
        bench: [],
      },
    });
  }
  return { t, token };
}

async function playDay(t: TestApp, token: string, date: string, names: string[]): Promise<GameDto> {
  t.at(date, '20:00', CHICAGO);
  const [game] = (await t.ok('getToday', { token })).games;
  for (const name of names) {
    const entry = game!.entries.find((e) => e.taskName === name)!;
    await t.ok('completeEntry', { token, params: { gameId: game!.id, entryId: entry.id }, body: { clientAt: t.clock.now().toISOString() } });
  }
  t.at(addDays(date, 1), '00:30', CHICAGO);
  await t.finalize();
  return game!;
}

const earnedIds = (stats: Parameters<typeof evaluateAchievements>[0]) =>
  evaluateAchievements(stats)
    .filter((p) => p.earned)
    .map((p) => p.achievement.id);

describe('badges', () => {
  it('starts with the first day and a planned week', async () => {
    const { t, token } = await setup('badges-new@example.com');
    const { stats } = await t.ok('getAchievements', { token });
    expect(stats).toMatchObject({ daysOpened: 1, defaultLineupsSet: 7, gamesPlayed: 0, teamPhoto: 0 });
    expect(earnedIds(stats)).toEqual(['first-pitch', 'game-plan']);
  });

  it('works out a week of play from history, Iron Man and all', async () => {
    const { t, token } = await setup('badges-week@example.com');
    // Mon–Sun: W W L W W W W. Monday and Tuesday perfect; Wednesday misses Read (an L).
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    for (const [i, date] of days.entries()) {
      await playDay(t, token, date, i < 2 ? ['Gym', 'Read', 'Walk', 'Stretch'] : i === 2 ? ['Gym', 'Walk', 'Stretch'] : ['Gym', 'Read', 'Walk']);
    }
    t.at('2026-10-12', '09:00', CHICAGO);
    const { stats } = await t.ok('getAchievements', { token });
    expect(stats).toMatchObject({
      gamesPlayed: 7,
      wins: 6,
      longestWinStreak: 4,
      perfectGames: 2,
      bestPerfectInSeries: 2,
      bounceBacks: 1,
      tasksDone: 4 + 4 + 3 + 3 * 4,
      longestCheckStreak: 7,
      seriesWon: 1,
      ironManWins: 1,
      longestIronManRun: 1,
    });
    // Opened on sign-up day, each evening it played, and this morning: Oct 2 and Oct 5–12.
    expect(stats.daysOpened).toBe(9);
    expect(stats.longestOpenStreak).toBe(8);
    expect(earnedIds(stats)).toEqual(
      expect.arrayContaining(['first-pitch', 'game-plan', 'on-the-board', 'on-a-roll', 'series-winner', 'hot-hand', 'regular', 'iron-man']),
    );
  });

  it('counts the team photo', async () => {
    const { t, token } = await setup('badges-photo@example.com');
    const image = `data:image/png;base64,${'A'.repeat(64)}`;
    await t.ok('putAvatar', { token, body: { image } });
    expect((await t.ok('getAchievements', { token })).stats.teamPhoto).toBe(1);
  });
});
