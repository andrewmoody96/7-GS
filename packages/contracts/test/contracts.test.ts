import { generateOpponent, hashSeed, rallyOdds } from '@7gs/rules';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  buildPath,
  endpoints,
  Game,
  LineupPatch,
  Opponent,
  RallyOddsBreakdown,
  StarterPut,
  TaskCreate,
  type PathParams,
  type RequestBody,
  type ResponseBody,
} from '../src';

const uuid = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

describe('primitives and schemas', () => {
  it('defaults new tasks to 1 run and trims names', () => {
    expect(TaskCreate.parse({ name: '  Gym  ' })).toEqual({ name: 'Gym', points: 1 });
    expect(TaskCreate.safeParse({ name: '' }).success).toBe(false);
    expect(TaskCreate.safeParse({ name: 'x', points: 0 }).success).toBe(false);
  });

  it('requires a threshold of at least 1', () => {
    const starter = { name: 'Gym Day', threshold: 0, minTasks: null, lockTime: null, lineup: [], bench: [] };
    expect(StarterPut.safeParse(starter).success).toBe(false);
    expect(StarterPut.safeParse({ ...starter, threshold: 1 }).success).toBe(true);
  });

  it('validates times and dates', () => {
    const ok = { name: 'A', threshold: 1, minTasks: null, lockTime: '09:00', lineup: [], bench: [] };
    expect(StarterPut.safeParse(ok).success).toBe(true);
    expect(StarterPut.safeParse({ ...ok, lockTime: '24:00' }).success).toBe(false);
    expect(LineupPatch.safeParse({ threshold: 2 }).success).toBe(true);
  });

  it('accepts rules output where the contract embeds it', () => {
    const odds = rallyOdds({
      seasonWinStreak: 5,
      runs: 8,
      threshold: 5,
      tasksDone: 4,
      minTasks: null,
      missedRequired: 1,
      partialOnMissed: true,
    });
    expect(RallyOddsBreakdown.parse(odds)).toEqual(odds);
    const opp = generateOpponent(hashSeed('u:1:1'));
    expect(Opponent.parse({ seed: opp.seed, name: opp.name, colors: [...opp.colors] }).name).toBe(opp.name);
  });

  it('parses a full game payload', () => {
    const game = {
      id: uuid,
      seriesId: uuid,
      gameNumber: 1,
      scheduledDate: '2026-10-05',
      playedDate: '2026-10-05',
      slot: 1,
      postponed: false,
      starterName: 'Gym Day',
      threshold: 3,
      minTasks: null,
      status: 'live',
      runs: 1,
      tasksDone: 1,
      missedRequired: 0,
      result: null,
      resultDetail: null,
      lockTime: '09:00',
      lockedAt: '2026-10-05T14:00:00.000Z',
      rallyDeadline: null,
      finalizedAt: null,
      entries: [
        {
          id: uuid,
          taskId: uuid,
          taskName: 'Gym',
          points: 1,
          required: true,
          position: 1,
          role: 'lineup',
          subbedInAt: null,
          completedAt: '2026-10-05T15:00:00.000Z',
          partial: false,
        },
      ],
      rally: null,
    };
    expect(Game.parse(game)).toEqual(game);
  });
});

describe('endpoint registry', () => {
  it('fills path params', () => {
    expect(buildPath(endpoints.completeEntry.path, { gameId: 'g1', entryId: 'e 2' })).toBe(
      '/v1/games/g1/entries/e%202/complete',
    );
    expect(() => buildPath(endpoints.getGame.path, {})).toThrow(/gameId/);
  });

  it('keeps paths unique per method', () => {
    const keys = Object.values(endpoints).map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('derives request, response and path param types', () => {
    expectTypeOf<PathParams<'completeEntry'>>().toEqualTypeOf<Record<'gameId' | 'entryId', string | number>>();
    expectTypeOf<RequestBody<'createTask'>>().toMatchTypeOf<{ name: string; points?: number }>();
    expectTypeOf<RequestBody<'getToday'>>().toEqualTypeOf<undefined>();
    expectTypeOf<ResponseBody<'getCurrentSeries'>>().toMatchTypeOf<{ number: number } | null>();
  });
});
