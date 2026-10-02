import type { GameDto } from '@7gs/contracts';
import { describe, expect, it } from 'vitest';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

// Sign-up Friday 2026-10-02 (Chicago, CDT = UTC-5); Game 1 is Monday 2026-10-05.
async function setup(options: { lockTime?: string | null } = {}) {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  return { t, ...(await addUser(t, 'games@example.com', options)) };
}

async function addUser(t: TestApp, email: string, options: { lockTime?: string | null } = {}) {
  const { token } = await t.signIn(email, CHICAGO);
  const ids = await createTasks(t, token, [
    { name: 'Gym', points: 2 },
    { name: 'Read' },
    { name: 'Dishes' },
    { name: 'Walk' },
  ]);
  await t.ok('putStarter', {
    token,
    params: { weekday: 1 },
    body: {
      name: 'Gym Day',
      threshold: 3,
      minTasks: 2,
      lockTime: options.lockTime ?? null,
      lineup: [
        { taskId: ids.Gym!, position: 1, required: true },
        { taskId: ids.Read!, position: 2, required: false },
        { taskId: ids.Dishes!, position: 3, required: false },
      ],
      bench: [{ taskId: ids.Walk!, position: 1 }],
    },
  });
  return { token, ids };
}

async function mondayGame(t: TestApp, token: string, time = '08:00'): Promise<GameDto> {
  t.at('2026-10-05', time, CHICAGO);
  const [game] = (await t.ok('getToday', { token })).games;
  if (!game) throw new Error('no game today');
  return game;
}

