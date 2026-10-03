import { describe, expect, it } from 'vitest';
import { ilMinUntil } from '../src/services/tasks';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

// Signs up on Friday 2026-10-02 in Chicago: Spring Training until Monday 2026-10-05.
async function signedUp() {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token, userId } = await t.signIn('roster@example.com', CHICAGO);
  return { t, token, userId };
}

describe('tasks', () => {
  it('creates, lists, edits and retires tasks', async () => {
    const { t, token } = await signedUp();
    const created = await t.call('createTask', { token, body: { name: '  Gym  ' } });
    if (!created.ok) throw new Error('create failed');
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({
      name: 'Gym',
      notes: null,
      points: 1,
      status: 'active',
      ilStartedOn: null,
      ilMinUntil: null,
      currentStreak: 0,
      longestStreak: 0,
      createdAt: '2026-10-02T15:00:00.000Z',
    });
    const read = await t.ok('createTask', { token, body: { name: 'Read', points: 2, notes: '20 pages' } });

    const edited = await t.ok('updateTask', {
      token,
      params: { taskId: created.data.id },
      body: { name: 'Lift', points: 3, notes: 'legs' },
    });
    expect(edited).toMatchObject({ name: 'Lift', points: 3, notes: 'legs' });

    const retired = await t.ok('retireTask', { token, params: { taskId: read.id } });
    expect(retired.status).toBe('retired');
    expect((await t.ok('retireTask', { token, params: { taskId: read.id } })).status).toBe('retired');

    const list = await t.ok('listTasks', { token });
    expect(list.tasks.map((x) => [x.name, x.status])).toEqual([
      ['Lift', 'active'],
      ['Read', 'retired'],
    ]);
  });

  it('validates task input', async () => {
    const { t, token } = await signedUp();
    for (const body of [{ name: '' }, { name: 'x', points: 0 }, { name: 'x', points: 101 }, { name: 'x'.repeat(81) }]) {
      expect((await t.fails('createTask', { token, body }, 400)).code).toBe('VALIDATION_FAILED');
    }
  });

  it("hides other users' tasks", async () => {
    const { t, token } = await signedUp();
    const other = await t.signIn('other@example.com', CHICAGO);
    const mine = await t.ok('createTask', { token, body: { name: 'Mine' } });
    expect((await t.fails('updateTask', { token: other.token, params: { taskId: mine.id }, body: { name: 'x' } }, 404)).code).toBe(
      'NOT_FOUND',
    );
    expect((await t.fails('retireTask', { token, params: { taskId: 'not-a-uuid' } }, 404)).code).toBe('NOT_FOUND');
    expect((await t.ok('listTasks', { token: other.token })).tasks).toEqual([]);
  });

  it('renames a task in a lineup that is still before first pitch, but not after', async () => {
    const { t, token } = await signedUp();
    const ids = await createTasks(t, token, [{ name: 'Read' }, { name: 'Gym' }]);
    await t.ok('putStarter', {
      token,
      params: { weekday: 1 },
      body: {
        name: 'Monday',
        threshold: 1,
        minTasks: null,
        lockTime: null,
        lineup: [
          { taskId: ids.Read!, position: 1, required: false },
          { taskId: ids.Gym!, position: 2, required: false },
        ],
        bench: [],
      },
    });
    t.at('2026-10-05', '08:00', CHICAGO);
    const [game] = (await t.ok('getToday', { token })).games;
    await t.ok('updateTask', { token, params: { taskId: ids.Read! }, body: { name: 'Read 20 pages', points: 2 } });
    let entries = (await t.ok('getGame', { token, params: { gameId: game!.id } })).entries;
    expect(entries.find((e) => e.taskId === ids.Read)).toMatchObject({ taskName: 'Read 20 pages', points: 2 });

    await t.ok('lockGame', { token, params: { gameId: game!.id } });
    await t.ok('updateTask', { token, params: { taskId: ids.Read! }, body: { name: 'Read a chapter', points: 5 } });
    entries = (await t.ok('getGame', { token, params: { gameId: game!.id } })).entries;
    expect(entries.find((e) => e.taskId === ids.Read)).toMatchObject({ taskName: 'Read 20 pages', points: 2 });
  });
});

