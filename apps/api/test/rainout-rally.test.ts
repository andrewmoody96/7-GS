import type { GameDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rainoutAllowances } from '../src/db/schema';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();
const ALL = ['Gym', 'Read', 'Walk'];

/** Chicago user, sign-up Friday 2026-10-02. Every starter: Gym (2) + Read must-hits, Walk; threshold 4. */
async function setup() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token, userId } = await t.signIn('weather@example.com', CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }, { name: 'Walk' }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        threshold: 4,
        minTasks: null,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: true },
          { taskId: ids.Walk!, position: 3, required: false },
        ],
        bench: [],
      },
    });
  }
  return { t, token, userId };
}

async function complete(t: TestApp, token: string, game: GameDto, names: string[]) {
  for (const name of names) {
    const e = game.entries.find((x) => x.taskName === name);
    if (!e) throw new Error(`no entry ${name}`);
    await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: e.id },
      body: { clientAt: t.clock.now().toISOString() },
    });
  }
}

/** Play `date` at 8 p.m. (every game that day, same tasks), then settle it at 12:30 a.m. */
async function playDay(t: TestApp, token: string, date: string, names: string[]): Promise<GameDto[]> {
  t.at(date, '20:00', CHICAGO);
  const { games } = await t.ok('getToday', { token });
  for (const game of games) await complete(t, token, game, names);
  t.at(addDays(date, 1), '00:30', CHICAGO);
  await t.finalize();
  return games;
}

describe('rainouts', () => {
  it('moves a game before first pitch to a doubleheader later in the series', async () => {
    const { t, token } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    expect(await t.ok('getRainoutQuote', { token, params: { gameId: monday!.id } })).toEqual({
      ok: true,
      reason: null,
      makeupDates: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
      allowancesAvailable: 2,
    });

    const series = await t.ok('callRainout', { token, params: { gameId: monday!.id }, body: { makeupDate: '2026-10-07' } });
    expect(series.games[0]).toMatchObject({
      gameNumber: 1,
      scheduledDate: '2026-10-05',
      playedDate: '2026-10-07',
      slot: 2,
      postponed: true,
      status: 'scheduled',
      starterName: 'Day 1',
      runs: 0,
    });
    expect(await t.ok('getToday', { token })).toMatchObject({ date: '2026-10-05', games: [], series: { number: 1 } });
    expect((await t.ok('getMe', { token })).allowances.rainouts).toBe(1);

    // Wednesday is a doubleheader: Game A is Wednesday's starter, Game B the postponed one.
    t.at('2026-10-07', '08:00', CHICAGO);
    const wednesday = (await t.ok('getToday', { token })).games;
    expect(wednesday.map((g) => [g.gameNumber, g.slot, g.starterName, g.entries.length])).toEqual([
      [3, 1, 'Day 3', 3],
      [1, 2, 'Day 1', 3],
    ]);

    // A day that already hosts a makeup can't take another; the series has 2 rainouts at most here.
    const thursday = (await t.ok('getCurrentSeries', { token }))!.games[3]!;
    const quote = await t.ok('getRainoutQuote', { token, params: { gameId: thursday.id } });
    expect(quote).toEqual({ ok: true, reason: null, makeupDates: ['2026-10-09', '2026-10-10', '2026-10-11'], allowancesAvailable: 1 });
    expect(
      await t.fails('callRainout', { token, params: { gameId: thursday.id }, body: { makeupDate: '2026-10-07' } }, 409),
    ).toMatchObject({ code: 'INVALID_MAKEUP_DATE' });
    await t.ok('callRainout', { token, params: { gameId: thursday.id }, body: { makeupDate: '2026-10-09' } });
    const friday = (await t.ok('getCurrentSeries', { token }))!.games[4]!;
    expect(await t.ok('getRainoutQuote', { token, params: { gameId: friday.id } })).toEqual({
      ok: false,
      reason: 'NO_ALLOWANCE',
      makeupDates: [],
      allowancesAvailable: 0,
    });
    expect(
      await t.fails('callRainout', { token, params: { gameId: friday.id }, body: { makeupDate: '2026-10-10' } }, 409),
    ).toMatchObject({ code: 'NO_ALLOWANCE' });
  });

  it('decides doubleheader games separately and never awards Iron Man to a series with a rainout', async () => {
    const { t, token } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    await t.ok('callRainout', { token, params: { gameId: monday!.id }, body: { makeupDate: '2026-10-06' } });
    t.at('2026-10-06', '00:30', CHICAGO);
    await t.finalize(); // Monday had no game: nothing to decide

    for (const date of ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
      await playDay(t, token, date, ALL);
    }
    const series = (await t.ok('getSeries', { token, params: { seriesId: monday!.seriesId } }))!;
    expect(series).toMatchObject({ wins: 7, losses: 0, result: 'won', ironMan: false });
    expect(series.games.map((g) => [g.gameNumber, g.playedDate, g.slot, g.result])).toEqual([
      [1, '2026-10-06', 2, 'W'],
      [2, '2026-10-06', 1, 'W'],
      [3, '2026-10-07', 1, 'W'],
      [4, '2026-10-08', 1, 'W'],
      [5, '2026-10-09', 1, 'W'],
      [6, '2026-10-10', 1, 'W'],
      [7, '2026-10-11', 1, 'W'],
    ]);
    const me = await t.ok('getMe', { token });
    expect(me.allowances).toMatchObject({ rainouts: 1, ironManBonusHeld: false, rallyTokens: 2 });
  });

  it('rejects rainouts the rules reject', async () => {
    const { t, token } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const { games, series } = await t.ok('getToday', { token });
    const sunday = series!.games[6]!;
    expect(await t.ok('getRainoutQuote', { token, params: { gameId: sunday.id } })).toMatchObject({ ok: false, reason: 'SUNDAY' });
    expect(
      await t.fails('callRainout', { token, params: { gameId: sunday.id }, body: { makeupDate: '2026-10-11' } }, 409),
    ).toMatchObject({ code: 'NOT_ELIGIBLE', reason: 'SUNDAY' });

    await t.ok('lockGame', { token, params: { gameId: games[0]!.id } });
    expect(
      await t.fails('callRainout', { token, params: { gameId: games[0]!.id }, body: { makeupDate: '2026-10-06' } }, 409),
    ).toMatchObject({ code: 'GAME_LOCKED' });

    const tuesday = series!.games[1]!;
    await t.ok('callRainout', { token, params: { gameId: tuesday.id }, body: { makeupDate: '2026-10-08' } });
    expect(
      await t.fails('callRainout', { token, params: { gameId: tuesday.id }, body: { makeupDate: '2026-10-09' } }, 409),
    ).toMatchObject({ code: 'NOT_ELIGIBLE', reason: 'MAKEUP_GAME' });
  });
});

