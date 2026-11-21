import type { GameDto } from '@7gs/contracts';
import { addDays, evaluateAchievements } from '@7gs/rules';
import { describe, expect, it } from 'vitest';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

/** Every day: Gym (2) and Read must-hits, Walk and Stretch. Gym, Read and Walk win. */
async function setup(email: string) {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn(email, CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }, { name: 'Walk' }, { name: 'Stretch' }]);
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

const WIN = ['Gym', 'Read', 'Walk'];
const LOSS = ['Gym', 'Walk'];

const earned = (stats: Parameters<typeof evaluateAchievements>[0], id: string) =>
  evaluateAchievements(stats).find((p) => p.achievement.id === id)?.earned;

describe('a series is credited the moment it’s decided', () => {
  it('counts the series win, and the Series Winner badge, once the 4th W is final', async () => {
    const { t, token } = await setup('clinch-win@example.com');
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07']) await playDay(t, token, date, WIN);
    t.at('2026-10-08', '09:00', CHICAGO);
    expect((await t.ok('getAchievements', { token })).stats.seriesWon).toBe(0); // 3–0: not yet

    await playDay(t, token, '2026-10-08', WIN); // the 4th W goes final at 12:30 a.m. Friday
    t.at('2026-10-09', '09:00', CHICAGO);
    expect(await t.ok('getCurrentSeries', { token })).toMatchObject({ wins: 4, losses: 0, result: 'won' });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ seriesWon: 1, seriesLost: 0 });
    const { stats } = await t.ok('getAchievements', { token });
    expect(stats).toMatchObject({ seriesWon: 1, ironMans: 0 });
    expect(earned(stats, 'series-winner')).toBe(true);
    // Iron Man needs the whole week: it waits for Sunday.
    expect(earned(stats, 'iron-man')).toBe(false);

    for (const date of ['2026-10-09', '2026-10-10', '2026-10-11']) await playDay(t, token, date, WIN);
    t.at('2026-10-12', '09:00', CHICAGO);
    const after = (await t.ok('getAchievements', { token })).stats;
    expect(after).toMatchObject({ seriesWon: 1, sweeps: 1, ironMans: 1 });
  });

  it('counts the series loss once the 4th L is final', async () => {
    const { t, token } = await setup('clinch-loss@example.com');
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) await playDay(t, token, date, LOSS);
    t.at('2026-10-09', '09:00', CHICAGO);
    expect(await t.ok('getCurrentSeries', { token })).toMatchObject({ wins: 0, losses: 4, result: 'lost' });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ seriesWon: 0, seriesLost: 1 });
    expect((await t.ok('getAchievements', { token })).stats.seriesWon).toBe(0);
  });
});
