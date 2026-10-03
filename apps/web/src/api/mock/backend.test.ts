import { evaluateGame, seriesStatus, type LineupRole } from '@7gs/rules';
import { describe, expect, it } from 'vitest';
import { ApiError, withResponseValidation, type ApiClient } from '../client';
import { createMockApi } from './index';
import { SCENARIOS, type ScenarioName } from './db';
import { scenarioDates } from './seed';

// Friday 2 October 2026, noon in Chicago.
const REAL_NOW = Date.parse('2026-10-02T17:00:00Z');
const TZ = 'America/Chicago';
const DAY = 86_400_000;

function setup(scenario: ScenarioName = 'midseason') {
  let realNow = REAL_NOW;
  const { api, backend } = createMockApi({
    storage: null,
    realNow: () => realNow,
    timeZone: TZ,
    scenario,
    fresh: true,
  });
  const client: ApiClient = withResponseValidation(api);
  return {
    api: client,
    backend,
    /** Moves the device clock (and so the demo clock) forward. */
    tick: (ms: number) => {
      realNow += ms;
    },
  };
}

function project(game: { entries: { points: number; required: boolean; role: LineupRole; completedAt: string | null; partial: boolean }[]; threshold: number; minTasks: number | null }) {
  return evaluateGame(
    game.entries.map((e) => ({ ...e, completed: e.completedAt !== null })),
    { threshold: game.threshold, minTasks: game.minTasks },
  );
}

async function expectApiError(promise: Promise<unknown>, code: string, reason?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
  if (reason) expect((error as ApiError).reason).toBe(reason);
}

describe('mock backend seeds', () => {
  it.each(SCENARIOS)('%s returns contract-valid data from every read endpoint', async (scenario) => {
    const { api } = setup(scenario);
    const me = await api.call('getMe');
    const today = await api.call('getToday');
    await api.call('getCalendar');
    await api.call('listTasks');
    const starters = await api.call('listStarters');
    const series = await api.call('getCurrentSeries');
    const season = await api.call('getCurrentSeason');
    expect(me.today).toBe(today.date);
    expect(starters.starters).toHaveLength(7);
    for (const game of today.games) await api.call('getGame', { params: { gameId: game.id } });
    if (series) await api.call('getSeries', { params: { seriesId: series.id } });
    if (season) await api.call('getSeason', { params: { seasonId: season.id } });
  });

  it('pins each scenario to its weekday near the real date', () => {
    expect(scenarioDates('midseason', '2026-10-02').demoToday).toBe('2026-10-02');
    expect(scenarioDates('midseason', '2026-10-05').demoToday).toBe('2026-10-02');
    expect(scenarioDates('midseason', '2026-10-07').demoToday).toBe('2026-10-09');
    expect(scenarioDates('doubleheader', '2026-10-02').demoToday).toBe('2026-10-03');
  });

  it('midseason: a series partway through with a live game, a rally win and a doubleheader ahead', async () => {
    const { api } = setup('midseason');
    const today = await api.call('getToday');
    expect(today.date).toBe('2026-10-02');
    expect(today.position).toMatchObject({ phase: 'season', seriesNumber: 10, gameNumber: 5 });
    expect(today.games).toHaveLength(1);

    const game = today.games[0]!;
    expect(game).toMatchObject({ status: 'live', starterName: 'Friday Finisher', threshold: 5, runs: 3 });
    expect(game.lockedAt).not.toBeNull();
    const projection = project(game);
    expect(projection).toMatchObject({ runsNeeded: 2, missedRequired: 1, result: 'L' });

    const series = today.series!;
    const byNumber = (n: number) => series.games.find((g) => g.gameNumber === n)!;
    expect(byNumber(1)).toMatchObject({ result: 'W', resultDetail: 'clean' });
    expect(byNumber(2)).toMatchObject({ result: 'L', resultDetail: 'forfeit' });
    expect(byNumber(3)).toMatchObject({ postponed: true, playedDate: '2026-10-03', slot: 2, status: 'scheduled' });
    expect(byNumber(4)).toMatchObject({ result: 'W', resultDetail: 'rally' });
    expect(seriesStatus(series.games).label).toBe('Leads 2–1');

    const thursday = await api.call('getGame', { params: { gameId: byNumber(4).id } });
    expect(thursday.rally).toMatchObject({ hit: true, roll: 7, oddsPct: 20 });

    const tasks = (await api.call('listTasks')).tasks;
    expect(tasks.filter((t) => t.status === 'active')).toHaveLength(8);
    expect(tasks.find((t) => t.status === 'injured')).toMatchObject({ name: 'Guitar practice', ilMinUntil: '2026-10-03' });
    expect(tasks.find((t) => t.status === 'retired')?.name).toBe('Cold shower');

    // October's Rally Cap went on Thursday's game; Wednesday's rainout used September's.
    const me = await api.call('getMe');
    expect(me.allowances).toMatchObject({ month: '2026-10', rallyTokens: 0 });
    expect(me.allowances.rainouts).toBe(2 + (me.allowances.ironManBonusHeld ? 1 : 0));
  });

  it('doubleheader: two games today, game 2 is the makeup, and the series is at clinch', async () => {
    const { api } = setup('doubleheader');
    const today = await api.call('getToday');
    expect(today.date).toBe('2026-10-03');
    expect(today.games.map((g) => [g.slot, g.gameNumber, g.postponed])).toEqual([
      [1, 6, false],
      [2, 3, true],
    ]);
    expect(today.games[0]!.lockedAt).toBeNull();
    expect(today.games[1]!).toMatchObject({ status: 'live', runs: 2 });
    expect(seriesStatus(today.series!.games)).toMatchObject({ label: 'Leads 3–1', situation: 'clinch' });
  });

  it('preseason and offseason have no games today', async () => {
    const pre = setup('preseason');
    const preToday = await pre.api.call('getToday');
    expect(preToday).toMatchObject({ games: [], series: null, position: { phase: 'preseason', daysUntilOpeningDay: 4 } });
    expect(await pre.api.call('getCurrentSeason')).toMatchObject({ number: 1, status: 'upcoming', winGoal: null });

    const off = setup('offseason');
    const offToday = await off.api.call('getToday');
    expect(offToday).toMatchObject({ games: [], series: null, position: { phase: 'offseason', seasonNumber: 1 } });
    const season = await off.api.call('getCurrentSeason');
    expect(season).toMatchObject({ status: 'offseason', winGoal: 110 });
    expect(season!.wins + season!.losses).toBe(175);
    expect(season!.seriesWon + season!.seriesLost).toBe(25);
  });
});

