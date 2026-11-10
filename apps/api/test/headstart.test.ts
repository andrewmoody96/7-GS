import { describe, expect, it } from 'vitest';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

// Chicago user, sign-up Friday 2026-10-02 (Spring Training); Opening Day Monday 2026-10-05.
// Every starter: Gym (2, must-hit) and Read; runs to win 3.
async function setup() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn('early@example.com', CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        threshold: 3,
        minTasks: null,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: false },
        ],
        bench: [],
      },
    });
  }
  return { t, token };
}

describe('Head Start: playing before Opening Day', () => {
  it('waits for Opening Day unless the user starts early', async () => {
    const { t, token } = await setup();
    const me = await t.ok('getMe', { token });
    expect(me.headStartFrom).toBeNull();
    expect(me.position).toMatchObject({ phase: 'preseason', openingDay: '2026-10-05' });
    expect((await t.ok('getToday', { token })).games).toEqual([]);
  });

  it('turns the rest of the week into games that count, without scoring a series', async () => {
    const { t, token } = await setup();
    const me = await t.ok('startHeadStart', { token });
    expect(me.headStartFrom).toBe('2026-10-02');
    expect(me.position).toEqual({
      phase: 'season',
      seasonNumber: 1,
      seriesNumber: 0,
      gameNumber: 5,
      seriesStart: '2026-09-28',
      seriesEnd: '2026-10-04',
    });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ number: 1, status: 'active', startDate: '2026-10-02', playEndDate: '2026-12-27' });

    // Today is a real game, and the week card shows Friday to Sunday only.
    const today = await t.ok('getToday', { token });
    expect(today.games).toHaveLength(1);
    expect(today.games[0]).toMatchObject({ gameNumber: 5, playedDate: '2026-10-02', threshold: 3 });
    expect(today.series).toMatchObject({ number: 0, startDate: '2026-09-28', result: null });
    expect((await t.ok('listWeeks', { token })).weeks).toEqual([
      { startDate: '2026-09-28', label: 'current', locked: false },
      { startDate: '2026-10-05', label: 'next', locked: false },
    ]);
    const week = await t.ok('getWeek', { token, params: { startDate: '2026-09-28' } });
    expect(week.games.map((g) => g.playedDate)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']);

    // Starting twice is refused, and the goal stays open up to 84 + 3 Head Start games.
    expect(await t.fails('startHeadStart', { token }, 409)).toMatchObject({ code: 'NOT_ELIGIBLE', reason: 'NOT_PRESEASON' });
    const season = await t.ok('getCurrentSeason', { token });
    expect((await t.fails('updateSeason', { token, params: { seasonId: season!.id }, body: { winGoal: 88 } }, 400)).code).toBe(
      'VALIDATION_FAILED',
    );
    expect((await t.ok('updateSeason', { token, params: { seasonId: season!.id }, body: { winGoal: 60 } })).winGoal).toBe(60);

    // Win Friday; Saturday and Sunday go unplayed.
    const game = today.games[0]!;
    for (const e of game.entries) {
      await t.ok('completeEntry', {
        token,
        params: { gameId: game.id, entryId: e.id },
        body: { clientAt: t.clock.now().toISOString() },
      });
    }

    // Opening Day: Series 1 starts 0–0, with the Head Start already in the season record.
    t.at('2026-10-05', '08:00', CHICAGO);
    await t.finalize();
    const monday = await t.ok('getToday', { token });
    expect(monday.position).toMatchObject({ phase: 'season', seasonNumber: 1, seriesNumber: 1, gameNumber: 1 });
    expect(monday.series).toMatchObject({ number: 1, startDate: '2026-10-05', wins: 0, losses: 0 });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({
      number: 1,
      wins: 1,
      losses: 2,
      seriesWon: 0,
      seriesLost: 0,
      winGoal: 60,
    });
    // The goal locks once Series 1 is under way.
    expect(await t.fails('updateSeason', { token, params: { seasonId: season!.id }, body: { winGoal: 50 } }, 409)).toMatchObject({
      code: 'OUT_OF_SEASON',
    });
  });

  it('is only offered during Spring Training', async () => {
    const { t, token } = await setup();
    t.at('2026-10-05', '09:00', CHICAGO);
    expect(await t.fails('startHeadStart', { token }, 409)).toMatchObject({ code: 'NOT_ELIGIBLE' });
  });
});
