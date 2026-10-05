import type { GameDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';
import { describe, expect, it } from 'vitest';
import { CHICAGO, snapshotDb, TestApp, useTestDb } from './helpers';

const env = useTestDb();

// Chicago user, sign-up Friday 2026-10-02; Game 1 is Monday 2026-10-05.
// Every starter: Gym (2, must-hit) and Read; runs to win 2. Haircut and Errand are one-offs.
async function setup() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token } = await t.signIn('oneoffs@example.com', CHICAGO);
  const ids: Record<string, string> = {};
  for (const task of [
    { name: 'Gym', points: 2 },
    { name: 'Read' },
    { name: 'Haircut', kind: 'one_off' as const },
    { name: 'Errand', points: 2, kind: 'one_off' as const },
  ]) {
    const created = await t.ok('createTask', { token, body: task });
    expect(created).toMatchObject({ kind: task.kind ?? 'recurring', carryover: false });
    ids[task.name] = created.id;
  }
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        threshold: 2,
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
  return { t, token, ids };
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

/** Play `date` at 8 p.m. (first game that day), then settle it at 12:30 a.m. */
async function playDay(t: TestApp, token: string, date: string, names: string[]): Promise<GameDto> {
  t.at(date, '20:00', CHICAGO);
  const [game] = (await t.ok('getToday', { token })).games;
  if (!game) throw new Error(`no game on ${date}`);
  await complete(t, token, game, names);
  t.at(addDays(date, 1), '00:30', CHICAGO);
  await t.finalize();
  return game;
}

async function task(t: TestApp, token: string, id: string) {
  const found = (await t.ok('listTasks', { token })).tasks.find((x) => x.id === id);
  if (!found) throw new Error('no task');
  return found;
}

