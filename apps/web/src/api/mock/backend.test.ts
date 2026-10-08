import { evaluateGame, scoreline, seriesStatus, type LineupRole } from '@7gs/rules';
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
    // Runs to win 5, plus 1 for Thursday's missed one-off, carried over as a pinch hitter.
    expect(game).toMatchObject({ status: 'live', starterName: 'Friday Finisher', threshold: 6, runs: 3, editPolicy: 'additions_only' });
    expect(game.lockedAt).not.toBeNull();
    expect(game.entries.find((e) => e.taskName === 'Renew passport')).toMatchObject({
      role: 'lineup',
      required: true,
      carriedOver: true,
      completedAt: null,
    });
    expect(game.entries.find((e) => e.taskName === 'Renew passport')?.pinchHitAt).not.toBeNull();
    const projection = project(game);
    expect(projection).toMatchObject({ runsNeeded: 3, missedRequired: 2, result: 'L' });

    const series = today.series!;
    const byNumber = (n: number) => series.games.find((g) => g.gameNumber === n)!;
    expect(byNumber(1)).toMatchObject({ result: 'W', resultDetail: 'clean' });
    expect(byNumber(2)).toMatchObject({ result: 'L', resultDetail: 'forfeit' });
    expect(byNumber(3)).toMatchObject({ postponed: true, playedDate: '2026-10-03', slot: 2, status: 'scheduled' });
    expect(byNumber(4)).toMatchObject({ result: 'W', resultDetail: 'rally' });
    expect(seriesStatus(series.games).label).toBe('Leads 2–1');

    const thursday = await api.call('getGame', { params: { gameId: byNumber(4).id } });
    // Short and the one-off missed: 20 − 5 (missed must-hit) = 15%.
    expect(thursday.rally).toMatchObject({ hit: true, roll: 7, oddsPct: 15 });
    expect(thursday).toMatchObject({ threshold: 4, missedRequired: 1 });

    // Saturday's bench bat was promoted after the week locked: runs to win 4 → 5.
    const saturday = await api.call('getGame', { params: { gameId: byNumber(6).id } });
    expect(saturday.threshold).toBe(5);
    expect(saturday.entries.find((e) => e.taskName === 'Practice Spanish')).toMatchObject({ role: 'lineup', required: true });

    const tasks = (await api.call('listTasks')).tasks;
    expect(tasks.filter((t) => t.status === 'active')).toHaveLength(9);
    expect(tasks.find((t) => t.kind === 'one_off')).toMatchObject({ name: 'Renew passport', status: 'active', carryover: true });
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
    const passport = game.entries.find((e) => e.taskName === 'Renew passport')!;

    await api.call('completeEntry', {
      params: { gameId: game.id, entryId: passport.id },
      body: { clientAt: backend.now().toISOString() },
    });
    const after = await api.call('completeEntry', {
      params: { gameId: game.id, entryId: deepWork.id },
      body: { clientAt: backend.now().toISOString() },
    });
    expect(after.runs).toBe(7);
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
    expect(final).toMatchObject({ status: 'final', result: 'W', resultDetail: 'clean', runs: 7 });
    // The one-off was done in a game that went final, so it retires.
    expect((await api.call('listTasks')).tasks.find((t) => t.name === 'Renew passport')).toMatchObject({ status: 'retired', carryover: false });
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

  it('plans next week freely, then rejects edits once the week’s first pitch passes', async () => {
    const { api, tick } = setup('midseason');
    const weeks = (await api.call('listWeeks')).weeks;
    expect(weeks).toEqual([
      { startDate: '2026-09-28', label: 'current', locked: true },
      { startDate: '2026-10-05', label: 'next', locked: false },
    ]);
    const week = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    expect(week).toMatchObject({ locked: false, lockedAt: null, startDate: '2026-10-05', endDate: '2026-10-11' });
    expect(week.games).toHaveLength(7);
    expect(week.games.every((g) => g.entries.length > 0 && g.editPolicy === 'free')).toBe(true);

    const wednesday = week.games[2]!;
    const lineup = wednesday.entries.filter((e) => e.role === 'lineup');
    const reordered = [...lineup].reverse().map((e, i) => ({ taskId: e.taskId, position: i + 1, required: e.required, role: 'lineup' as const }));
    const patched = await api.call('patchLineup', {
      params: { gameId: wednesday.id },
      body: { threshold: 3, entries: reordered },
    });
    expect(patched.threshold).toBe(3);
    expect(patched.entries.filter((e) => e.role === 'lineup').map((e) => e.taskId)).toEqual(reordered.map((e) => e.taskId));
    expect(patched.entries.filter((e) => e.role === 'bench')).toHaveLength(0);

    // Monday's first pitch is 9:00 AM: from then on the whole week only grows.
    tick(2 * DAY + 14 * 60 * 60 * 1000 + 25 * 60 * 1000); // Monday 09:05
    const locked = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    expect(locked.locked).toBe(true);
    expect(locked.lockedAt).toBe('2026-10-05T14:00:00.000Z');
    expect(locked.games.find((g) => g.id === wednesday.id)?.editPolicy).toBe('additions_only');
    await expectApiError(
      api.call('patchLineup', { params: { gameId: wednesday.id }, body: { threshold: 1 } }),
      'GAME_LOCKED',
      'WEEK_LOCKED',
    );
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

  it('adds any roster task to today’s bench, even after first pitch', async () => {
    const { api } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    const task = await api.call('createTask', { body: { name: 'Yoga', points: 2 } });
    const after = await api.call('addToBench', { params: { gameId: game.id }, body: { taskId: task.id } });
    expect(after.entries.find((e) => e.taskId === task.id)).toMatchObject({ role: 'bench', required: false, points: 2 });
    expect(after.runs).toBe(game.runs);
    await expectApiError(api.call('addToBench', { params: { gameId: game.id }, body: { taskId: task.id } }), 'CONFLICT', 'ALREADY_IN_GAME');
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

const HOUR = 60 * 60 * 1000;

describe('mock backend pinch hitters and one-offs', () => {
  it('raises runs to win by exactly the pinch hitter’s runs, mid-game', async () => {
    const { api } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    expect(game).toMatchObject({ threshold: 6, runs: 3, editPolicy: 'additions_only' });
    expect(scoreline({ result: null, runs: game.runs, threshold: game.threshold }).them).toBe(5);

    const yoga = await api.call('createTask', { body: { name: 'Yoga', points: 2 } });
    const after = await api.call('addPinchHitter', { params: { gameId: game.id }, body: { taskId: yoga.id } });
    expect(after.threshold).toBe(8);
    expect(after.runs).toBe(3);
    const entry = after.entries.find((e) => e.taskId === yoga.id)!;
    expect(entry).toMatchObject({ role: 'lineup', required: true, carriedOver: false, points: 2 });
    expect(entry.pinchHitAt).not.toBeNull();
    expect(entry.position).toBe(after.entries.filter((e) => e.role === 'lineup').length);
    // The opponent answers back with the same number of runs.
    expect(scoreline({ result: null, runs: after.runs, threshold: after.threshold }).them).toBe(7);

    // Promoting a bench task to must-hit is the same rule.
    const spanish = after.entries.find((e) => e.role === 'bench' && e.taskName === 'Practice Spanish')!;
    const promoted = await api.call('addPinchHitter', { params: { gameId: game.id }, body: { taskId: spanish.taskId } });
    expect(promoted.threshold).toBe(9);
    expect(promoted.entries.find((e) => e.id === spanish.id)).toMatchObject({ role: 'lineup', required: true });
    expect(promoted.entries.filter((e) => e.role === 'bench').map((e) => e.position)).toEqual([1]);

    // A lineup task that isn't a must-hit just becomes one: its runs were already
    // available, so runs to win (and the cushion) stay put.
    const inbox = game.entries.find((e) => e.taskName === 'Inbox zero')!;
    expect(inbox).toMatchObject({ role: 'lineup', required: false });
    const required = await api.call('addPinchHitter', { params: { gameId: game.id }, body: { taskId: inbox.taskId } });
    expect(required.threshold).toBe(9);
    expect(required.entries.find((e) => e.id === inbox.id)).toMatchObject({ required: true, pinchHitAt: null });
    await expectApiError(
      api.call('addPinchHitter', { params: { gameId: game.id }, body: { taskId: inbox.taskId } }),
      'CONFLICT',
      'ALREADY_REQUIRED',
    );
    const thursday = (await api.call('getToday')).series!.games.find((g) => g.gameNumber === 4)!;
    await expectApiError(api.call('addPinchHitter', { params: { gameId: thursday.id }, body: { taskId: yoga.id } }), 'GAME_FINAL');
    // Lowering the bar isn't possible once the week is locked.
    await expectApiError(api.call('patchLineup', { params: { gameId: game.id }, body: { threshold: 1 } }), 'GAME_LOCKED', 'WEEK_LOCKED');
  });

  it('pinch hits on a later day of a locked week and adds to its bench', async () => {
    const { api } = setup('midseason');
    const week = await api.call('getWeek', { params: { startDate: '2026-09-28' } });
    expect(week.locked).toBe(true);
    const sunday = week.games.find((g) => g.playedDate === '2026-10-04')!;
    expect(sunday).toMatchObject({ threshold: 3, editPolicy: 'additions_only' });
    const deep = sunday.entries.find((e) => e.taskName === 'Deep work block');
    expect(deep).toBeUndefined();
    const deepWork = (await api.call('listTasks')).tasks.find((t) => t.name === 'Deep work block')!;
    const after = await api.call('addPinchHitter', { params: { gameId: sunday.id }, body: { taskId: deepWork.id } });
    expect(after.threshold).toBe(6);
    const walk = (await api.call('listTasks')).tasks.find((t) => t.name === '10-minute tidy')!;
    await expectApiError(api.call('addToBench', { params: { gameId: sunday.id }, body: { taskId: walk.id } }), 'CONFLICT', 'ALREADY_IN_GAME');
  });

  it('carries a missed one-off must-hit to the next game as a pinch hitter, until it’s done', async () => {
    const { api, tick } = setup('midseason');
    // Friday goes final without the passport renewed.
    tick(6 * HOUR + 20 * 60 * 1000); // Saturday 01:00
    const today = await api.call('getToday');
    const friday = today.series!.games.find((g) => g.gameNumber === 5)!;
    expect(friday).toMatchObject({ status: 'final', result: 'L', resultDetail: 'no_appeal' });
    const saturday = today.games.find((g) => g.slot === 1)!;
    expect(saturday.threshold).toBe(6); // 4 + Spanish (pinch hit Thursday) + the passport
    const carried = saturday.entries.find((e) => e.taskName === 'Renew passport')!;
    expect(carried).toMatchObject({ role: 'lineup', required: true, carriedOver: true, points: 1 });
    // Not on the makeup game too.
    expect(today.games.find((g) => g.slot === 2)!.entries.some((e) => e.taskName === 'Renew passport')).toBe(false);
    const task = (await api.call('listTasks')).tasks.find((t) => t.name === 'Renew passport')!;
    expect(task).toMatchObject({ status: 'active', kind: 'one_off', carryover: true });
  });

  it('retires a one-off that was done, and doesn’t move a missed one-off that wasn’t a must-hit', async () => {
    const { api, backend, tick } = setup('midseason');
    const game = (await api.call('getToday')).games[0]!;
    const chores = await api.call('createTask', { body: { name: 'Pick up dry cleaning', kind: 'one_off' } });
    expect(chores).toMatchObject({ kind: 'one_off', carryover: false });
    const benched = await api.call('addToBench', { params: { gameId: game.id }, body: { taskId: chores.id } });
    const read = benched.entries.find((e) => e.taskName === 'Read 20 pages')!;
    const sub = benched.entries.find((e) => e.taskId === chores.id)!;
    await api.call('substitute', { params: { gameId: game.id }, body: { outEntryId: read.id, inEntryId: sub.id } });
    const passport = game.entries.find((e) => e.taskName === 'Renew passport')!;
    await api.call('completeEntry', { params: { gameId: game.id, entryId: passport.id }, body: { clientAt: backend.now().toISOString() } });
    tick(6 * HOUR + 20 * 60 * 1000);
    const tasks = (await api.call('listTasks')).tasks;
    expect(tasks.find((t) => t.id === chores.id)).toMatchObject({ status: 'active', carryover: false });
    expect(tasks.find((t) => t.name === 'Renew passport')).toMatchObject({ status: 'retired', carryover: false });
    const saturday = (await api.call('getToday')).games[0]!;
    expect(saturday.entries.some((e) => e.taskId === chores.id)).toBe(false);
  });

  it('the Injured List removes a task from later lineups without lowering runs to win', async () => {
    const { api } = setup('midseason');
    const before = await api.call('getWeek', { params: { startDate: '2026-09-28' } });
    const thresholds = before.games.map((g) => g.threshold);
    const mealPrep = (await api.call('listTasks')).tasks.find((t) => t.name === 'Meal prep')!;
    const sunday = before.games.find((g) => g.playedDate === '2026-10-04')!;
    expect(sunday.entries.find((e) => e.taskId === mealPrep.id)).toMatchObject({ required: true });

    await api.call('placeOnInjuredList', { params: { taskId: mealPrep.id } });
    const after = await api.call('getWeek', { params: { startDate: '2026-09-28' } });
    expect(after.games.map((g) => g.threshold)).toEqual(thresholds);
    for (const g of after.games.filter((g) => g.playedDate > '2026-10-02')) {
      expect(g.entries.some((e) => e.taskId === mealPrep.id)).toBe(false);
    }
  });

  it('before the week locks, the Injured List takes a task off the whole card', async () => {
    const { api } = setup('midseason');
    const next = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    const workout = (await api.call('listTasks')).tasks.find((t) => t.name === 'Morning workout')!;
    expect(next.games[0]!.entries.some((e) => e.taskId === workout.id)).toBe(true);
    // It's in today's started game: it still plays today and leaves from tomorrow.
    const placed = await api.call('placeOnInjuredList', { params: { taskId: workout.id } });
    expect(placed.task.ilStartedOn).toBe('2026-10-03');
    expect((await api.call('getToday')).games[0]!.entries.some((e) => e.taskId === workout.id)).toBe(true);
    const reading = (await api.call('listTasks')).tasks.find((t) => t.name === 'Meal prep')!;
    await api.call('placeOnInjuredList', { params: { taskId: reading.id } });
    const after = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    expect(after.games.some((g) => g.entries.some((e) => e.taskId === reading.id))).toBe(false);
    expect(after.games.map((g) => g.threshold)).toEqual(next.games.map((g) => g.threshold));
    // Every day it left is holding its spot, and positions stay 1, 2, 3.
    for (const g of after.games) {
      const had = next.games.find((n) => n.id === g.id)!.entries.find((e) => e.taskId === reading.id);
      expect(g.ilHolds.some((h) => h.taskId === reading.id)).toBe(Boolean(had));
      const order = g.entries.filter((e) => e.role === 'lineup').map((e) => e.position);
      expect(order).toEqual(order.map((_, i) => i + 1));
    }
  });

  it('activation puts the task back in every held spot, runs to win untouched', async () => {
    const { api, tick } = setup('midseason');
    const next = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    const prep = (await api.call('listTasks')).tasks.find((t) => t.name === 'Meal prep')!;
    const placed = await api.call('placeOnInjuredList', { params: { taskId: prep.id } });
    // Cancelling a stint is allowed only once it hasn't started; this one started today.
    await expectApiError(api.call('activateFromInjuredList', { params: { taskId: prep.id } }), 'IL_MINIMUM');
    while ((await api.call('getMe')).today < placed.task.ilMinUntil!) tick(DAY);
    const today = (await api.call('getMe')).today;
    const justBefore = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    await api.call('activateFromInjuredList', { params: { taskId: prep.id } });
    const after = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    for (const g of after.games) {
      const before = justBefore.games.find((n) => n.id === g.id)!;
      const had = next.games.find((n) => n.id === g.id)!.entries.find((e) => e.taskId === prep.id);
      const back = g.entries.find((e) => e.taskId === prep.id);
      if (had && g.playedDate > today && g.status !== 'final') {
        expect(back).toMatchObject({ role: had.role, position: had.position, required: had.required, points: had.points });
      }
      expect(g.threshold).toBe(before.threshold);
      expect(g.ilHolds.filter((h) => h.taskId === prep.id)).toEqual([]);
    }
  });

  it('a day re-planned while the task is out keeps its plan', async () => {
    const { api } = setup('midseason');
    const prep = (await api.call('listTasks')).tasks.find((t) => t.name === 'Meal prep')!;
    await api.call('placeOnInjuredList', { params: { taskId: prep.id } });
    const card = await api.call('getWeek', { params: { startDate: '2026-10-05' } });
    const held = card.games.find((g) => g.ilHolds.length > 0)!;
    const kept = held.entries.filter((e) => e.role !== 'subbed_out');
    const patched = await api.call('patchLineup', {
      params: { gameId: held.id },
      body: { entries: kept.map((e) => ({ taskId: e.taskId, position: e.position, required: e.required, role: e.role === 'bench' ? ('bench' as const) : ('lineup' as const) })) },
    });
    expect(patched.ilHolds).toEqual([]);
  });
});

describe('mock backend suspended games', () => {
  it('suspends today’s game to resume later in the week as a doubleheader, keeping progress', async () => {
    const { api, tick } = setup('midseason');
    const before = await api.call('getMe');
    const game = (await api.call('getToday')).games[0]!;
    const quote = await api.call('getSuspensionQuote', { params: { gameId: game.id } });
    // Saturday already hosts the Wednesday makeup, so Sunday is the only day left.
    expect(quote).toMatchObject({ ok: true, reason: null, resumeDates: ['2026-10-04'], allowancesAvailable: before.allowances.rainouts });
    expect(quote.deadline).toBe('2026-10-03T17:00:00.000Z');

    await expectApiError(api.call('suspendGame', { params: { gameId: game.id }, body: { resumeDate: null } }), 'INVALID_MAKEUP_DATE');
    await expectApiError(
      api.call('suspendGame', { params: { gameId: game.id }, body: { resumeDate: '2026-10-03' } }),
      'INVALID_MAKEUP_DATE',
    );
    const series = await api.call('suspendGame', { params: { gameId: game.id }, body: { resumeDate: '2026-10-04' } });
    expect(series.games.find((g) => g.id === game.id)).toMatchObject({
      suspended: true,
      playedDate: '2026-10-04',
      slot: 2,
      status: 'live',
      runs: 3,
      threshold: 6,
      result: null,
    });
    expect((await api.call('getMe')).allowances.rainouts).toBe(before.allowances.rainouts - 1);
    expect((await api.call('getToday')).games).toHaveLength(0);

    // A game that already moved can't move again: on Sunday it can only end as a no-decision.
    expect(await api.call('getSuspensionQuote', { params: { gameId: game.id } })).toMatchObject({ ok: false, reason: 'FUTURE_GAME' });
    tick(DAY + 15 * HOUR + 20 * 60 * 1000); // Sunday 10:00
    const again = await api.call('getSuspensionQuote', { params: { gameId: game.id } });
    expect(again).toMatchObject({ ok: true, resumeDates: [] });
    const nd = await api.call('suspendGame', { params: { gameId: game.id }, body: { resumeDate: null } });
    expect(nd.games.find((g) => g.id === game.id)).toMatchObject({ status: 'final', result: null, resultDetail: 'suspended', runs: 3 });
    const status = seriesStatus(nd.games.map((g) => ({ ...g, noDecision: g.resultDetail === 'suspended' })));
    // Saturday's doubleheader went final unplayed: two Ls.
    expect(status).toMatchObject({ noDecisions: 1, wins: 2, losses: 3 });
    expect((await api.call('getCurrentSeason'))!.noDecisions).toBe(1);
    expect(await api.call('getSuspensionQuote', { params: { gameId: game.id } })).toMatchObject({ ok: false, reason: 'NO_DECISION' });
    // The missed one-off still carries over from a no-decision.
    expect((await api.call('listTasks')).tasks.find((t) => t.name === 'Renew passport')?.carryover).toBe(true);
  });

  it('called the next morning, it reopens a final L and undoes its effects', async () => {
    const { api, tick } = setup('midseason');
    tick(13 * HOUR + 20 * 60 * 1000); // Saturday 08:00
    let today = await api.call('getToday');
    const friday = today.series!.games.find((g) => g.gameNumber === 5)!;
    expect(friday).toMatchObject({ status: 'final', result: 'L' });
    expect(today.games[0]!.threshold).toBe(6);

    const quote = await api.call('getSuspensionQuote', { params: { gameId: friday.id } });
    expect(quote).toMatchObject({ ok: true, resumeDates: ['2026-10-04'] });
    await api.call('suspendGame', { params: { gameId: friday.id }, body: { resumeDate: '2026-10-04' } });
    const reopened = await api.call('getGame', { params: { gameId: friday.id } });
    expect(reopened).toMatchObject({ status: 'live', result: null, resultDetail: null, playedDate: '2026-10-04', slot: 2, suspended: true, rallyDeadline: null });
    expect(reopened.entries.filter((e) => e.completedAt !== null)).toHaveLength(2);
    // The carried-over one-off left Saturday's game (it's still in Friday's), and the bar went back.
    today = await api.call('getToday');
    expect(today.games[0]!.threshold).toBe(5);
    expect(today.games[0]!.entries.some((e) => e.taskName === 'Renew passport')).toBe(false);
    expect((await api.call('listTasks')).tasks.find((t) => t.name === 'Renew passport')?.carryover).toBe(true);
  });

  it('isn’t offered after a Rally Cap roll, on a W, or after the noon window', async () => {
    const { api } = setup('midseason');
    const games = (await api.call('getCurrentSeries'))!.games;
    const byNumber = (n: number) => games.find((g) => g.gameNumber === n)!;
    expect(await api.call('getSuspensionQuote', { params: { gameId: byNumber(1).id } })).toMatchObject({ ok: false, reason: 'GAME_WON' });
    expect(await api.call('getSuspensionQuote', { params: { gameId: byNumber(2).id } })).toMatchObject({ ok: false, reason: 'WINDOW_CLOSED' });
    expect(await api.call('getSuspensionQuote', { params: { gameId: byNumber(7).id } })).toMatchObject({ ok: false, reason: 'FUTURE_GAME' });

    const rally = setup('rally');
    const thursday = (await rally.api.call('getCurrentSeries'))!.games.find((g) => g.gameNumber === 4)!;
    expect(await rally.api.call('getSuspensionQuote', { params: { gameId: thursday.id } })).toMatchObject({ ok: true });
    const roll = await rally.api.call('rollRally', { params: { gameId: thursday.id }, headers: { 'Idempotency-Key': 'k' } });
    const after = await rally.api.call('getSuspensionQuote', { params: { gameId: thursday.id } });
    expect(after).toMatchObject({ ok: false, reason: roll.roll.hit ? 'GAME_WON' : 'RALLY_ROLLED' });
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