describe('mock backend game day', () => {
  it('check-off → projection → finalize at midnight', async () => {
    const { api, backend, tick } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    const deepWork = game.entries.find((e) => e.taskName === 'Deep work block')!;

    const after = await api.call('completeEntry', {
      params: { gameId: game.id, entryId: deepWork.id },
      body: { clientAt: backend.now().toISOString() },
    });
    expect(after.runs).toBe(6);
    expect(project(after)).toMatchObject({ result: 'W', runsNeeded: 0, missedRequired: 0 });

    // Repeating a check-off is idempotent.
    const again = await api.call('completeEntry', {
      params: { gameId: game.id, entryId: deepWork.id },
      body: { clientAt: backend.now().toISOString() },
    });
    expect(again.entries.find((e) => e.id === deepWork.id)?.completedAt).toBe(
      after.entries.find((e) => e.id === deepWork.id)?.completedAt,
    );

    // Saturday 00:20: still settling; Saturday 01:00: final.
    tick(5 * 60 * 60 * 1000 + 40 * 60 * 1000);
    expect((await api.call('getGame', { params: { gameId: game.id } })).status).toBe('live');
    tick(40 * 60 * 1000);
    const final = await api.call('getGame', { params: { gameId: game.id } });
    expect(final).toMatchObject({ status: 'final', result: 'W', resultDetail: 'clean', runs: 6 });
    // Noon the next day, Chicago time.
    expect(final.rallyDeadline).toBe('2026-10-03T17:00:00.000Z');

    const today = await api.call('getToday');
    expect(today.date).toBe('2026-10-03');
    expect(today.games).toHaveLength(2);
    expect(seriesStatus(today.series!.games).label).toBe('Leads 3–1');
  });

  it('rejects check-offs made after midnight with STALE_CHECKOFF', async () => {
    const { api, backend, tick } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    const read = game.entries.find((e) => e.taskName === 'Read 20 pages')!;
    const lateClientAt = new Date(backend.now().getTime() + 6 * 60 * 60 * 1000).toISOString(); // 00:40 Saturday
    tick(6 * 60 * 60 * 1000);
    await expectApiError(
      api.call('completeEntry', { params: { gameId: game.id, entryId: read.id }, body: { clientAt: lateClientAt } }),
      'STALE_CHECKOFF',
    );
  });

  it('allows lineup edits before first pitch and locks on the first check-off', async () => {
    const { api, backend } = setup('doubleheader');
    const game1 = (await api.call('getToday')).games[0]!;
    expect(game1.lockedAt).toBeNull();
    const lineup = game1.entries.filter((e) => e.role === 'lineup');
    const reordered = [...lineup].reverse().map((e, i) => ({ taskId: e.taskId, position: i + 1, required: e.required, role: 'lineup' as const }));
    const patched = await api.call('patchLineup', {
      params: { gameId: game1.id },
      body: { threshold: 3, entries: reordered },
    });
    expect(patched.threshold).toBe(3);
    expect(patched.entries.filter((e) => e.role === 'lineup').map((e) => e.taskId)).toEqual(reordered.map((e) => e.taskId));
    expect(patched.entries.filter((e) => e.role === 'bench')).toHaveLength(0);

    const first = patched.entries[0]!;
    const locked = await api.call('completeEntry', {
      params: { gameId: game1.id, entryId: first.id },
      body: { clientAt: backend.now().toISOString() },
    });
    expect(locked.lockedAt).not.toBeNull();
    await expectApiError(api.call('patchLineup', { params: { gameId: game1.id }, body: { threshold: 1 } }), 'GAME_LOCKED');
  });

  it('subs a bench task in for a non-required lineup task after first pitch', async () => {
    const { api } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    const bench = game.entries.find((e) => e.role === 'bench')!;
    const mustHit = game.entries.find((e) => e.role === 'lineup' && e.required && !e.completedAt)!;
    const walk = game.entries.find((e) => e.taskName === 'Evening walk')!;
    await expectApiError(
      api.call('substitute', { params: { gameId: game.id }, body: { outEntryId: mustHit.id, inEntryId: bench.id } }),
      'NOT_ELIGIBLE',
      'REQUIRED',
    );
    const after = await api.call('substitute', {
      params: { gameId: game.id },
      body: { outEntryId: walk.id, inEntryId: bench.id },
    });
    expect(after.entries.find((e) => e.id === walk.id)?.role).toBe('subbed_out');
    expect(after.entries.find((e) => e.id === bench.id)).toMatchObject({ role: 'lineup', position: walk.position });
    expect(after.entries.find((e) => e.id === bench.id)?.subbedInAt).not.toBeNull();
  });

  it('marks a must-hit as warning track', async () => {
    const { api } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    const mustHit = game.entries.find((e) => e.required && !e.completedAt)!;
    const after = await api.call('patchEntry', { params: { gameId: game.id, entryId: mustHit.id }, body: { partial: true } });
    expect(after.entries.find((e) => e.id === mustHit.id)?.partial).toBe(true);
  });
});

