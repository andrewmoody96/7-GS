import type { GameDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';
import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { games, rainoutAllowances, rallyTokens, seasons } from '../src/db/schema';
import { CHICAGO, createTasks, snapshotDb, TestApp, TOKYO, useTestDb } from './helpers';

const env = useTestDb();

/** Every starter: Gym (2, must-hit), Read (must-hit), Walk in the lineup; Stretch on the bench. */
async function setupUser(t: TestApp, email: string, tz: string, threshold = 4) {
  const { token, userId } = await t.signIn(email, tz);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }, { name: 'Walk' }, { name: 'Stretch' }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        threshold,
        minTasks: null,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: true },
          { taskId: ids.Walk!, position: 3, required: false },
        ],
        bench: [{ taskId: ids.Stretch!, position: 1 }],
      },
    });
  }
  return { token, userId, ids };
}

function entryId(game: GameDto, name: string): string {
  const found = game.entries.find((e) => e.taskName === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found.id;
}

/** At 8 p.m. local on `date`, check off `names` in that day's game. */
async function play(t: TestApp, token: string, date: string, tz: string, names: string[]): Promise<GameDto> {
  t.at(date, '20:00', tz);
  const [game] = (await t.ok('getToday', { token })).games;
  if (!game) throw new Error(`no game on ${date}`);
  for (const name of names) {
    await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: entryId(game, name) },
      body: { clientAt: t.clock.now().toISOString() },
    });
  }
  return game;
}

/** 12:30 a.m. local after `date`: the finalizer's settle time for that date. */
async function settle(t: TestApp, date: string, tz: string) {
  t.at(addDays(date, 1), '00:30', tz);
  return t.finalize();
}

