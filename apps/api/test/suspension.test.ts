import type { GameDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rainoutAllowances } from '../src/db/schema';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();
const ALL = ['Gym', 'Read', 'Walk'];

/** Chicago user, sign-up Friday 2026-10-02. Every starter: Gym (2) + Read must-hits, Walk; runs to win 4. */
async function setup(t: TestApp, email: string) {
  t.clock.set('2026-10-02T15:00:00Z');
  const { token } = await t.signIn(email, CHICAGO);
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
          { taskId: ids.Read!, position: 2, required: false },
          { taskId: ids.Walk!, position: 3, required: false },
        ],
        bench: [],
      },
    });
  }
  return { token, ids };
}

function entry(game: GameDto, name: string) {
  const found = game.entries.find((e) => e.taskName === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found;
}

async function complete(t: TestApp, token: string, game: GameDto, names: string[]) {
  for (const name of names) {
    await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: entry(game, name).id },
      body: { clientAt: t.clock.now().toISOString() },
    });
  }
}

/** Play `date` at 8 p.m. (game slot 1 only), then settle it at 12:30 a.m. */
async function playDay(t: TestApp, token: string, date: string, names: string[]): Promise<GameDto> {
  t.at(date, '20:00', CHICAGO);
  const game = (await t.ok('getToday', { token })).games.find((g) => g.slot === 1);
  if (!game) throw new Error(`no game on ${date}`);
  await complete(t, token, game, names);
  t.at(addDays(date, 1), '00:30', CHICAGO);
  await t.finalize();
  return game;
}

async function streakOf(t: TestApp, token: string, name: string) {
  return (await t.ok('listTasks', { token })).tasks.find((x) => x.name === name)!.currentStreak;
}

