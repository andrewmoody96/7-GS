import type { GameDto } from '@7gs/contracts';
import { describe, expect, it } from 'vitest';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

// Chicago user, sign-up Friday 2026-10-02 (Spring Training); Opening Day Monday 2026-10-05.
// Every starter: Gym (2, must-hit), Read; Walk on the bench; runs to win 3.
async function setup() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn('weeks@example.com', CHICAGO);
  const ids = await createTasks(t, token, [
    { name: 'Gym', points: 2 },
    { name: 'Read' },
    { name: 'Walk' },
    { name: 'Dishes', points: 3 },
  ]);
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
        bench: [{ taskId: ids.Walk!, position: 1 }],
      },
    });
  }
  return { t, token, ids };
}

function entry(game: GameDto, name: string) {
  const found = game.entries.find((e) => e.taskName === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found;
}

describe('weekly lineup card', () => {
  it('opens Opening Week during Spring Training and builds every lineup so it can be edited', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-03', '10:00', CHICAGO); // Saturday of Spring Training
    expect(await t.ok('listWeeks', { token })).toEqual({ weeks: [{ startDate: '2026-10-05', label: 'next', locked: false }] });

    const week = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    expect(week).toMatchObject({ startDate: '2026-10-05', endDate: '2026-10-11', lockedAt: null, locked: false });
    expect(week.series).toMatchObject({ number: 1, startDate: '2026-10-05' });
    expect(week.games.map((g) => [g.gameNumber, g.playedDate, g.starterName, g.editPolicy, g.entries.length])).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => [n, `2026-10-${String(4 + n).padStart(2, '0')}`, `Day ${n}`, 'free', 3]),
    );

    // Free edits on any day before the week's first pitch.
    const wednesday = week.games[2]!;
    const edited = await t.ok('patchLineup', {
      token,
      params: { gameId: wednesday.id },
      body: {
        threshold: 5,
        entries: [
          { taskId: ids.Dishes!, position: 1, required: true, role: 'lineup' },
          { taskId: ids.Read!, position: 2, required: false, role: 'lineup' },
        ],
      },
    });
    expect(edited).toMatchObject({ threshold: 5, editPolicy: 'free' });
    expect(edited.entries.map((e) => e.taskName)).toEqual(['Dishes', 'Read']);

    // Starter edits only reach lineups that aren't built yet.
    await t.ok('putStarter', {
      token,
      params: { weekday: 3 },
      body: { name: 'Changed', threshold: 9, minTasks: null, lockTime: null, lineup: [], bench: [] },
    });
    expect(await t.ok('getGame', { token, params: { gameId: wednesday.id } })).toMatchObject({ starterName: 'Day 3', threshold: 5 });

    // Opening the card again keeps the plan.
    const again = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    expect(again.games[2]!.entries.map((e) => e.taskName)).toEqual(['Dishes', 'Read']);

    // Game day uses the planned lineup.
    t.at('2026-10-07', '08:00', CHICAGO);
    const [today] = (await t.ok('getToday', { token })).games;
    expect(today).toMatchObject({ id: wednesday.id, threshold: 5 });
  });

  it("locks at the week's first pitch: then lineups only grow (GAME_LOCKED / WEEK_LOCKED)", async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const week = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    const [monday, , wednesday] = week.games;
    await t.ok('patchLineup', { token, params: { gameId: wednesday!.id }, body: { threshold: 4 } });

    t.at('2026-10-05', '09:15', CHICAGO);
    await t.ok('completeEntry', {
      token,
      params: { gameId: monday!.id, entryId: entry(monday!, 'Read').id },
      body: { clientAt: t.clock.now().toISOString() },
    });

    const locked = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    expect(locked).toMatchObject({ locked: true, lockedAt: '2026-10-05T14:15:00.000Z' });
    expect(locked.games.map((g) => g.editPolicy)).toEqual(Array(7).fill('additions_only'));
    expect((await t.ok('listWeeks', { token })).weeks).toEqual([{ startDate: '2026-10-05', label: 'current', locked: true }]);

    for (const gameId of [monday!.id, wednesday!.id]) {
      const rejected = await t.fails('patchLineup', { token, params: { gameId }, body: { threshold: 1 } }, 409);
      expect(rejected).toMatchObject({ code: 'GAME_LOCKED', reason: 'WEEK_LOCKED' });
    }
    // Bench adds and pinch hitters still work on later days.
    await t.ok('addToBench', { token, params: { gameId: wednesday!.id }, body: { taskId: ids.Dishes! } });
    const grown = await t.ok('addPinchHitter', { token, params: { gameId: wednesday!.id }, body: { taskId: ids.Dishes! } });
    expect(grown).toMatchObject({ threshold: 7, editPolicy: 'additions_only' });

    // Past days are closed.
    t.at('2026-10-06', '10:00', CHICAGO);
    const tuesdayWeek = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    expect(tuesdayWeek.games[0]).toMatchObject({ status: 'final', editPolicy: 'closed' });
  });

  it('opens next week from Friday and rejects weeks that are not plannable', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-08', '12:00', CHICAGO); // Thursday
    expect((await t.ok('listWeeks', { token })).weeks.map((w) => w.startDate)).toEqual(['2026-10-05']);
    expect(await t.fails('getWeek', { token, params: { startDate: '2026-10-12' } }, 409)).toMatchObject({
      code: 'NOT_ELIGIBLE',
      reason: 'WEEK_NOT_PLANNABLE',
    });
    expect((await t.fails('getWeek', { token, params: { startDate: '2026-10-13' } }, 404)).code).toBe('NOT_FOUND');
    expect((await t.fails('getWeek', { token, params: { startDate: 'soon' } }, 404)).code).toBe('NOT_FOUND');
    expect((await t.fails('getWeek', { token, params: { startDate: '2026-09-28' } }, 404)).code).toBe('NOT_FOUND');

    t.at('2026-10-09', '18:00', CHICAGO); // Friday
    // Nobody checked anything off and there are no lock times, so neither week has locked.
    expect((await t.ok('listWeeks', { token })).weeks).toEqual([
      { startDate: '2026-10-05', label: 'current', locked: false },
      { startDate: '2026-10-12', label: 'next', locked: false },
    ]);
    const next = await t.ok('getWeek', { token, params: { startDate: '2026-10-12' } });
    expect(next).toMatchObject({ locked: false, series: { number: 2 } });
    expect(next.games.every((g) => g.editPolicy === 'free' && g.entries.length === 3 && g.status === 'scheduled')).toBe(true);
    await t.ok('patchLineup', { token, params: { gameId: next.games[0]!.id }, body: { threshold: 2 } });
    // Pinch hitters work before the week locks too, with the same math.
    const pinch = await t.ok('addPinchHitter', { token, params: { gameId: next.games[1]!.id }, body: { taskId: ids.Dishes! } });
    expect(pinch).toMatchObject({ threshold: 6, editPolicy: 'free' });
    expect(entry(pinch, 'Dishes')).toMatchObject({ required: true, pinchHitAt: '2026-10-09T23:00:00.000Z' });
  });
});