describe('mock backend rainouts, Rally Cap and IL', () => {
  it('quotes and calls a rainout for a future game', async () => {
    const { api } = setup('midseason');
    const series = (await api.call('getCurrentSeries'))!;
    const sunday = series.games.find((g) => g.gameNumber === 7)!;
    expect(await api.call('getRainoutQuote', { params: { gameId: sunday.id } })).toMatchObject({ ok: false, reason: 'SUNDAY' });

    const saturday = series.games.find((g) => g.gameNumber === 6)!;
    const before = (await api.call('getMe')).allowances.rainouts;
    const quote = await api.call('getRainoutQuote', { params: { gameId: saturday.id } });
    expect(quote).toMatchObject({ ok: true, makeupDates: ['2026-10-04'], allowancesAvailable: before });
    const after = await api.call('callRainout', { params: { gameId: saturday.id }, body: { makeupDate: '2026-10-04' } });
    expect(after.games.find((g) => g.gameNumber === 6)).toMatchObject({ postponed: true, playedDate: '2026-10-04', slot: 2 });
    expect((await api.call('getMe')).allowances.rainouts).toBe(before - 1);
  });

  it('shows the odds before rolling and rolls once per game', async () => {
    const { api } = setup('rally');
    const today = await api.call('getToday');
    const thursday = today.series!.games.find((g) => g.gameNumber === 4)!;
    expect(thursday).toMatchObject({ result: 'L', resultDetail: 'forfeit' });

    const quote = await api.call('getRallyQuote', { params: { gameId: thursday.id } });
    expect(quote).toMatchObject({ eligible: true, seasonWinStreak: 4, tokensAvailable: 1 });
    expect(quote.odds).toMatchObject({ base: 31, closeness: -5, missedMustHit: -5, warningTrack: 4, runCushion: 0, pct: 25 });

    await expectApiError(api.call('rollRally', { params: { gameId: thursday.id } }), 'VALIDATION_FAILED');
    const first = await api.call('rollRally', { params: { gameId: thursday.id }, headers: { 'Idempotency-Key': 'k1' } });
    const second = await api.call('rollRally', { params: { gameId: thursday.id }, headers: { 'Idempotency-Key': 'k1' } });
    expect(second.roll).toEqual(first.roll);
    expect(first.game.result).toBe(first.roll.hit ? 'W' : 'L');
    expect(await api.call('getRallyQuote', { params: { gameId: thursday.id } })).toMatchObject({
      eligible: false,
      reason: 'ALREADY_ROLLED',
    });
  });

  it('enforces the Injured List minimum', async () => {
    const { api, tick } = setup('midseason');
    const guitar = (await api.call('listTasks')).tasks.find((t) => t.status === 'injured')!;
    await expectApiError(api.call('activateFromInjuredList', { params: { taskId: guitar.id } }), 'IL_MINIMUM');
    tick(DAY);
    const back = await api.call('activateFromInjuredList', { params: { taskId: guitar.id } });
    expect(back.task).toMatchObject({ status: 'active', ilMinUntil: null });
  });

  it('only sets the win goal outside the season', async () => {
    const mid = setup('midseason');
    const season = (await mid.api.call('getCurrentSeason'))!;
    await expectApiError(mid.api.call('updateSeason', { params: { seasonId: season.id }, body: { winGoal: 100 } }), 'OUT_OF_SEASON');

    const pre = setup('preseason');
    const upcoming = (await pre.api.call('getCurrentSeason'))!;
    const updated = await pre.api.call('updateSeason', { params: { seasonId: upcoming.id }, body: { winGoal: 120 } });
    expect(updated.winGoal).toBe(120);
  });
});