describe('finalizer', () => {
  it('finalizes 30 minutes after local midnight in America/Chicago', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, ids } = await setupUser(t, 'chicago@example.com', CHICAGO);
    const monday = await play(t, token, '2026-10-05', CHICAGO, ['Gym', 'Read', 'Walk']);

    t.at('2026-10-06', '00:29', CHICAGO);
    await t.finalize();
    expect((await t.ok('getGame', { token, params: { gameId: monday.id } })).status).toBe('live');

    t.at('2026-10-06', '00:30', CHICAGO);
    expect(await t.finalize()).toMatchObject({ datesSettled: 1, failures: 0 });
    const final = await t.ok('getGame', { token, params: { gameId: monday.id } });
    expect(final).toMatchObject({
      status: 'final',
      result: 'W',
      resultDetail: 'clean',
      runs: 4,
      tasksDone: 3,
      missedRequired: 0,
      rallyDeadline: null,
      finalizedAt: '2026-10-06T05:30:00.000Z',
    });

    const tasks = Object.fromEntries((await t.ok('listTasks', { token })).tasks.map((x) => [x.id, x]));
    expect(tasks[ids.Gym!]).toMatchObject({ currentStreak: 1, longestStreak: 1 });
    expect(tasks[ids.Stretch!]).toMatchObject({ currentStreak: 0, longestStreak: 0 });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({
      status: 'active',
      wins: 1,
      losses: 0,
      runDifferential: 0,
      currentWinStreak: 1,
      longestWinStreak: 1,
    });
    expect(await t.ok('getCurrentSeries', { token })).toMatchObject({ number: 1, wins: 1, losses: 0, result: null });

    // Tuesday's lineup was built at the start of Tuesday (by the 12:29 a.m. request).
    const [tuesday] = await env.db.select().from(games).where(eq(games.playedDate, '2026-10-06'));
    expect(tuesday?.lineupBuiltAt?.toISOString()).toBe('2026-10-06T05:29:00.000Z');
  });

  it('finalizes each user at their own midnight (Asia/Tokyo vs America/Chicago)', async () => {
    // Friday 2026-10-02, noon in Tokyo / 10 p.m. Thursday in Chicago.
    const t = new TestApp(env.db, '2026-10-02T03:00:00Z');
    const tokyo = await setupUser(t, 'tokyo@example.com', TOKYO);
    const chicago = await setupUser(t, 'chi@example.com', CHICAGO);

    // Tokyo plays Monday but misses one must-hit (Gym).
    const tokyoGame = await play(t, tokyo.token, '2026-10-05', TOKYO, ['Read', 'Walk']);
    t.at('2026-10-05', '09:00', CHICAGO);
    const chicagoGame = (await t.ok('getToday', { token: chicago.token })).games[0]!;

    // Tokyo midnight is 15:00Z; its game settles at 15:30Z.
    t.clock.set('2026-10-05T15:29:00Z');
    await t.finalize();
    expect((await t.ok('getGame', { token: tokyo.token, params: { gameId: tokyoGame.id } })).status).toBe('live');

    t.clock.set('2026-10-05T15:30:00Z');
    await t.finalize();
    expect(await t.ok('getGame', { token: tokyo.token, params: { gameId: tokyoGame.id } })).toMatchObject({
      status: 'final',
      result: 'L',
      resultDetail: 'forfeit',
      runs: 2,
      missedRequired: 1,
      // Noon the next day in Tokyo.
      rallyDeadline: '2026-10-06T03:00:00.000Z',
    });
    // It's 10:30 a.m. Monday in Chicago: that game is still on.
    expect((await t.ok('getGame', { token: chicago.token, params: { gameId: chicagoGame.id } })).status).toBe('scheduled');
    expect(await t.ok('getToday', { token: tokyo.token })).toMatchObject({ date: '2026-10-06' });
  });

  it('decides short, forfeit and no-appeal losses, and tracks task and win streaks', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, ids } = await setupUser(t, 'streaks@example.com', CHICAGO, 4);
    const week: [string, string[]][] = [
      ['2026-10-05', ['Gym', 'Read', 'Walk']], // 4 runs: W
      ['2026-10-06', ['Gym', 'Read']], // 3 < 4: L short
      ['2026-10-07', ['Gym', 'Walk']], // Read missed: L forfeit
      ['2026-10-08', ['Walk']], // two must-hits missed: L no appeal
      ['2026-10-09', ['Gym', 'Read', 'Walk']], // W
    ];
    const played: GameDto[] = [];
    for (const [date, names] of week) {
      played.push(await play(t, token, date, CHICAGO, names));
      await settle(t, date, CHICAGO);
    }
    const finals = await Promise.all(played.map((g) => t.ok('getGame', { token, params: { gameId: g.id } })));
    expect(finals.map((g) => [g.result, g.resultDetail, g.runs, g.missedRequired, g.rallyDeadline !== null])).toEqual([
      ['W', 'clean', 4, 0, false],
      ['L', 'short', 3, 0, true],
      ['L', 'forfeit', 3, 1, true],
      ['L', 'no_appeal', 1, 2, false],
      ['W', 'clean', 4, 0, false],
    ]);

    const tasks = Object.fromEntries((await t.ok('listTasks', { token })).tasks.map((x) => [x.id, x]));
    expect(tasks[ids.Gym!]).toMatchObject({ currentStreak: 1, longestStreak: 3 });
    expect(tasks[ids.Read!]).toMatchObject({ currentStreak: 1, longestStreak: 2 });
    expect(tasks[ids.Walk!]).toMatchObject({ currentStreak: 3, longestStreak: 3 });
    expect(tasks[ids.Stretch!]).toMatchObject({ currentStreak: 0, longestStreak: 0 });

    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({
      wins: 2,
      losses: 3,
      rallyWins: 0,
      runDifferential: -5,
      currentWinStreak: 1,
      longestWinStreak: 1,
    });
    expect(await t.ok('getCurrentSeries', { token })).toMatchObject({ wins: 2, losses: 3, result: null, ironMan: null });
  });

  it('clinches at four wins, then closes the series on Sunday with Iron Man and the series bonus', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await setupUser(t, 'ironman@example.com', CHICAGO);
    const all = ['Gym', 'Read', 'Walk'];
    const plan: [string, string[]][] = [
      ['2026-10-05', all],
      ['2026-10-06', all],
      ['2026-10-07', all],
      ['2026-10-08', all],
      ['2026-10-09', []],
      ['2026-10-10', all],
      ['2026-10-11', all],
    ];
    let seriesId = '';
    for (const [date, names] of plan) {
      seriesId = (await play(t, token, date, CHICAGO, names)).seriesId;
      await settle(t, date, CHICAGO);
      if (date === '2026-10-08') {
        // Thursday: 4–0, the series is decided but all 7 games are still played.
        expect(await t.ok('getSeries', { token, params: { seriesId } })).toMatchObject({
          wins: 4,
          losses: 0,
          result: 'won',
          ironMan: null,
        });
        expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ seriesWon: 1, seriesLost: 0 });
      }
    }

    // Monday 12:30 a.m.: Sunday settled, series closed 6–1.
    expect(await t.ok('getSeries', { token, params: { seriesId } })).toMatchObject({
      wins: 6,
      losses: 1,
      result: 'won',
      ironMan: true,
    });
    expect((await t.ok('getMe', { token })).allowances).toEqual({
      month: '2026-10',
      rallyTokens: 2, // monthly + series bonus
      rainouts: 3, // 2 monthly + Iron Man bonus
      ironManBonusHeld: true,
    });
    const [bonus] = await env.db.select().from(rainoutAllowances).where(eq(rainoutAllowances.source, 'iron_man'));
    expect(bonus).toMatchObject({ expiresOn: '2027-03-28', earnedMonth: '2026-10', seriesId });
    expect(await t.ok('getCurrentSeries', { token })).toMatchObject({ number: 2, startDate: '2026-10-12', wins: 0 });

    // Running the finalizer again (now or a bit later) changes nothing.
    const before = await snapshotDb(env.db);
    expect(await t.finalize()).toMatchObject({ datesSettled: 0 });
    t.clock.advanceMinutes(15);
    await t.finalize();
    expect(await snapshotDb(env.db)).toEqual(before);
  });

  it('catches up every missed date after downtime, in order', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await setupUser(t, 'downtime@example.com', CHICAGO);
    // Nobody opens the app and the job doesn't run until Thursday 1 a.m.
    t.at('2026-10-08', '01:00', CHICAGO);
    expect(await t.finalize()).toMatchObject({ datesSettled: 6, failures: 0 }); // Fri 10/2 … Wed 10/7
    // The finalizer itself prepared Thursday (its day had started).
    const [thursday] = await env.db.select().from(games).where(eq(games.playedDate, '2026-10-08'));
    expect(thursday?.lineupBuiltAt?.toISOString()).toBe('2026-10-08T06:00:00.000Z');

    const series = await t.ok('getCurrentSeries', { token });
    // Games nobody opened are built when decided: both must-hits missed, no appeal.
    expect(series?.games.map((g) => [g.status, g.result, g.resultDetail])).toEqual([
      ['final', 'L', 'no_appeal'],
      ['final', 'L', 'no_appeal'],
      ['final', 'L', 'no_appeal'],
      ['scheduled', null, null],
      ['scheduled', null, null],
      ['scheduled', null, null],
      ['scheduled', null, null],
    ]);
    expect(series).toMatchObject({ wins: 0, losses: 3 });

    const snapshot = await snapshotDb(env.db);
    await t.finalize();
    expect(await snapshotDb(env.db)).toEqual(snapshot);
  });

  it('grants monthly allowances on the first game day of each month and expires the old month', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, userId } = await setupUser(t, 'monthly@example.com', CHICAGO);
    // Spring Training: nothing is granted.
    expect((await t.ok('getMe', { token })).allowances).toEqual({
      month: '2026-10',
      rallyTokens: 0,
      rainouts: 0,
      ironManBonusHeld: false,
    });
    t.at('2026-10-05', '00:01', CHICAGO);
    expect((await t.ok('getMe', { token })).allowances).toMatchObject({ month: '2026-10', rallyTokens: 1, rainouts: 2 });

    // Sunday Nov 1 (also the day US daylight time ends). The finalizer settles Oct 31 at
    // 12:30 a.m. and grants November.
    t.at('2026-11-01', '00:30', CHICAGO);
    await t.finalize();
    const tokens = await env.db
      .select({ month: rallyTokens.month, source: rallyTokens.source })
      .from(rallyTokens)
      .where(eq(rallyTokens.userId, userId))
      .orderBy(asc(rallyTokens.month));
    expect(tokens).toEqual([
      { month: '2026-10', source: 'monthly' },
      { month: '2026-11', source: 'monthly' },
    ]);
    expect((await t.ok('getMe', { token })).allowances).toEqual({
      month: '2026-11',
      rallyTokens: 1,
      rainouts: 2,
      ironManBonusHeld: false,
    });

    // The 25-hour Sunday: its midnight is 06:00Z (CST), so it settles at 06:30Z.
    const [sunday] = await env.db
      .select()
      .from(games)
      .where(and(eq(games.userId, userId), eq(games.playedDate, '2026-11-01')));
    t.clock.set('2026-11-02T06:29:00Z');
    await t.finalize();
    expect((await t.ok('getGame', { token, params: { gameId: sunday!.id } })).status).not.toBe('final');
    t.clock.set('2026-11-02T06:30:00Z');
    await t.finalize();
    expect((await t.ok('getGame', { token, params: { gameId: sunday!.id } })).status).toBe('final');
  });
});