describe('suspended games', () => {
  it('suspends a game mid-day and resumes it as a doubleheader with its progress kept; no Iron Man', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await setup(t, 'suspend@example.com');
    t.at('2026-10-05', '10:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    await complete(t, token, monday!, ['Gym']);

    t.at('2026-10-05', '15:00', CHICAGO);
    expect(await t.ok('getSuspensionQuote', { token, params: { gameId: monday!.id } })).toEqual({
      ok: true,
      reason: null,
      resumeDates: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
      deadline: '2026-10-06T17:00:00.000Z',
      allowancesAvailable: 2,
    });
    expect(
      await t.fails('suspendGame', { token, params: { gameId: monday!.id }, body: { resumeDate: null } }, 409),
    ).toMatchObject({ code: 'INVALID_MAKEUP_DATE', reason: 'RESUME_DATE_REQUIRED' });
    expect(
      await t.fails('suspendGame', { token, params: { gameId: monday!.id }, body: { resumeDate: '2026-10-05' } }, 409),
    ).toMatchObject({ code: 'INVALID_MAKEUP_DATE' });

    const series = await t.ok('suspendGame', { token, params: { gameId: monday!.id }, body: { resumeDate: '2026-10-06' } });
    expect(series.games[0]).toMatchObject({
      gameNumber: 1,
      scheduledDate: '2026-10-05',
      playedDate: '2026-10-06',
      slot: 2,
      suspended: true,
      postponed: false,
      status: 'live',
      runs: 2,
      result: null,
    });
    expect((await t.ok('getMe', { token })).allowances.rainouts).toBe(1);
    expect((await t.ok('getToday', { token })).games).toEqual([]);

    // Monday settles with nothing to decide; Tuesday is a doubleheader.
    t.at('2026-10-06', '08:00', CHICAGO);
    const tuesday = (await t.ok('getToday', { token })).games;
    expect(tuesday.map((g) => [g.gameNumber, g.slot, g.status, g.runs])).toEqual([
      [2, 1, 'scheduled', 0],
      [1, 2, 'live', 2],
    ]);
    const resumed = tuesday[1]!;
    expect(entry(resumed, 'Gym').completedAt).toBe('2026-10-05T15:00:00.000Z');
    // A resumed game hosts no makeup and can't be rained out.
    expect((await t.ok('getRainoutQuote', { token, params: { gameId: resumed.id } })).reason).toBe('MAKEUP_GAME');
    await complete(t, token, resumed, ['Read', 'Walk']);
    await complete(t, token, tuesday[0]!, ALL);
    t.at('2026-10-07', '00:30', CHICAGO);
    await t.finalize();
    expect(await t.ok('getGame', { token, params: { gameId: resumed.id } })).toMatchObject({
      status: 'final',
      result: 'W',
      runs: 4,
      playedDate: '2026-10-06',
    });

    for (const date of ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) await playDay(t, token, date, ALL);
    expect(await t.ok('getSeries', { token, params: { seriesId: monday!.seriesId } })).toMatchObject({
      wins: 7,
      losses: 0,
      result: 'won',
      ironMan: false,
    });
  });

  it('suspends a final L the next morning and undoes it: aggregates, streaks, Rally Cap window', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await setup(t, 'morning@example.com');
    await playDay(t, token, '2026-10-05', ALL);
    await playDay(t, token, '2026-10-06', ALL);
    const wednesday = await playDay(t, token, '2026-10-07', ['Gym', 'Read']); // 3 < 4: L short

    t.at('2026-10-08', '09:00', CHICAGO);
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ wins: 2, losses: 1, runDifferential: 1 });
    expect(await streakOf(t, token, 'Walk')).toBe(0);
    expect((await t.ok('getGame', { token, params: { gameId: wednesday.id } })).rallyDeadline).toBe('2026-10-08T17:00:00.000Z');

    const quote = await t.ok('getSuspensionQuote', { token, params: { gameId: wednesday.id } });
    expect(quote).toMatchObject({ ok: true, resumeDates: ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'] });
    // Other games: a win and a game that hasn't started can't be suspended.
    const strip = (await t.ok('getCurrentSeries', { token }))!.games;
    expect((await t.ok('getSuspensionQuote', { token, params: { gameId: strip[1]!.id } })).reason).toBe('GAME_WON');
    expect((await t.ok('getSuspensionQuote', { token, params: { gameId: strip[5]!.id } })).reason).toBe('FUTURE_GAME');

    // Resumes this morning, as Thursday's second game.
    const series = await t.ok('suspendGame', { token, params: { gameId: wednesday.id }, body: { resumeDate: '2026-10-08' } });
    expect(series).toMatchObject({ wins: 2, losses: 0 });
    expect(series.games[2]).toMatchObject({ playedDate: '2026-10-08', slot: 2, suspended: true, status: 'live', result: null, runs: 3 });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ wins: 2, losses: 0, runDifferential: 2, currentWinStreak: 2 });
    expect(await streakOf(t, token, 'Walk')).toBe(2);
    expect(await t.ok('getGame', { token, params: { gameId: wednesday.id } })).toMatchObject({ rallyDeadline: null, finalizedAt: null });
    expect((await t.ok('getRallyQuote', { token, params: { gameId: wednesday.id } })).reason).toBe('GAME_NOT_FINAL');

    // It already moved once: suspending it again can only end it with no decision.
    expect(await t.ok('getSuspensionQuote', { token, params: { gameId: wednesday.id } })).toMatchObject({ ok: true, resumeDates: [] });

    // The allowance is shared with Rainouts: use the last one, then nothing is left.
    await t.ok('callRainout', { token, params: { gameId: strip[4]!.id }, body: { makeupDate: '2026-10-10' } });
    expect(await t.ok('getSuspensionQuote', { token, params: { gameId: wednesday.id } })).toMatchObject({
      ok: false,
      reason: 'NO_ALLOWANCE',
      allowancesAvailable: 0,
    });
    expect(
      await t.fails('suspendGame', { token, params: { gameId: wednesday.id }, body: { resumeDate: null } }, 409),
    ).toMatchObject({ code: 'NO_ALLOWANCE' });

    // Finishing it today makes it a W on its new date.
    const today = (await t.ok('getToday', { token })).games;
    await complete(t, token, today.find((g) => g.id === wednesday.id)!, ['Walk']);
    t.at('2026-10-09', '00:30', CHICAGO);
    await t.finalize();
    expect(await t.ok('getGame', { token, params: { gameId: wednesday.id } })).toMatchObject({ status: 'final', result: 'W' });
    // Thursday's own game (slot 1) went unplayed, then Game B was done: streak 1.
    expect(await streakOf(t, token, 'Walk')).toBe(1);
  });

  it('closes the window at noon the next day and after a Rally Cap roll', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await setup(t, 'window@example.com');
    const monday = await playDay(t, token, '2026-10-05', ['Gym']); // L short
    const tuesday = await playDay(t, token, '2026-10-06', ['Gym']); // L short

    t.at('2026-10-06', '12:00', CHICAGO);
    expect(await t.ok('getSuspensionQuote', { token, params: { gameId: monday.id } })).toMatchObject({ ok: false, reason: 'WINDOW_CLOSED', deadline: null });
    expect(
      await t.fails('suspendGame', { token, params: { gameId: monday.id }, body: { resumeDate: '2026-10-08' } }, 409),
    ).toMatchObject({ code: 'NOT_ELIGIBLE', reason: 'WINDOW_CLOSED' });

    t.at('2026-10-07', '09:00', CHICAGO);
    t.rolls.push(99);
    await t.ok('rollRally', { token, params: { gameId: tuesday.id }, headers: { 'idempotency-key': 'tuesday-roll-1' } });
    expect((await t.ok('getSuspensionQuote', { token, params: { gameId: tuesday.id } })).reason).toBe('RALLY_ROLLED');
  });

  it('ends a Sunday suspension with no decision; a tied series is split or decided by run differential', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');

    async function week(email: string, mondayThreshold: number) {
      const { token } = await setup(t, email);
      t.at('2026-10-05', '08:00', CHICAGO);
      const [monday] = (await t.ok('getToday', { token })).games;
      await t.ok('patchLineup', { token, params: { gameId: monday!.id }, body: { threshold: mondayThreshold } });
      for (const date of ['2026-10-05', '2026-10-06', '2026-10-07']) await playDay(t, token, date, ALL); // W W W
      for (const date of ['2026-10-08', '2026-10-09', '2026-10-10']) await playDay(t, token, date, ['Gym', 'Read']); // L L L

      t.at('2026-10-11', '10:00', CHICAGO);
      const [sunday] = (await t.ok('getToday', { token })).games;
      await complete(t, token, sunday!, ['Gym']);
      expect(await t.ok('getSuspensionQuote', { token, params: { gameId: sunday!.id } })).toMatchObject({ ok: true, resumeDates: [] });
      expect(
        await t.fails('suspendGame', { token, params: { gameId: sunday!.id }, body: { resumeDate: '2026-10-12' } }, 409),
      ).toMatchObject({ code: 'INVALID_MAKEUP_DATE' });
      const series = await t.ok('suspendGame', { token, params: { gameId: sunday!.id }, body: { resumeDate: null } });
      expect(series.games[6]).toMatchObject({ status: 'final', result: null, resultDetail: 'suspended', runs: 2, suspended: false });
      expect(await t.ok('getGame', { token, params: { gameId: sunday!.id } })).toMatchObject({ editPolicy: 'closed', rallyDeadline: null });
      expect(await t.ok('getSuspensionQuote', { token, params: { gameId: sunday!.id } })).toMatchObject({ ok: false, reason: 'NO_DECISION' });

      t.at('2026-10-12', '00:30', CHICAGO);
      await t.finalize();
      t.at('2026-10-12', '08:00', CHICAGO);
      return { token, seriesId: sunday!.seriesId };
    }

    // Runs to win 4 every day: +1 for each W, −1 for each L → split.
    const even = await week('split@example.com', 4);
    expect(await t.ok('getSeries', { token: even.token, params: { seriesId: even.seriesId } })).toMatchObject({
      wins: 3,
      losses: 3,
      result: null,
      ironMan: false,
    });
    expect(await t.ok('getCurrentSeason', { token: even.token })).toMatchObject({
      wins: 3,
      losses: 3,
      noDecisions: 1,
      seriesWon: 0,
      seriesLost: 0,
      runDifferential: 0,
      currentWinStreak: 0,
    });

    // Monday's runs to win lowered to 2: 4–1 is +3, so the tied series is won on run differential.
    const won = await week('tiebreak@example.com', 2);
    expect(await t.ok('getSeries', { token: won.token, params: { seriesId: won.seriesId } })).toMatchObject({
      wins: 3,
      losses: 3,
      result: 'won',
      ironMan: false,
    });
    expect(await t.ok('getCurrentSeason', { token: won.token })).toMatchObject({ seriesWon: 1, noDecisions: 1, runDifferential: 2 });
    // Won without a Rally Cap: the series bonus token.
    expect((await t.ok('getMe', { token: won.token })).allowances).toMatchObject({ rallyTokens: 2, rainouts: 1 });
  });

  it('a no-decision the next morning re-closes the series and takes back an unused Iron Man bonus', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await setup(t, 'ironman@example.com');
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) await playDay(t, token, date, ALL);
    await playDay(t, token, '2026-10-10', ['Gym', 'Read']);
    const sunday = await playDay(t, token, '2026-10-11', ['Gym', 'Read']); // 5–2: Iron Man
    t.at('2026-10-12', '09:00', CHICAGO);
    expect(await t.ok('getSeries', { token, params: { seriesId: sunday.seriesId } })).toMatchObject({ wins: 5, losses: 2, ironMan: true });
    expect((await t.ok('getMe', { token })).allowances).toMatchObject({ rainouts: 3, ironManBonusHeld: true });

    const series = await t.ok('suspendGame', { token, params: { gameId: sunday.id }, body: { resumeDate: null } });
    expect(series).toMatchObject({ wins: 5, losses: 1, result: 'won', ironMan: false });
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ wins: 5, losses: 1, noDecisions: 1, seriesWon: 1 });
    // One monthly Rainout paid for the suspension; the bonus was taken back.
    expect((await t.ok('getMe', { token })).allowances).toMatchObject({ rainouts: 1, ironManBonusHeld: false });
    expect(await env.db.select().from(rainoutAllowances).where(eq(rainoutAllowances.source, 'iron_man'))).toEqual([]);
  });
});
