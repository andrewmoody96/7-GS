import { describe, expect, it } from 'vitest';
import {
  isIronMan,
  lineupEditPolicy,
  nextGameDate,
  pinchHitThreshold,
  plannableWeeks,
  seasonWindow,
  seriesStatus,
  suspensionOptions,
  weekLockedAt,
  type SuspensionGame,
} from '../src';

const TZ = 'America/Chicago';
const SIGNUP = '2026-10-02'; // Friday; Opening Day Monday 2026-10-05

describe('weekly lineup card', () => {
  it('opens Opening Week during Spring Training', () => {
    expect(plannableWeeks(SIGNUP, '2026-10-02')).toEqual(['2026-10-05']);
  });

  it('opens next week from Friday on', () => {
    expect(plannableWeeks(SIGNUP, '2026-10-08')).toEqual(['2026-10-05']); // Thursday
    expect(plannableWeeks(SIGNUP, '2026-10-09')).toEqual(['2026-10-05', '2026-10-12']); // Friday
    expect(plannableWeeks(SIGNUP, '2026-10-11')).toEqual(['2026-10-05', '2026-10-12']); // Sunday
  });

  it('opens next season’s first week from Friday of Review Week, not the week before', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    const lastFriday = '2027-03-26';
    expect(plannableWeeks(SIGNUP, lastFriday)).toEqual(['2027-03-22']); // next week is Review Week
    const reviewFriday = '2027-04-02';
    expect(s1.offseasonStart <= reviewFriday && reviewFriday <= s1.offseasonEnd).toBe(true);
    expect(plannableWeeks(SIGNUP, reviewFriday)).toEqual([seasonWindow(SIGNUP, 2).start]);
    expect(plannableWeeks(SIGNUP, '2027-03-30')).toEqual([]); // Review Week Tuesday
  });

  it('locks the week at its first first pitch', () => {
    const games = [
      { playedDate: '2026-10-05', lockedAt: null, lockTime: '09:00' },
      { playedDate: '2026-10-06', lockedAt: null, lockTime: null },
    ];
    expect(weekLockedAt(games, TZ, new Date('2026-10-05T13:00:00Z'))).toBeNull();
    expect(weekLockedAt(games, TZ, new Date('2026-10-05T15:00:00Z'))?.toISOString()).toBe('2026-10-05T14:00:00.000Z');
    const checkedOffEarly = [{ ...games[0]!, lockedAt: new Date('2026-10-05T12:00:00Z') }, games[1]!];
    expect(weekLockedAt(checkedOffEarly, TZ, new Date('2026-10-05T12:30:00Z'))?.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('only allows additions after the week locks', () => {
    expect(lineupEditPolicy({ weekLocked: false, gameFinal: false, dayOver: false })).toBe('free');
    expect(lineupEditPolicy({ weekLocked: true, gameFinal: false, dayOver: false })).toBe('additions_only');
    expect(lineupEditPolicy({ weekLocked: true, gameFinal: true, dayOver: false })).toBe('closed');
    expect(lineupEditPolicy({ weekLocked: false, gameFinal: false, dayOver: true })).toBe('closed');
  });

  it('raises runs to win by exactly a pinch hitter’s runs', () => {
    expect(pinchHitThreshold(4, 2)).toBe(6);
  });

  it('carries one-offs to the next game day, skipping Review Week', () => {
    expect(nextGameDate(SIGNUP, '2026-10-05')).toBe('2026-10-06');
    const s1 = seasonWindow(SIGNUP, 1);
    expect(nextGameDate(SIGNUP, s1.playEnd)).toBe(seasonWindow(SIGNUP, 2).start);
  });
});

function week(): SuspensionGame[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = `2026-10-${String(5 + i).padStart(2, '0')}`;
    return { id: `g${i + 1}`, scheduledDate: date, playedDate: date, status: 'scheduled', result: null, postponed: false };
  });
}