describe('one-off tasks', () => {
  it('retires a completed one-off and carries a missed one-off must-hit to the next day until done', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    await t.ok('patchLineup', {
      token,
      params: { gameId: monday!.id },
      body: {
        threshold: 3,
        entries: [
          { taskId: ids.Gym!, position: 1, required: true, role: 'lineup' },
          { taskId: ids.Read!, position: 2, required: false, role: 'lineup' },
          { taskId: ids.Haircut!, position: 3, required: true, role: 'lineup' },
          { taskId: ids.Errand!, position: 4, required: false, role: 'lineup' },
        ],
      },
    });

    await playDay(t, token, '2026-10-05', ['Gym', 'Read', 'Errand']); // Haircut missed: L (forfeit)
    expect(await t.ok('getGame', { token, params: { gameId: monday!.id } })).toMatchObject({ result: 'L', resultDetail: 'forfeit' });
    expect(await task(t, token, ids.Errand!)).toMatchObject({ status: 'retired', carryover: false });
    expect(await task(t, token, ids.Haircut!)).toMatchObject({ status: 'active', carryover: false });

    // Tuesday's lineup was built after Monday settled and picked up the carryover.
    const before = await snapshotDb(env.db);
    await t.finalize();
    expect(await snapshotDb(env.db)).toEqual(before);

    t.at('2026-10-06', '08:00', CHICAGO);
    const [tuesday] = (await t.ok('getToday', { token })).games;
    expect(tuesday!.threshold).toBe(3); // 2 + Haircut's 1
    expect(entry(tuesday!, 'Haircut')).toMatchObject({
      role: 'lineup',
      required: true,
      position: 3,
      carriedOver: true,
      pinchHitAt: '2026-10-06T05:30:00.000Z',
    });
    expect(tuesday!.entries.filter((e) => e.taskName === 'Haircut')).toHaveLength(1);

    // Missed again: it moves again.
    await playDay(t, token, '2026-10-06', ['Gym', 'Read']);
    t.at('2026-10-07', '08:00', CHICAGO);
    const [wednesday] = (await t.ok('getToday', { token })).games;
    expect(wednesday).toMatchObject({ threshold: 3 });
    expect(entry(wednesday!, 'Haircut')).toMatchObject({ required: true, carriedOver: true });

    // Done: it retires and doesn't come back.
    await playDay(t, token, '2026-10-07', ['Gym', 'Read', 'Haircut']);
    expect(await task(t, token, ids.Haircut!)).toMatchObject({ status: 'retired', carryover: false });
    t.at('2026-10-08', '08:00', CHICAGO);
    const [thursday] = (await t.ok('getToday', { token })).games;
    expect(thursday!.entries.map((e) => e.taskName)).toEqual(['Gym', 'Read']);
    expect(thursday!.threshold).toBe(2);
  });

  it("doesn't carry a one-off that wasn't a must-hit", async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    await t.ok('addToBench', { token, params: { gameId: monday!.id }, body: { taskId: ids.Haircut! } });
    await t.ok('patchLineup', {
      token,
      params: { gameId: monday!.id },
      body: {
        entries: [
          { taskId: ids.Gym!, position: 1, required: true, role: 'lineup' },
          { taskId: ids.Errand!, position: 2, required: false, role: 'lineup' },
        ],
      },
    });
    await playDay(t, token, '2026-10-05', ['Gym']);
    expect(await task(t, token, ids.Errand!)).toMatchObject({ status: 'active', carryover: false });
    expect(await task(t, token, ids.Haircut!)).toMatchObject({ status: 'active', carryover: false });
    t.at('2026-10-06', '08:00', CHICAGO);
    expect((await t.ok('getToday', { token })).games[0]!.entries.map((e) => e.taskName)).toEqual(['Gym', 'Read']);
  });

  it('carries into the next built game, promoting an entry that is already there', async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '08:00', CHICAGO);
    const week = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    const [monday, tuesday, wednesday] = week.games;
    await t.ok('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: ids.Errand! } });
    // Errand is already planned (not as a must-hit) on Wednesday.
    await t.ok('patchLineup', {
      token,
      params: { gameId: wednesday!.id },
      body: {
        entries: [
          { taskId: ids.Gym!, position: 1, required: true, role: 'lineup' },
          { taskId: ids.Errand!, position: 2, required: false, role: 'lineup' },
          { taskId: ids.Read!, position: 3, required: false, role: 'lineup' },
        ],
      },
    });
    // Tuesday is rained out to Thursday, so Wednesday is the next game played.
    await t.ok('callRainout', { token, params: { gameId: tuesday!.id }, body: { makeupDate: '2026-10-08' } });

    await playDay(t, token, '2026-10-05', ['Gym', 'Read']);
    const after = await t.ok('getWeek', { token, params: { startDate: '2026-10-05' } });
    const moved = after.games.find((g) => g.id === tuesday!.id)!;
    expect(moved).toMatchObject({ playedDate: '2026-10-08', slot: 2, threshold: 2 });
    expect(moved.entries.map((e) => e.taskName)).toEqual(['Gym', 'Read']);
    const wed = after.games.find((g) => g.id === wednesday!.id)!;
    expect(wed.threshold).toBe(4); // 2 + Errand's 2
    expect(wed.entries.filter((e) => e.taskName === 'Errand')).toEqual([
      expect.objectContaining({ role: 'lineup', required: true, position: 2, carriedOver: true }),
    ]);
  });

  it("carries a Sunday miss to Monday on next week's card", async () => {
    const { t, token, ids } = await setup();
    for (const date of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) await playDay(t, token, date, ['Gym']);
    t.at('2026-10-09', '18:00', CHICAGO); // Friday: next week's card opens and builds
    const next = await t.ok('getWeek', { token, params: { startDate: '2026-10-12' } });
    await playDay(t, token, '2026-10-09', ['Gym']);
    await playDay(t, token, '2026-10-10', ['Gym']);

    t.at('2026-10-11', '09:00', CHICAGO);
    const [sunday] = (await t.ok('getToday', { token })).games;
    await t.ok('addPinchHitter', { token, params: { gameId: sunday!.id }, body: { taskId: ids.Haircut! } });
    await playDay(t, token, '2026-10-11', ['Gym', 'Read']);

    t.at('2026-10-12', '08:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    expect(monday!.id).toBe(next.games[0]!.id);
    expect(monday).toMatchObject({ threshold: 3, seriesId: next.series.id });
    expect(entry(monday!, 'Haircut')).toMatchObject({ required: true, carriedOver: true, pinchHitAt: '2026-10-12T05:30:00.000Z' });
  });
});
