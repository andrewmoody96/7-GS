import { beforeEach, describe, expect, it } from 'vitest';
import { CheckoffQueue, ClockSetBackError } from './offlineQueue';

const op = (clientAt: string) => ({ kind: 'complete' as const, gameId: 'g', entryId: 'e', clientAt });

describe('offline check-off queue', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps actions stamped in order, allowing a small clock slip', () => {
    const queue = new CheckoffQueue();
    queue.enqueue(op('2026-10-05T23:50:00.000Z'));
    queue.enqueue(op('2026-10-05T23:49:30.000Z')); // 30 s back: a network time sync
    expect(queue.size).toBe(2);
  });

  it('refuses an action stamped well before the last one: the clock was set back', () => {
    const queue = new CheckoffQueue();
    queue.enqueue(op('2026-10-06T01:10:00.000Z'));
    expect(() => queue.enqueue(op('2026-10-05T23:58:00.000Z'))).toThrow(ClockSetBackError);
    expect(queue.size).toBe(1);
  });
});