function entry(game: GameDto, name: string) {
  const found = game.entries.find((e) => e.taskName === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found;
}

describe('today', () => {
  it('has no games in Spring Training', async () => {
    const { t, token } = await setup();
    t.at('2026-10-03', '10:00', CHICAGO);
    expect(await t.ok('getToday', { token })).toEqual({
      date: '2026-10-03',
      position: { phase: 'preseason', seasonNumber: 1, openingDay: '2026-10-05', daysUntilOpeningDay: 2 },
      games: [],
      series: null,
    });
    expect(await t.ok('getCurrentSeries', { token })).toBeNull();
    expect(await t.ok('getCurrentSeason', { token })).toMatchObject({ number: 1, status: 'upcoming', wins: 0 });
  });

  it("snapshots the starter into the game at the start of its day; later starter edits don't touch it", async () => {
    const { t, token, ids } = await setup();
    t.at('2026-10-05', '00:05', CHICAGO);
    const today = await t.ok('getToday', { token });
    expect(today.date).toBe('2026-10-05');
    expect(today.position).toMatchObject({ phase: 'season', seriesNumber: 1, gameNumber: 1 });
    expect(today.games).toHaveLength(1);
    const game = today.games[0]!;
    expect(game).toMatchObject({
      gameNumber: 1,
      scheduledDate: '2026-10-05',
      playedDate: '2026-10-05',
      slot: 1,
      postponed: false,
      starterName: 'Gym Day',
      threshold: 3,
      minTasks: 2,
      lockTime: null,
      status: 'scheduled',
      lockedAt: null,
      runs: 0,
      tasksDone: 0,
      missedRequired: 1,
      result: null,
      rally: null,
    });
    expect(game.entries.map((e) => [e.taskName, e.role, e.position, e.required, e.points])).toEqual([
      ['Gym', 'lineup', 1, true, 2],
      ['Read', 'lineup', 2, false, 1],
      ['Dishes', 'lineup', 3, false, 1],
      ['Walk', 'bench', 1, false, 1],
    ]);
    expect(today.series).toMatchObject({ seasonNumber: 1, number: 1, startDate: '2026-10-05', endDate: '2026-10-11' });
    expect(today.series?.opponent.name).toMatch(/\S+ \S+/);
    expect(today.series?.games.map((g) => g.starterName)).toEqual([
      'Gym Day',
      'Tuesday Starter',
      'Wednesday Starter',
      'Thursday Starter',
      'Friday Starter',
      'Saturday Starter',
      'Sunday Starter',
    ]);

    // Editing Monday's starter now applies to future Mondays only.
    await t.ok('putStarter', {
      token,
      params: { weekday: 1 },
      body: { name: 'New Monday', threshold: 9, minTasks: null, lockTime: null, lineup: [], bench: [] },
    });
    // Tuesday's game isn't built yet, so it shows (and will use) the edited starter.
    await t.ok('putStarter', {
      token,
      params: { weekday: 2 },
      body: {
        name: 'Reading Day',
        threshold: 1,
        minTasks: null,
        lockTime: null,
        lineup: [{ taskId: ids.Read!, position: 1, required: true }],
        bench: [],
      },
    });
    const again = await t.ok('getGame', { token, params: { gameId: game.id } });
    expect(again).toMatchObject({ starterName: 'Gym Day', threshold: 3 });
    expect(again.entries).toHaveLength(4);
    const strip = await t.ok('getCurrentSeries', { token });
    expect(strip?.games[1]).toMatchObject({ starterName: 'Reading Day', threshold: 1, status: 'scheduled' });

    t.at('2026-10-06', '07:00', CHICAGO);
    const tuesday = (await t.ok('getToday', { token })).games[0]!;
    expect(tuesday).toMatchObject({ gameNumber: 2, starterName: 'Reading Day', threshold: 1 });
    expect(tuesday.entries.map((e) => e.taskName)).toEqual(['Read']);
  });

  it('shows future games with their starter values and no entries', async () => {
    const { t, token } = await setup();
    await mondayGame(t, token);
    const series = await t.ok('getCurrentSeries', { token });
    const friday = await t.ok('getGame', { token, params: { gameId: series!.games[4]!.id } });
    expect(friday).toMatchObject({ starterName: 'Friday Starter', threshold: 1, entries: [], status: 'scheduled', lockedAt: null });
  });
});

describe('lineup edits and locking', () => {
  it('edits the lineup before first pitch and rejects it after a manual lock', async () => {
    const { t, token, ids } = await setup();
    const game = await mondayGame(t, token);
    const patched = await t.ok('patchLineup', {
      token,
      params: { gameId: game.id },
      body: {
        threshold: 2,
        minTasks: null,
        entries: [
          { taskId: ids.Gym!, position: 2, required: false, role: 'lineup' },
          { taskId: ids.Read!, position: 1, required: true, role: 'lineup' },
          { taskId: ids.Walk!, position: 1, required: true, role: 'bench' },
        ],
      },
    });
    expect(patched).toMatchObject({ threshold: 2, minTasks: null, missedRequired: 1 });
    expect(patched.entries.map((e) => [e.taskName, e.role, e.position, e.required])).toEqual([
      ['Read', 'lineup', 1, true],
      ['Gym', 'lineup', 2, false],
      ['Walk', 'bench', 1, false],
    ]);
    // Entries that stay keep their ids.
    expect(entry(patched, 'Read').id).toBe(entry(game, 'Read').id);

    const dup = await t.fails(
      'patchLineup',
      {
        token,
        params: { gameId: game.id },
        body: {
          entries: [
            { taskId: ids.Gym!, position: 1, required: false, role: 'lineup' },
            { taskId: ids.Gym!, position: 2, required: false, role: 'bench' },
          ],
        },
      },
      400,
    );
    expect(dup.issues?.[0]).toEqual({ path: 'entries.1.taskId', message: 'This task is listed twice.' });

    await t.ok('placeOnInjuredList', { token, params: { taskId: ids.Dishes! } });
    const injured = await t.fails(
      'patchLineup',
      { token, params: { gameId: game.id }, body: { entries: [{ taskId: ids.Dishes!, position: 1, required: false, role: 'lineup' }] } },
      400,
    );
    expect(injured.issues?.[0]?.message).toBe('This task is on the injured list.');

    t.at('2026-10-05', '08:30', CHICAGO);
    const locked = await t.ok('lockGame', { token, params: { gameId: game.id } });
    expect(locked).toMatchObject({ status: 'live', lockedAt: '2026-10-05T13:30:00.000Z' });
    t.at('2026-10-05', '08:45', CHICAGO);
    expect((await t.ok('lockGame', { token, params: { gameId: game.id } })).lockedAt).toBe('2026-10-05T13:30:00.000Z');
    const rejected = await t.fails('patchLineup', { token, params: { gameId: game.id }, body: { threshold: 1 } }, 409);
    expect(rejected.code).toBe('GAME_LOCKED');
  });

  it('locks at the scheduled lock time even if nobody calls /lock', async () => {
    const { t, token } = await setup({ lockTime: '09:00' });
    const game = await mondayGame(t, token, '08:59');
    expect(game).toMatchObject({ lockTime: '09:00', status: 'scheduled', lockedAt: null });
    await t.ok('patchLineup', { token, params: { gameId: game.id }, body: { threshold: 4 } });

    t.at('2026-10-05', '09:00', CHICAGO);
    expect((await t.fails('patchLineup', { token, params: { gameId: game.id }, body: { threshold: 3 } }, 409)).code).toBe(
      'GAME_LOCKED',
    );
    expect(await t.ok('getGame', { token, params: { gameId: game.id } })).toMatchObject({
      status: 'live',
      lockedAt: '2026-10-05T14:00:00.000Z',
      threshold: 4,
    });
  });

  it('records first pitch at the earlier of an offline first check-off and the scheduled lock', async () => {
    const { t, token } = await setup({ lockTime: '09:00' });
    const other = await addUser(t, 'other@example.com', { lockTime: '09:00' });
    const game = await mondayGame(t, token, '08:00');
    const otherGame = await mondayGame(t, other.token, '08:00');

    // Both devices were offline; they sync at 10:00, after the 9:00 lock time passed.
    t.at('2026-10-05', '10:00', CHICAGO);
    // Checked off at 8:30: that was first pitch.
    const early = await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: entry(game, 'Gym').id },
      body: { clientAt: '2026-10-05T13:30:00Z' },
    });
    expect(early.lockedAt).toBe('2026-10-05T13:30:00.000Z');
    // Checked off at 9:30: the 9:00 scheduled lock came first.
    const late = await t.ok('completeEntry', {
      token: other.token,
      params: { gameId: otherGame.id, entryId: entry(otherGame, 'Read').id },
      body: { clientAt: '2026-10-05T14:30:00Z' },
    });
    expect(late.lockedAt).toBe('2026-10-05T14:00:00.000Z');
  });

  it("falls back to the user's default lock time", async () => {
    const { t, token } = await setup();
    await t.ok('updateMe', { token, body: { defaultLockTime: '07:30' } });
    const game = await mondayGame(t, token, '07:00');
    expect(game.lockTime).toBe('07:30');
    t.at('2026-10-05', '07:31', CHICAGO);
    expect((await t.ok('getToday', { token })).games[0]).toMatchObject({ status: 'live', lockedAt: '2026-10-05T12:30:00.000Z' });
  });

  it("only edits or locks games whose day has started, and only the user's own", async () => {
    const { t, token } = await setup();
    await mondayGame(t, token);
    const wednesday = (await t.ok('getCurrentSeries', { token }))!.games[2]!;
    const notYet = await t.fails('patchLineup', { token, params: { gameId: wednesday.id }, body: { threshold: 2 } }, 409);
    expect(notYet).toMatchObject({ code: 'CONFLICT', reason: 'NOT_STARTED' });
    expect((await t.fails('lockGame', { token, params: { gameId: wednesday.id } }, 409)).reason).toBe('NOT_STARTED');

    const other = await t.signIn('stranger@example.com', CHICAGO);
    expect((await t.fails('getGame', { token: other.token, params: { gameId: wednesday.id } }, 404)).code).toBe('NOT_FOUND');
    expect((await t.fails('getGame', { token, params: { gameId: 'nope' } }, 404)).code).toBe('NOT_FOUND');
  });
});

