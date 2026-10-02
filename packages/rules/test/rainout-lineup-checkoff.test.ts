import { describe, expect, it } from 'vitest';
import {
  buildLineup,
  effectiveLockedAt,
  finalizeAfter,
  generateOpponent,
  hashSeed,
  rainoutOptions,
  starterWarnings,
  validateCheckoff,
  type RainoutGame,
} from '../src';

// Series of 2026-10-05 (Mon) … 2026-10-11 (Sun).
function week(): RainoutGame[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = `2026-10-${String(5 + i).padStart(2, '0')}`;
    return { id: `g${i + 1}`, scheduledDate: date, playedDate: date, postponed: false, status: 'scheduled', lockedAt: null };
  });
}

describe('rainouts', () => {
  it('offers every later day in the series as a makeup date', () => {
    const games = week();
    const options = rainoutOptions({ game: games[0]!, seriesGames: games, allowancesAvailable: 2, today: '2026-10-05' });
    expect(options).toEqual({
      ok: true,
      makeupDates: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
    });
  });

  it('skips days that already host a makeup game', () => {
    const games = week();
    games[0] = { ...games[0]!, postponed: true, playedDate: '2026-10-07' };
    const options = rainoutOptions({ game: games[1]!, seriesGames: games, allowancesAvailable: 1, today: '2026-10-06' });
    expect(options.ok && options.makeupDates).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('can be called ahead of time for a future game', () => {
    const games = week();
    const options = rainoutOptions({ game: games[4]!, seriesGames: games, allowancesAvailable: 1, today: '2026-10-05' });
    expect(options.ok && options.makeupDates).toEqual(['2026-10-10', '2026-10-11']);
  });

  it.each([
    ['SUNDAY', (g: RainoutGame[]) => g[6]!, {}],
    ['GAME_LOCKED', (g: RainoutGame[]) => ({ ...g[0]!, lockedAt: '2026-10-05T14:00:00Z' }), {}],
    ['GAME_FINAL', (g: RainoutGame[]) => ({ ...g[0]!, status: 'final' as const }), {}],
    ['MAKEUP_GAME', (g: RainoutGame[]) => ({ ...g[0]!, postponed: true }), {}],
    ['PAST_GAME', (g: RainoutGame[]) => g[0]!, { today: '2026-10-06' }],
    ['NO_ALLOWANCE', (g: RainoutGame[]) => g[0]!, { allowancesAvailable: 0 }],
  ])('rejects with %s', (reason, choose, patch) => {
    const games = week();
    const options = rainoutOptions({
      game: choose(games),
      seriesGames: games,
      allowancesAvailable: 2,
      today: '2026-10-05',
      ...patch,
    });
    expect(options).toEqual({ ok: false, reason });
  });

  it('runs out of makeup dates when every later day already hosts one', () => {
    const games = week();
    games[3] = { ...games[3]!, postponed: true, playedDate: '2026-10-10' };
    games[4] = { ...games[4]!, postponed: true, playedDate: '2026-10-11' };
    const options = rainoutOptions({ game: games[5]!, seriesGames: games, allowancesAvailable: 1, today: '2026-10-05' });
    expect(options).toEqual({ ok: false, reason: 'NO_MAKEUP_DATES' });
  });
});

describe('lineups', () => {
  const roster = [
    { id: 'gym', name: 'Gym', points: 2, status: 'active' as const },
    { id: 'read', name: 'Read', points: 1, status: 'active' as const },
    { id: 'hurt', name: 'Run', points: 1, status: 'injured' as const },
    { id: 'dishes', name: 'Dishes', points: 1, status: 'active' as const },
  ];

  it('snapshots active tasks in batting order and drops injured ones', () => {
    const lineup = buildLineup(
      [
        { taskId: 'read', position: 2, required: false, role: 'lineup' },
        { taskId: 'gym', position: 1, required: true, role: 'lineup' },
        { taskId: 'hurt', position: 3, required: true, role: 'lineup' },
        { taskId: 'dishes', position: 1, required: true, role: 'bench' },
      ],
      roster,
    );
    expect(lineup).toEqual([
      { taskId: 'gym', taskName: 'Gym', points: 2, required: true, position: 1, role: 'lineup' },
      { taskId: 'read', taskName: 'Read', points: 1, required: false, position: 2, role: 'lineup' },
      { taskId: 'dishes', taskName: 'Dishes', points: 1, required: false, position: 1, role: 'bench' },
    ]);
  });

  it('warns about starters that cannot be won', () => {
    expect(starterWarnings([], 1, null)).toEqual(['EMPTY_LINEUP']);
    expect(
      starterWarnings(
        [
          { taskId: 'a', points: 1, role: 'lineup' },
          { taskId: 'b', points: 5, role: 'bench' },
        ],
        3,
        2,
      ),
    ).toEqual(['THRESHOLD_UNREACHABLE', 'MIN_TASKS_UNREACHABLE']);
    expect(
      starterWarnings(
        [
          { taskId: 'a', points: 1, role: 'lineup' },
          { taskId: 'a', points: 1, role: 'bench' },
        ],
        1,
        null,
      ),
    ).toEqual(['DUPLICATE_TASK']);
  });
});

describe('check-offs and locking', () => {
  const tz = 'America/Chicago';
  const base = {
    playedDate: '2026-10-05',
    timeZone: tz,
    gameStatus: 'live' as const,
    role: 'lineup' as const,
    receivedAt: new Date('2026-10-06T05:10:00Z'),
  };

  it('accepts a check-off made before local midnight even if it arrives after', () => {
    expect(validateCheckoff({ ...base, clientAt: new Date('2026-10-06T04:59:00Z') })).toEqual({ ok: true });
  });

  it('rejects check-offs after midnight, before the day, ahead of the server, or on final games', () => {
    expect(validateCheckoff({ ...base, clientAt: new Date('2026-10-06T05:00:00Z') })).toEqual({
      ok: false,
      reason: 'AFTER_MIDNIGHT',
    });
    expect(validateCheckoff({ ...base, clientAt: new Date('2026-10-05T04:59:00Z') })).toEqual({
      ok: false,
      reason: 'BEFORE_GAME_DAY',
    });
    expect(
      validateCheckoff({ ...base, clientAt: new Date('2026-10-05T20:00:00Z'), receivedAt: new Date('2026-10-05T19:00:00Z') }),
    ).toEqual({ ok: false, reason: 'CLIENT_CLOCK_AHEAD' });
    expect(validateCheckoff({ ...base, gameStatus: 'final', clientAt: new Date('2026-10-05T20:00:00Z') })).toEqual({
      ok: false,
      reason: 'GAME_FINAL',
    });
    expect(validateCheckoff({ ...base, role: 'bench', clientAt: new Date('2026-10-05T20:00:00Z') })).toEqual({
      ok: false,
      reason: 'NOT_IN_LINEUP',
    });
  });

  it('finalizes 30 minutes after local midnight', () => {
    expect(finalizeAfter('2026-10-05', tz).toISOString()).toBe('2026-10-06T05:30:00.000Z');
  });

  it('locks at the earlier of the first check-off and the scheduled lock time', () => {
    const lockAt = (lockedAt: Date | null, now: string) =>
      effectiveLockedAt({ lockedAt, playedDate: '2026-10-05', lockTime: '09:00', timeZone: tz, now: new Date(now) })?.toISOString() ??
      null;
    expect(lockAt(null, '2026-10-05T13:59:00Z')).toBeNull();
    expect(lockAt(null, '2026-10-05T14:00:00Z')).toBe('2026-10-05T14:00:00.000Z');
    expect(lockAt(new Date('2026-10-05T12:00:00Z'), '2026-10-05T15:00:00Z')).toBe('2026-10-05T12:00:00.000Z');
    expect(
      effectiveLockedAt({ lockedAt: null, playedDate: '2026-10-05', lockTime: null, timeZone: tz, now: new Date('2026-10-06T04:00:00Z') }),
    ).toBeNull();
  });
});

describe('opponents', () => {
  it('is deterministic per seed', () => {
    const seed = hashSeed('user-1:1:1');
    expect(generateOpponent(seed)).toEqual(generateOpponent(seed));
    expect(generateOpponent(seed).name).toMatch(/^\S.+ \S+$/);
  });

  it('varies across series', () => {
    const names = new Set(Array.from({ length: 25 }, (_, i) => generateOpponent(hashSeed(`user-1:1:${i + 1}`)).name));
    expect(names.size).toBeGreaterThan(15);
  });

  it('builds a badge abbreviation of up to three letters', () => {
    const opp = generateOpponent(hashSeed('x'));
    expect(opp.abbreviation).toMatch(/^[A-ZÑ]{1,3}$/);
  });
});