describe('pinch hitters', () => {
  it('adds a new must-hit, promotes bench and non-required entries, and raises runs to win by their runs', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    await t.ok('lockGame', { token, params: { gameId: monday!.id } });

    t.at('2026-10-05', '12:00', CHICAGO);
    const added = await t.ok('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: ids.Dishes! } });
    expect(added.threshold).toBe(6); // 3 + Dishes' 3 runs
    expect(entry(added, 'Dishes')).toMatchObject({
      role: 'lineup',
      required: true,
      position: 3,
      points: 3,
      pinchHitAt: '2026-10-05T17:00:00.000Z',
      carriedOver: false,
    });

    const promoted = await t.ok('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: ids.Walk! } });
    expect(promoted.threshold).toBe(7);
    expect(entry(promoted, 'Walk')).toMatchObject({ role: 'lineup', required: true, position: 4 });
    expect(promoted.entries.filter((e) => e.role === 'bench')).toEqual([]);

    const required = await t.ok('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: ids.Read! } });
    expect(required.threshold).toBe(8);
    expect(entry(required, 'Read')).toMatchObject({ role: 'lineup', required: true, position: 2 });
    expect(required).toMatchObject({ missedRequired: 4, runs: 0 });

    expect(
      await t.fails('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: ids.Gym! } }, 409),
    ).toMatchObject({ code: 'CONFLICT', reason: 'ALREADY_REQUIRED' });

    const fresh = (await createTasks(t, token, [{ name: 'Stretch' }])).Stretch!;
    await t.ok('placeOnInjuredList', { token, params: { taskId: fresh } });
    expect(
      await t.fails('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: fresh } }, 409),
    ).toMatchObject({ reason: 'TASK_NOT_ACTIVE' });
    expect(
      (await t.fails('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: '0192f3a4-5b6c-7d8e-9f01-23456789abcd' } }, 404))
        .code,
    ).toBe('NOT_FOUND');

    // Completing every must-hit at the raised bar wins.
    for (const name of ['Gym', 'Read', 'Dishes', 'Walk']) {
      const current = await t.ok('getGame', { token, params: { gameId: monday!.id } });
      await t.ok('completeEntry', {
        token,
        params: { gameId: monday!.id, entryId: entry(current, name).id },
        body: { clientAt: t.clock.now().toISOString() },
      });
    }
    t.at('2026-10-06', '00:30', CHICAGO);
    await t.finalize();
    const final = await t.ok('getGame', { token, params: { gameId: monday!.id } });
    // Read was already in the lineup, so making it a must-hit raised the bar without adding
    // runs: 2 + 1 + 3 + 1 = 7 against 8.
    expect(final).toMatchObject({ status: 'final', result: 'L', resultDetail: 'short', runs: 7, threshold: 8, editPolicy: 'closed' });
  });
});