describe('Rally Cap', () => {
  it('quotes the odds, rolls once, and a hit turns the loss into a rally W', async () => {
    const { t, token } = await setup();
    await playDay(t, token, '2026-10-05', ALL); // W
    await playDay(t, token, '2026-10-06', ALL); // W
    const [wednesday] = await playDay(t, token, '2026-10-07', ['Gym', 'Read']); // 3 < 4: L short

    t.at('2026-10-08', '08:00', CHICAGO);
    const quote = await t.ok('getRallyQuote', { token, params: { gameId: wednesday!.id } });
    expect(quote).toMatchObject({
      eligible: true,
      reason: null,
      deadline: '2026-10-08T17:00:00.000Z', // noon Thursday in Chicago
      tokensAvailable: 1,
      seasonWinStreak: 2,
      odds: { base: 24, closeness: 0, missedMustHit: 0, warningTrack: 0, runCushion: 0, pct: 24, limit: null },
    });

    expect(await t.fails('rollRally', { token, params: { gameId: wednesday!.id } }, 400)).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    t.rolls.push(24);
    const result = await t.ok('rollRally', {
      token,
      params: { gameId: wednesday!.id },
      headers: { 'idempotency-key': 'roll-0001-wednesday' },
    });
    expect(result.roll).toMatchObject({ gameId: wednesday!.id, oddsPct: 24, roll: 24, hit: true });
    expect(result.roll.breakdown.pct).toBe(24);
    expect(result.game).toMatchObject({ status: 'final', result: 'W', resultDetail: 'rally', rally: { roll: 24, hit: true } });

    // Retries (same or new key) return the stored roll without rolling again.
    for (const key of ['roll-0001-wednesday', 'roll-0002-retry']) {
      const again = await t.ok('rollRally', { token, params: { gameId: wednesday!.id }, headers: { 'idempotency-key': key } });
      expect(again.roll).toEqual(result.roll);
    }
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ wins: 3, losses: 0, rallyWins: 1, currentWinStreak: 3 });
    expect(await t.ok('getCurrentSeries', { token })).toMatchObject({ wins: 3, losses: 0 });
    expect((await t.ok('getMe', { token })).allowances.rallyTokens).toBe(0);
    expect(await t.ok('getRallyQuote', { token, params: { gameId: wednesday!.id } })).toMatchObject({
      eligible: false,
      reason: 'ALREADY_ROLLED',
      odds: null,
    });
  });

  it('a miss keeps the L; one Rally Cap per series; the window closes at noon', async () => {
    const { t, token } = await setup();
    const [monday] = await playDay(t, token, '2026-10-05', ['Gym', 'Read']); // L short
    t.at('2026-10-06', '09:00', CHICAGO);
    t.rolls.push(99);
    const miss = await t.ok('rollRally', { token, params: { gameId: monday!.id }, headers: { 'idempotency-key': 'monday-roll-1' } });
    expect(miss.roll).toMatchObject({ roll: 99, hit: false, oddsPct: 20 });
    expect(miss.game).toMatchObject({ result: 'L', resultDetail: 'short' });

    const [tuesday] = await playDay(t, token, '2026-10-06', ['Gym', 'Walk']); // L forfeit
    t.at('2026-10-07', '11:59', CHICAGO);
    expect(await t.ok('getRallyQuote', { token, params: { gameId: tuesday!.id } })).toMatchObject({
      eligible: false,
      reason: 'SERIES_LIMIT',
    });
    expect(
      await t.fails('rollRally', { token, params: { gameId: tuesday!.id }, headers: { 'idempotency-key': 'tuesday-roll' } }, 409),
    ).toMatchObject({ code: 'NOT_ELIGIBLE', reason: 'SERIES_LIMIT' });
    // Reusing a key from another game is an error, not a replay.
    expect(
      await t.fails('rollRally', { token, params: { gameId: tuesday!.id }, headers: { 'idempotency-key': 'monday-roll-1' } }, 409),
    ).toMatchObject({ code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' });
    t.at('2026-10-07', '12:00', CHICAGO);
    expect((await t.ok('getRallyQuote', { token, params: { gameId: tuesday!.id } })).reason).toBe('WINDOW_CLOSED');

    const [wednesday] = await playDay(t, token, '2026-10-07', ['Walk']); // two must-hits missed
    expect((await t.ok('getRallyQuote', { token, params: { gameId: wednesday!.id } })).reason).toBe('TOO_MANY_MISSED');
    const [thursday] = (await t.ok('getToday', { token })).games;
    expect((await t.ok('getRallyQuote', { token, params: { gameId: thursday!.id } })).reason).toBe('GAME_NOT_FINAL');
  });

  it('a hit after the series closed refreshes the series and can earn Iron Man', async () => {
    const { t, token } = await setup();
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) await playDay(t, token, date, ALL);
    await playDay(t, token, '2026-10-09', []);
    await playDay(t, token, '2026-10-10', []);
    const [sunday] = await playDay(t, token, '2026-10-11', ['Gym', 'Read']); // L short → 4–3

    const series = await t.ok('getSeries', { token, params: { seriesId: sunday!.seriesId } });
    expect(series).toMatchObject({ wins: 4, losses: 3, result: 'won', ironMan: false });
    // Won without a Rally Cap: monthly token + series bonus.
    expect((await t.ok('getMe', { token })).allowances).toMatchObject({ rallyTokens: 2, rainouts: 2, ironManBonusHeld: false });

    t.at('2026-10-12', '09:00', CHICAGO);
    t.rolls.push(1);
    await t.ok('rollRally', { token, params: { gameId: sunday!.id }, headers: { 'idempotency-key': 'sunday-walkoff' } });
    expect(await t.ok('getSeries', { token, params: { seriesId: sunday!.seriesId } })).toMatchObject({
      wins: 5,
      losses: 2,
      ironMan: true,
    });
    expect((await t.ok('getMe', { token })).allowances).toMatchObject({ rallyTokens: 1, rainouts: 3, ironManBonusHeld: true });
    const ironMan = await env.db.select().from(rainoutAllowances).where(eq(rainoutAllowances.source, 'iron_man'));
    expect(ironMan).toHaveLength(1);
  });
});
