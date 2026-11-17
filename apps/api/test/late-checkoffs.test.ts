import type { GameDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';
import { describe, expect, it } from 'vitest';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

/**
 * Chicago user, sign-up Friday 2026-10-02. Every day: Gym (2) and Read must-hits, Walk and
 * Stretch. Runs to win: 3 + half of 2 = 4. Gym, Read and Walk win; all four is perfect.
 */
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
  return { t, token, ids };
}

const entry = (g: GameDto, name: string) => {
  const found = g.entries.find((e) => e.taskName === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found;
};

async function complete(t: TestApp, token: string, game: GameDto, names: string[]) {
  for (const name of names) {
    await t.ok('completeEntry', { token, params: { gameId: game.id, entryId: entry(game, name).id }, body: { clientAt: t.clock.now().toISOString() } });
  }
}

/** Play `date` at 8 p.m., then settle it at 12:30 a.m. */
async function playDay(t: TestApp, token: string, date: string, names: string[]): Promise<GameDto> {
  t.at(date, '20:00', CHICAGO);
  const [game] = (await t.ok('getToday', { token })).games;
  await complete(t, token, game!, names);
  t.at(addDays(date, 1), '00:30', CHICAGO);
  await t.finalize();
  return game!;
}

describe('late check-offs', () => {
  it('turns an L into a W and gives back a Rally Cap rolled on it', async () => {
    const { t, token } = await setup('late-rally@example.com');
    const monday = await playDay(t, token, '2026-10-05', ['Gym', 'Walk', 'Stretch']); // Read missed: L
    expect(await t.ok('getGame', { token, params: { gameId: monday.id } })).toMatchObject({ result: 'L', resultDetail: 'forfeit' });

    t.at('2026-10-06', '09:00', CHICAGO);
    t.rolls.push(99);
    await t.ok('rollRally', { token, params: { gameId: monday.id }, headers: { 'idempotency-key': 'late-rally-1' } });
    expect((await t.ok('getMe', { token })).allowances.rallyTokens).toBe(0);

    // 9:30 a.m.: Read, done at 11:50 p.m. on a phone that was offline, finally syncs.
    t.at('2026-10-06', '09:30', CHICAGO);
    const rescored = await t.ok('completeEntry', {
      token,
      params: { gameId: monday.id, entryId: entry(monday, 'Read').id },
      body: { clientAt: '2026-10-06T04:50:00Z' },
    });
    expect(rescored).toMatchObject({ status: 'final', result: 'W', resultDetail: 'clean', runs: 5, rallyDeadline: null, rally: null });
    expect((await t.ok('getMe', { token })).allowances.rallyTokens).toBe(1);
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ wins: 1, losses: 0 });
  });

  it('retires a one-off done late and takes back the copy carried into the next day', async () => {
    const { t, token } = await setup('late-oneoff@example.com');
    const haircut = (await t.ok('createTask', { token, body: { name: 'Haircut', kind: 'one_off' } })).id;
    t.at('2026-10-05', '19:00', CHICAGO);
    const [monday] = (await t.ok('getToday', { token })).games;
    await t.ok('addPinchHitter', { token, params: { gameId: monday!.id }, body: { taskId: haircut } });
    await playDay(t, token, '2026-10-05', ['Gym', 'Read', 'Walk']); // Haircut missed: L, carried over

    t.at('2026-10-06', '01:00', CHICAGO);
    const [before] = (await t.ok('getToday', { token })).games;
    expect(entry(before!, 'Haircut')).toMatchObject({ carriedOver: true, required: true });
    expect(before!.threshold).toBe(5); // 4 + Haircut's 1

    const rescored = await t.ok('completeEntry', {
      token,
      params: { gameId: monday!.id, entryId: entry(await t.ok('getGame', { token, params: { gameId: monday!.id } }), 'Haircut').id },
      body: { clientAt: '2026-10-06T04:55:00Z' },
    });
    expect(rescored).toMatchObject({ result: 'W', resultDetail: 'clean' });
    const [after] = (await t.ok('getToday', { token })).games;
    expect(after!.entries.some((e) => e.taskName === 'Haircut')).toBe(false);
    expect(after!.threshold).toBe(4);
    expect((await t.ok('listTasks', { token })).tasks.find((x) => x.id === haircut)).toMatchObject({ status: 'retired', carryover: false });
  });
});

describe('the 3rd Rally Cap', () => {
  it('needs a 7-game win streak with 3 perfect games in it', async () => {
    const { t, token } = await setup('streak@example.com');
    // Seven Ws in a row, only two of them perfect: no streak bonus yet.
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    for (const [i, date] of days.entries()) {
      await playDay(t, token, date, i < 2 ? ['Gym', 'Read', 'Walk', 'Stretch'] : ['Gym', 'Read', 'Walk']);
    }
    // Monthly + series bonus (won without a Rally Cap).
    expect((await t.ok('getMe', { token })).allowances.rallyTokens).toBe(2);

    // An 8th straight W, perfect: three perfect games in the streak.
    await playDay(t, token, '2026-10-12', ['Gym', 'Read', 'Walk', 'Stretch']);
    expect((await t.ok('getMe', { token })).allowances.rallyTokens).toBe(3);
  });
});