describe('mock backend auth', () => {
  it('signs out, then signs a new user in with a dev magic link', async () => {
    const { api } = setup('midseason');
    await api.call('logout');
    await expectApiError(api.call('getToday'), 'UNAUTHORIZED');
    const link = await api.call('requestMagicLink', { body: { email: 'rookie@example.com' } });
    expect(link.devToken).toBeTruthy();
    const session = await api.call('verifyMagicLink', { body: { token: link.devToken!, timezone: TZ } });
    expect(session).toMatchObject({ isNewUser: true, me: { email: 'rookie@example.com' } });
    expect((await api.call('listTasks')).tasks).toEqual([]);
    const starters = (await api.call('listStarters')).starters;
    expect(starters.every((s) => s.warnings.includes('EMPTY_LINEUP'))).toBe(true);
    await expectApiError(api.call('verifyMagicLink', { body: { token: link.devToken!, timezone: TZ } }), 'UNAUTHORIZED');
  });

  it('validates request bodies with the contract schemas', async () => {
    const { api } = setup('midseason');
    await expectApiError(api.call('createTask', { body: { name: '' } }), 'VALIDATION_FAILED');
    const task = await api.call('createTask', { body: { name: '  Stretch  ' } });
    expect(task).toMatchObject({ name: 'Stretch', points: 1, status: 'active' });
  });
});