describe('seasons and Review Week', () => {
  it('sets the win goal only in Spring Training or Review Week, and rolls the season', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const first = await t.signIn('season@example.com', CHICAGO);
    let token = first.token;
    const userId = first.userId;
    const season1 = await t.ok('getCurrentSeason', { token });
    expect(season1).toMatchObject({ number: 1, status: 'upcoming', startDate: '2026-10-05', winGoal: null });
    expect((await t.ok('updateSeason', { token, params: { seasonId: season1!.id }, body: { winGoal: 120 } })).winGoal).toBe(120);
    expect((await t.fails('updateSeason', { token, params: { seasonId: season1!.id }, body: { winGoal: 176 } }, 400)).code).toBe(
      'VALIDATION_FAILED',
    );

    t.at('2026-10-05', '09:00', CHICAGO);
    expect(await t.fails('updateSeason', { token, params: { seasonId: season1!.id }, body: { winGoal: 100 } }, 409)).toMatchObject({
      code: 'OUT_OF_SEASON',
      reason: 'SEASON_IN_PROGRESS',
    });

    // Review Week: Monday 2027-03-29 (season 1 ended Sunday 2027-03-28). The session
    // expired long ago; signing back in settles the whole season on the way.
    t.at('2027-03-29', '12:00', CHICAGO);
    expect(await t.fails('getMe', { token }, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
    const started = performance.now();
    token = (await t.signIn('season@example.com', CHICAGO)).token;
    t.log.info(`settled season 1 in ${Math.round(performance.now() - started)} ms`);
    expect(await t.ok('getToday', { token })).toEqual({
      date: '2027-03-29',
      position: { phase: 'offseason', seasonNumber: 1, nextSeasonStart: '2027-04-05' },
      games: [],
      series: null,
    });
    expect(await t.ok('getCurrentSeries', { token })).toBeNull();
    const reviewed = await t.ok('getCurrentSeason', { token });
    expect(reviewed).toMatchObject({ number: 1, status: 'offseason', wins: 0, losses: 175, seriesLost: 25, winGoal: 120 });
    // Nothing is granted in Review Week (March's allowances were granted in March).
    expect((await t.ok('getMe', { token })).allowances.month).toBe('2027-03');

    const [season2] = await env.db
      .select()
      .from(seasons)
      .where(and(eq(seasons.userId, userId), eq(seasons.number, 2)));
    expect(season2).toMatchObject({ status: 'upcoming', startDate: '2027-04-05' });
    expect(await t.fails('updateSeason', { token, params: { seasonId: reviewed!.id }, body: { winGoal: 90 } }, 409)).toMatchObject({
      code: 'OUT_OF_SEASON',
      reason: 'SEASON_STARTED',
    });
    expect((await t.ok('updateSeason', { token, params: { seasonId: season2!.id }, body: { winGoal: 110 } })).winGoal).toBe(110);

    // Opening day of season 2: a fresh 0–0 record.
    t.at('2027-04-05', '08:00', CHICAGO);
    const today = await t.ok('getToday', { token });
    expect(today.position).toMatchObject({ phase: 'season', seasonNumber: 2, seriesNumber: 1, gameNumber: 1 });
    expect(today.games).toHaveLength(1);
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ number: 2, status: 'active', wins: 0, losses: 0, winGoal: 110 });
    expect(await t.ok('getSeason', { token, params: { seasonId: reviewed!.id } })).toMatchObject({ status: 'complete' });
    expect(await t.fails('updateSeason', { token, params: { seasonId: season2!.id }, body: { winGoal: 100 } }, 409)).toMatchObject({
      code: 'OUT_OF_SEASON',
    });
  });
});