describe('suspended games', () => {
  const base = { allowancesAvailable: 1, rallyRolled: false, timeZone: TZ };

  it('suspends today’s live game and offers later days in the week', () => {
    const games = week();
    games[2] = { ...games[2]!, status: 'live' };
    const opts = suspensionOptions({ ...base, game: games[2]!, seriesGames: games, today: '2026-10-07', now: new Date('2026-10-07T20:00:00Z') });
    expect(opts).toMatchObject({ ok: true, resumeDates: ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'] });
  });

  it('can be called the next morning on a final L, resuming as early as today', () => {
    const games = week();
    games[2] = { ...games[2]!, status: 'final', result: 'L' };
    const opts = suspensionOptions({ ...base, game: games[2]!, seriesGames: games, today: '2026-10-08', now: new Date('2026-10-08T15:00:00Z') });
    expect(opts.ok && opts.resumeDates[0]).toBe('2026-10-08');
  });

  it('closes at noon the next day', () => {
    const games = week();
    games[2] = { ...games[2]!, status: 'final', result: 'L' };
    expect(
      suspensionOptions({ ...base, game: games[2]!, seriesGames: games, today: '2026-10-08', now: new Date('2026-10-08T17:00:00Z') }),
    ).toEqual({ ok: false, reason: 'WINDOW_CLOSED' });
  });

  it('ends as a no-decision when the week has no day left', () => {
    const games = week();
    const opts = suspensionOptions({ ...base, game: games[6]!, seriesGames: games, today: '2026-10-11', now: new Date('2026-10-11T20:00:00Z') });
    expect(opts).toMatchObject({ ok: true, resumeDates: [] });
    const makeup = { ...games[3]!, postponed: true };
    expect(
      suspensionOptions({ ...base, game: makeup, seriesGames: games, today: '2026-10-08', now: new Date('2026-10-08T20:00:00Z') }),
    ).toMatchObject({ ok: true, resumeDates: [] });
  });

  it.each([
    ['FUTURE_GAME', (g: SuspensionGame[]) => g[4]!, {}],
    ['GAME_WON', (g: SuspensionGame[]) => ({ ...g[2]!, status: 'final' as const, result: 'W' as const }), {}],
    ['NO_DECISION', (g: SuspensionGame[]) => ({ ...g[2]!, status: 'final' as const }), {}],
    ['RALLY_ROLLED', (g: SuspensionGame[]) => g[2]!, { rallyRolled: true }],
    ['NO_ALLOWANCE', (g: SuspensionGame[]) => g[2]!, { allowancesAvailable: 0 }],
  ])('rejects with %s', (reason, choose, patch) => {
    const games = week();
    expect(
      suspensionOptions({ ...base, game: choose(games), seriesGames: games, today: '2026-10-07', now: new Date('2026-10-07T20:00:00Z'), ...patch }),
    ).toEqual({ ok: false, reason });
  });
});

describe('series with no-decisions', () => {
  const g = (n: number, result: 'W' | 'L' | null, extra = {}) => ({ gameNumber: n, result, ...extra });

  it('completes with a no-decision and breaks a tie on run differential', () => {
    const games = [
      g(1, 'W', { runDiff: 3 }),
      g(2, 'L', { runDiff: -1 }),
      g(3, 'W', { runDiff: 1 }),
      g(4, 'L', { runDiff: -1 }),
      g(5, 'W', { runDiff: 2 }),
      g(6, 'L', { runDiff: -1 }),
      g(7, null, { noDecision: true }),
    ];
    expect(seriesStatus(games)).toMatchObject({ complete: true, wins: 3, losses: 3, noDecisions: 1, result: 'won', label: 'Won series 3–3' });
  });

  it('splits when tied on wins and run differential', () => {
    const games = [g(1, 'W', { runDiff: 1 }), g(2, 'L', { runDiff: -1 }), ...[3, 4, 5, 6, 7].map((n) => g(n, null, { noDecision: true }))];
    expect(seriesStatus(games)).toMatchObject({ complete: true, result: null, label: 'Series split 1–1' });
  });

  it('denies Iron Man when a game was suspended and resumed', () => {
    const games = [1, 2, 3, 4, 5, 6, 7].map((n) => g(n, 'W'));
    expect(isIronMan(games)).toBe(true);
    games[3] = { ...games[3]!, suspended: true } as (typeof games)[number];
    expect(isIronMan(games)).toBe(false);
  });

  it('denies Iron Man with a suspended game', () => {
    const games = [1, 2, 3, 4, 5, 6].map((n) => g(n, 'W')).concat([g(7, null, { noDecision: true })]);
    expect(isIronMan(games)).toBe(false);
  });
});