describe('check-offs', () => {
  it('scores live, locks on the first check-off, and is idempotent', async () => {
    const { t, token } = await setup();
    const game = await mondayGame(t, token);
    t.at('2026-10-05', '10:00', CHICAGO);
    const params = { gameId: game.id, entryId: entry(game, 'Gym').id };
    const after = await t.ok('completeEntry', { token, params, body: { clientAt: '2026-10-05T15:00:00Z' } });
    expect(after).toMatchObject({ status: 'live', lockedAt: '2026-10-05T15:00:00.000Z', runs: 2, tasksDone: 1, missedRequired: 0 });
    expect(entry(after, 'Gym').completedAt).toBe('2026-10-05T15:00:00.000Z');

    t.clock.advanceMinutes(5);
    const replay = await t.ok('completeEntry', { token, params, body: { clientAt: '2026-10-05T15:05:00Z' } });
    expect(entry(replay, 'Gym').completedAt).toBe('2026-10-05T15:00:00.000Z');
    expect(replay.runs).toBe(2);

    const read = { gameId: game.id, entryId: entry(game, 'Read').id };
    expect((await t.ok('completeEntry', { token, params: read, body: { clientAt: t.clock.now().toISOString() } })).runs).toBe(3);
    const undone = await t.ok('uncompleteEntry', { token, params: read });
    expect(undone).toMatchObject({ runs: 2, tasksDone: 1, status: 'live' });
    expect(entry(undone, 'Read').completedAt).toBeNull();
    expect((await t.ok('uncompleteEntry', { token, params: read })).runs).toBe(2);
  });

  it('rejects check-offs the rules reject with STALE_CHECKOFF and a reason', async () => {
    const { t, token } = await setup();
    const game = await mondayGame(t, token, '10:00');
    const now = t.clock.now().getTime();
    const cases = [
      { name: 'Walk', clientAt: new Date(now).toISOString(), reason: 'NOT_IN_LINEUP' },
      { name: 'Read', clientAt: new Date(now + 10 * 60_000).toISOString(), reason: 'CLIENT_CLOCK_AHEAD' },
      { name: 'Read', clientAt: '2026-10-05T04:59:59Z', reason: 'BEFORE_GAME_DAY' },
    ];
    for (const c of cases) {
      const error = await t.fails(
        'completeEntry',
        { token, params: { gameId: game.id, entryId: entry(game, c.name).id }, body: { clientAt: c.clientAt } },
        409,
      );
      expect(error).toMatchObject({ code: 'STALE_CHECKOFF', reason: c.reason });
    }
    expect(
      (
        await t.fails(
          'completeEntry',
          { token, params: { gameId: game.id, entryId: game.id }, body: { clientAt: new Date(now).toISOString() } },
          404,
        )
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      (await t.fails('completeEntry', { token, params: { gameId: game.id, entryId: entry(game, 'Read').id }, body: {} }, 400)).code,
    ).toBe('VALIDATION_FAILED');
  });

  it('accepts offline replays made before midnight until the game is final', async () => {
    const { t, token } = await setup();
    const game = await mondayGame(t, token, '10:00');
    const at = (name: string) => ({ gameId: game.id, entryId: entry(game, name).id });
    await t.ok('completeEntry', { token, params: at('Gym'), body: { clientAt: '2026-10-05T15:00:00Z' } });

    // 12:10 a.m. Tuesday: the 11:58 p.m. check-off syncs late and still counts.
    t.at('2026-10-06', '00:10', CHICAGO);
    const synced = await t.ok('completeEntry', { token, params: at('Read'), body: { clientAt: '2026-10-06T04:58:00Z' } });
    expect(synced).toMatchObject({ runs: 3, tasksDone: 2, status: 'live' });
    // …but one made after midnight doesn't, and nothing can be undone any more.
    expect(
      await t.fails('completeEntry', { token, params: at('Dishes'), body: { clientAt: '2026-10-06T05:05:00Z' } }, 409),
    ).toMatchObject({ code: 'STALE_CHECKOFF', reason: 'AFTER_MIDNIGHT' });
    expect(await t.fails('uncompleteEntry', { token, params: at('Read') }, 409)).toMatchObject({
      code: 'STALE_CHECKOFF',
      reason: 'AFTER_MIDNIGHT',
    });
    // Tuesday is already the new "today".
    expect((await t.ok('getToday', { token })).games[0]?.gameNumber).toBe(2);

    // 12:30 a.m.: the finalizer closes Monday; later replays are stale.
    t.at('2026-10-06', '00:30', CHICAGO);
    await t.finalize();
    const final = await t.ok('getGame', { token, params: { gameId: game.id } });
    expect(final).toMatchObject({ status: 'final', result: 'W', resultDetail: 'clean', runs: 3, tasksDone: 2 });
    expect(
      await t.fails('completeEntry', { token, params: at('Dishes'), body: { clientAt: '2026-10-06T04:59:00Z' } }, 409),
    ).toMatchObject({ code: 'STALE_CHECKOFF', reason: 'GAME_FINAL' });
    // Replaying a check-off that already counted is still a no-op success.
    expect((await t.ok('completeEntry', { token, params: at('Gym'), body: { clientAt: '2026-10-05T15:00:00Z' } })).runs).toBe(3);
  });

  it('marks an incomplete must-hit as partly done before midnight', async () => {
    const { t, token } = await setup();
    const game = await mondayGame(t, token, '20:00');
    const gym = { gameId: game.id, entryId: entry(game, 'Gym').id };
    const marked = await t.ok('patchEntry', { token, params: gym, body: { partial: true } });
    expect(entry(marked, 'Gym').partial).toBe(true);
    expect(marked.status).toBe('scheduled'); // not a check-off, so no first pitch

    expect(
      await t.fails('patchEntry', { token, params: { gameId: game.id, entryId: entry(game, 'Read').id }, body: { partial: true } }, 409),
    ).toMatchObject({ code: 'CONFLICT', reason: 'NOT_REQUIRED' });

    t.at('2026-10-06', '00:01', CHICAGO);
    expect(await t.fails('patchEntry', { token, params: gym, body: { partial: false } }, 409)).toMatchObject({
      code: 'STALE_CHECKOFF',
      reason: 'AFTER_MIDNIGHT',
    });
  });
});

describe('substitutions', () => {
  it('swaps a bench task in for a non-required one after first pitch', async () => {
    const { t, token } = await setup();
    const game = await mondayGame(t, token, '09:00');
    const ids = (name: string) => entry(game, name).id;
    const body = { outEntryId: ids('Read'), inEntryId: ids('Walk') };
    expect(await t.fails('substitute', { token, params: { gameId: game.id }, body }, 409)).toMatchObject({
      code: 'CONFLICT',
      reason: 'NOT_LOCKED',
    });

    await t.ok('lockGame', { token, params: { gameId: game.id } });
    t.at('2026-10-05', '12:00', CHICAGO);
    const subbed = await t.ok('substitute', { token, params: { gameId: game.id }, body });
    expect(subbed.entries.map((e) => [e.taskName, e.role, e.position])).toEqual([
      ['Gym', 'lineup', 1],
      ['Walk', 'lineup', 2],
      ['Dishes', 'lineup', 3],
      ['Read', 'subbed_out', 2],
    ]);
    expect(entry(subbed, 'Walk').subbedInAt).toBe('2026-10-05T17:00:00.000Z');

    expect(
      await t.fails('substitute', { token, params: { gameId: game.id }, body: { outEntryId: ids('Gym'), inEntryId: ids('Read') } }, 409),
    ).toMatchObject({ code: 'GAME_LOCKED', reason: 'REQUIRED' });
    expect(
      await t.fails('substitute', { token, params: { gameId: game.id }, body: { outEntryId: ids('Dishes'), inEntryId: ids('Read') } }, 409),
    ).toMatchObject({ code: 'CONFLICT', reason: 'NOT_ON_BENCH' });

    const walk = await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: ids('Walk') },
      body: { clientAt: t.clock.now().toISOString() },
    });
    expect(walk).toMatchObject({ runs: 1, tasksDone: 1 });
    expect(
      await t.fails(
        'completeEntry',
        { token, params: { gameId: game.id, entryId: ids('Read') }, body: { clientAt: t.clock.now().toISOString() } },
        409,
      ),
    ).toMatchObject({ code: 'STALE_CHECKOFF', reason: 'NOT_IN_LINEUP' });
  });
});