describe('starters', () => {
  it('always returns 7 starters with empty defaults', async () => {
    const { t, token } = await signedUp();
    const { starters } = await t.ok('listStarters', { token });
    expect(starters.map((s) => s.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(starters[0]).toEqual({
      weekday: 1,
      name: 'Monday Starter',
      threshold: 1,
      minTasks: null,
      lockTime: null,
      lineup: [],
      bench: [],
      warnings: ['EMPTY_LINEUP'],
    });
    expect(starters[6]?.name).toBe('Sunday Starter');
  });

  it('replaces a starter and returns rules.starterWarnings', async () => {
    const { t, token } = await signedUp();
    const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }, { name: 'Walk' }]);
    const starter = await t.ok('putStarter', {
      token,
      params: { weekday: 1 },
      body: {
        name: ' Gym Day ',
        threshold: 5,
        minTasks: 3,
        lockTime: '09:00',
        lineup: [
          { taskId: ids.Gym!, position: 5, required: true },
          { taskId: ids.Read!, position: 2, required: false },
        ],
        bench: [{ taskId: ids.Walk!, position: 1 }],
      },
    });
    expect(starter).toEqual({
      weekday: 1,
      name: 'Gym Day',
      threshold: 5,
      minTasks: 3,
      lockTime: '09:00',
      lineup: [
        { taskId: ids.Read, position: 1, required: false },
        { taskId: ids.Gym, position: 2, required: true },
      ],
      bench: [{ taskId: ids.Walk, position: 1 }],
      warnings: ['THRESHOLD_UNREACHABLE', 'MIN_TASKS_UNREACHABLE'],
    });
    const listed = (await t.ok('listStarters', { token })).starters[0];
    expect(listed).toEqual(starter);
  });

  it('keeps the first spot of a duplicated task and warns', async () => {
    const { t, token } = await signedUp();
    const ids = await createTasks(t, token, [{ name: 'Read' }]);
    const starter = await t.ok('putStarter', {
      token,
      params: { weekday: 2 },
      body: {
        name: 'Tuesday',
        threshold: 1,
        minTasks: null,
        lockTime: null,
        lineup: [{ taskId: ids.Read!, position: 1, required: true }],
        bench: [{ taskId: ids.Read!, position: 1 }],
      },
    });
    expect(starter.lineup).toHaveLength(1);
    expect(starter.bench).toEqual([]);
    expect(starter.warnings).toEqual(['DUPLICATE_TASK']);
  });

  it('rejects unknown or retired tasks and bad weekdays', async () => {
    const { t, token } = await signedUp();
    const ids = await createTasks(t, token, [{ name: 'Old' }]);
    await t.ok('retireTask', { token, params: { taskId: ids.Old! } });
    const body = (taskId: string) => ({
      name: 'X',
      threshold: 1,
      minTasks: null,
      lockTime: null,
      lineup: [{ taskId, position: 1, required: false }],
      bench: [],
    });
    const unknown = await t.fails(
      'putStarter',
      { token, params: { weekday: 1 }, body: body('0192f3a4-5b6c-7d8e-9f01-23456789abcd') },
      400,
    );
    expect(unknown).toMatchObject({ code: 'VALIDATION_FAILED', issues: [{ path: 'lineup.0.taskId', message: 'Unknown task.' }] });
    expect((await t.fails('putStarter', { token, params: { weekday: 1 }, body: body(ids.Old!) }, 400)).issues?.[0]?.message).toBe(
      'This task is retired.',
    );
    expect((await t.fails('putStarter', { token, params: { weekday: 8 }, body: body(ids.Old!) }, 400)).code).toBe(
      'VALIDATION_FAILED',
    );
    expect((await t.fails('putStarter', { token, params: { weekday: 'mon' }, body: body(ids.Old!) }, 400)).code).toBe(
      'VALIDATION_FAILED',
    );
    const zero = await t.fails('putStarter', { token, params: { weekday: 1 }, body: { ...body(ids.Old!), threshold: 0 } }, 400);
    expect(zero.issues?.[0]?.path).toBe('threshold');
  });

  it('drops a retired task from every starter', async () => {
    const { t, token } = await signedUp();
    const ids = await createTasks(t, token, [{ name: 'Gym' }, { name: 'Read' }]);
    for (const weekday of [1, 3]) {
      await t.ok('putStarter', {
        token,
        params: { weekday },
        body: {
          name: 'S',
          threshold: 1,
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
    await t.ok('retireTask', { token, params: { taskId: ids.Gym! } });
    const { starters } = await t.ok('listStarters', { token });
    expect(starters[0]?.lineup.map((s) => s.taskId)).toEqual([ids.Read]);
    expect(starters[2]?.lineup.map((s) => s.taskId)).toEqual([ids.Read]);
  });
});

describe('injured list', () => {
  async function mondayWithLineup() {
    const { t, token } = await signedUp();
    const ids = await createTasks(t, token, [{ name: 'Gym' }, { name: 'Read' }]);
    await t.ok('putStarter', {
      token,
      params: { weekday: 1 },
      body: {
        name: 'Monday',
        threshold: 1,
        minTasks: null,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: false },
        ],
        bench: [],
      },
    });
    t.at('2026-10-05', '08:00', CHICAGO);
    const [game] = (await t.ok('getToday', { token })).games;
    if (!game) throw new Error('no game');
    return { t, token, ids, game };
  }

  it('starts today before first pitch, removes the task from today, and enforces the 3-day minimum', async () => {
    const { t, token, ids, game } = await mondayWithLineup();
    const { task } = await t.ok('placeOnInjuredList', { token, params: { taskId: ids.Read! } });
    expect(task).toMatchObject({ status: 'injured', ilStartedOn: '2026-10-05', ilMinUntil: '2026-10-08' });
    const entries = (await t.ok('getGame', { token, params: { gameId: game.id } })).entries;
    expect(entries.map((e) => e.taskName)).toEqual(['Gym']);

    // Tomorrow's lineup is built without it.
    t.at('2026-10-06', '08:00', CHICAGO);
    expect((await t.ok('getToday', { token })).games[0]?.entries).toEqual([]);

    t.at('2026-10-07', '23:00', CHICAGO);
    const early = await t.fails('activateFromInjuredList', { token, params: { taskId: ids.Read! } }, 409);
    expect(early).toMatchObject({ code: 'IL_MINIMUM', reason: 'MINIMUM_STINT' });
    t.at('2026-10-08', '07:00', CHICAGO);
    const back = await t.ok('activateFromInjuredList', { token, params: { taskId: ids.Read! } });
    expect(back.task).toMatchObject({ status: 'active', ilStartedOn: null, ilMinUntil: null });
    expect((await t.ok('placeOnInjuredList', { token, params: { taskId: ids.Read! } })).task.status).toBe('injured');
  });

  it("starts tomorrow when the task is in today's game after first pitch", async () => {
    const { t, token, ids, game } = await mondayWithLineup();
    await t.ok('lockGame', { token, params: { gameId: game.id } });
    const { task } = await t.ok('placeOnInjuredList', { token, params: { taskId: ids.Read! } });
    expect(task).toMatchObject({ status: 'injured', ilStartedOn: '2026-10-06', ilMinUntil: '2026-10-09' });
    const entries = (await t.ok('getGame', { token, params: { gameId: game.id } })).entries;
    expect(entries.map((e) => e.taskName)).toEqual(['Gym', 'Read']);

    // A stint that hasn't started yet can be cancelled.
    const cancelled = await t.ok('activateFromInjuredList', { token, params: { taskId: ids.Read! } });
    expect(cancelled.task.status).toBe('active');
    expect((await t.fails('activateFromInjuredList', { token, params: { taskId: ids.Read! } }, 409)).code).toBe('CONFLICT');
  });

  it('pauses the minimum stint through Review Week', () => {
    // Season 1 (sign-up 2026-10-02) ends Sunday 2027-03-28; Review Week runs to 2027-04-04.
    expect(ilMinUntil('2026-10-02', '2026-10-06')).toBe('2026-10-09');
    expect(ilMinUntil('2026-10-02', '2027-03-27')).toBe('2027-04-06');
    expect(ilMinUntil('2026-10-02', '2027-03-30')).toBe('2027-04-08');
  });
});

describe('profile and calendar', () => {
  it('edits the profile', async () => {
    const { t, token } = await signedUp();
    const me = await t.ok('updateMe', { token, body: { displayName: ' Night Owls ', defaultLockTime: '21:30' } });
    expect(me).toMatchObject({ displayName: 'Night Owls', defaultLockTime: '21:30', timezone: CHICAGO });
    expect((await t.ok('updateMe', { token, body: { defaultLockTime: null } })).defaultLockTime).toBeNull();
    expect((await t.fails('updateMe', { token, body: { defaultLockTime: '24:00' } }, 400)).code).toBe('VALIDATION_FAILED');
    expect((await t.fails('updateMe', { token, body: { timezone: 'Nowhere/Land' } }, 400)).code).toBe('VALIDATION_FAILED');

    // 10:00 in Chicago is already midnight-plus in Tokyo, so "today" moves with the zone.
    t.at('2026-10-02', '10:00', CHICAGO);
    const moved = await t.ok('updateMe', { token, body: { timezone: 'Asia/Tokyo' } });
    expect(moved).toMatchObject({ timezone: 'Asia/Tokyo', today: '2026-10-03', startDate: '2026-10-02' });
  });

  it('reports the season calendar', async () => {
    const { t, token } = await signedUp();
    expect(await t.ok('getCalendar', { token })).toEqual({
      signupDate: '2026-10-02',
      today: '2026-10-02',
      position: { phase: 'preseason', seasonNumber: 1, openingDay: '2026-10-05', daysUntilOpeningDay: 3 },
      seasons: [
        { number: 1, start: '2026-10-05', playEnd: '2027-03-28', offseasonStart: '2027-03-29', offseasonEnd: '2027-04-04' },
        { number: 2, start: '2027-04-05', playEnd: '2027-09-26', offseasonStart: '2027-09-27', offseasonEnd: '2027-10-03' },
      ],
    });
  });
});
