import { describe, expect, it } from 'vitest';
import {
  buildLineup,
  effectiveLockedAt,
  finalizeAfter,
  generateOpponent,
  generateLeague,
  LEAGUE_SIZE,
  leagueSeedFor,
  leagueYear,
  OPPONENT_TOWNS,
  opponentAbbreviation,
  scheduledOpponent,
  SERIES_PER_SEASON,
  hashSeed,
  rainoutOptions,
  starterWarnings,
  lateCheckoffDeadline,
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
    // Final: a check-off stamped before midnight still counts until noon the next day
    // (17:00Z in Chicago), when the game is re-scored; after that it's too late.
    const late = { ...base, gameStatus: 'final' as const, clientAt: new Date('2026-10-05T20:00:00Z') };
    expect(lateCheckoffDeadline('2026-10-05', tz).toISOString()).toBe('2026-10-06T17:00:00.000Z');
    expect(validateCheckoff({ ...late, receivedAt: new Date('2026-10-06T16:59:00Z') })).toEqual({ ok: true });
    expect(validateCheckoff({ ...late, receivedAt: new Date('2026-10-06T17:00:00Z') })).toEqual({
      ok: false,
      reason: 'GAME_FINAL',
    });
    expect(validateCheckoff({ ...late, clientAt: new Date('2026-10-06T05:10:00Z'), receivedAt: new Date('2026-10-06T08:00:00Z') })).toEqual({
      ok: false,
      reason: 'AFTER_MIDNIGHT',
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

  it('builds a badge abbreviation of up to three letters, from the name', () => {
    const opp = generateOpponent(hashSeed('x'));
    expect(opp.abbreviation).toMatch(/^[A-ZÑ]{1,3}$/);
    expect(opponentAbbreviation('Litchfield Last Minutemen')).toBe('LLM');
    expect(opponentAbbreviation('Pontiac Procrastinators')).toBe('PP');
    expect(opponentAbbreviation('Lake Placid Johnny-Come-Latelies')).toBe('LPJ');
    // Older names, from before towns, still work.
    expect(opponentAbbreviation('Snooze City Alarms')).toBe('SCA');
  });

  it('pairs a real town with a nickname that starts with the same letter', () => {
    for (let i = 0; i < 200; i++) {
      const opp = generateOpponent(hashSeed(`user-2:1:${i}`));
      expect(opp.name).toBe(`${opp.city} ${opp.mascot}`);
      expect(opp.mascot[0]).toBe(opp.city[0]);
    }
    expect(new Set(OPPONENT_TOWNS).size).toBe(OPPONENT_TOWNS.length);
  });
});

describe('leagues', () => {
  const seeds = [leagueSeedFor('user-a'), leagueSeedFor('user-b'), leagueSeedFor('user-c')];

  it('gives each player 29 teams: different towns, different nicknames, same first letter', () => {
    for (const seed of seeds) {
      const league = generateLeague(seed);
      expect(league).toHaveLength(LEAGUE_SIZE);
      expect(new Set(league.map((t) => t.city)).size).toBe(LEAGUE_SIZE);
      expect(new Set(league.map((t) => t.mascot)).size).toBe(LEAGUE_SIZE);
      expect(new Set(league.map((t) => t.colors.join())).size).toBe(LEAGUE_SIZE);
      for (const t of league) expect(t.mascot[0]).toBe(t.city[0]);
      expect(generateLeague(seed)).toEqual(league);
    }
    expect(generateLeague(seeds[0]!).map((t) => t.name)).not.toEqual(generateLeague(seeds[1]!).map((t) => t.name));
  });

  it('plays rivals every season, regulars every other season, everyone else once a year', () => {
    for (const seed of seeds) {
      for (const year of [0, 1, 2]) {
        const tiers = leagueYear(seed, year);
        const seasons = [1, 2, 3, 4].map((n) =>
          Array.from({ length: SERIES_PER_SEASON }, (_, i) => scheduledOpponent(seed, year * 4 + n, i + 1).slot),
        );
        const all = seasons.flat();
        expect(all).toHaveLength(48);
        const times = (slot: number) => all.filter((x) => x === slot).length;
        expect(new Set(all).size).toBe(LEAGUE_SIZE); // everyone at least once a year
        for (const slot of tiers.division) for (const season of seasons) expect(season).toContain(slot);
        for (const slot of tiers.regular) {
          expect(times(slot)).toBe(2);
          const inSeasons = seasons.map((s, i) => (s.includes(slot) ? i : -1)).filter((i) => i >= 0);
          expect(inSeasons[1]! - inSeasons[0]!).toBe(2); // every other season
        }
        for (const slot of tiers.rare) expect(times(slot)).toBe(1);
        for (const season of seasons) expect(new Set(season).size).toBe(SERIES_PER_SEASON);
      }
    }
  });

  it('never plays the same team two weeks running, across seasons and years', () => {
    for (const seed of seeds) {
      const run: number[] = [];
      for (let season = 1; season <= 12; season++) {
        for (let n = 1; n <= SERIES_PER_SEASON; n++) run.push(scheduledOpponent(seed, season, n).slot);
      }
      for (let i = 1; i < run.length; i++) expect(run[i]).not.toBe(run[i - 1]);
    }
  });

  it('deals new divisions every year', () => {
    const seed = seeds[0]!;
    const divisions = [0, 1, 2, 3].map((y) => [...leagueYear(seed, y).division].sort().join());
    expect(new Set(divisions).size).toBeGreaterThan(1);
  });

  it('gives a Head Start a once-a-year team that isn’t Series 1’s', () => {
    for (const seed of seeds) {
      const head = scheduledOpponent(seed, 1, 0);
      expect(head.tier).toBe('rare');
      expect(head.slot).not.toBe(scheduledOpponent(seed, 1, 1).slot);
    }
  });
});
