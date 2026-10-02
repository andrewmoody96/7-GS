// Offline check-off queue (DATA_MODEL §9). Check-offs that can't reach the API are
// kept on the device with their original timestamps and replayed in order. The server
// is authoritative: anything it rejects (STALE_CHECKOFF after midnight, or any other
// 4xx) is dropped and the UI refetches; network failures and 5xx keep the queue.

import type { TodayDto } from '@7gs/contracts';
import { isApiError, isRetryable, type ApiClient, type ApiError } from './client';

interface QueuedBase {
  id: string;
  gameId: string;
  entryId: string;
  /** Device time of the action, as sent to the API. */
  clientAt: string;
}

export type QueuedOp =
  | (QueuedBase & { kind: 'complete' })
  | (QueuedBase & { kind: 'uncomplete' })
  | (QueuedBase & { kind: 'partial'; partial: boolean });

/** Distributes Omit over the union so each variant keeps its own fields. */
export type NewQueuedOp = QueuedOp extends infer T ? (T extends QueuedOp ? Omit<T, 'id'> : never) : never;

export interface ReplayResult {
  sent: number;
  dropped: { op: QueuedOp; error: ApiError }[];
  /** Dropped because they arrived too late (after midnight or once the game was final). */
  stale: number;
  remaining: number;
}

const STORAGE_KEY = '7gs.checkoff-queue.v1';

export class CheckoffQueue {
  private items: QueuedOp[];
  private readonly listeners = new Set<() => void>();
  private replaying: Promise<ReplayResult> | null = null;
  private seq = 0;

  constructor(private readonly storage: Storage | null = defaultStorage()) {
    this.items = this.load();
  }

  private load(): QueuedOp[] {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as QueuedOp[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      if (this.items.length) this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.items));
      else this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: the queue still works for this session.
    }
    for (const listener of this.listeners) listener();
  }

  list(): readonly QueuedOp[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  enqueue(op: NewQueuedOp): QueuedOp {
    const queued = { ...op, id: `${Date.now().toString(36)}-${(this.seq++).toString(36)}` } as QueuedOp;
    this.items = [...this.items, queued];
    this.save();
    return queued;
  }

  clear(): void {
    this.items = [];
    this.save();
  }

  /** Sends queued operations one at a time, in order. Concurrent calls share one run. */
  replay(api: ApiClient): Promise<ReplayResult> {
    this.replaying ??= this.run(api).finally(() => {
      this.replaying = null;
    });
    return this.replaying;
  }

  private async run(api: ApiClient): Promise<ReplayResult> {
    const result: ReplayResult = { sent: 0, dropped: [], stale: 0, remaining: 0 };
    while (this.items.length > 0) {
      const op = this.items[0]!;
      try {
        await send(api, op);
        result.sent++;
      } catch (error) {
        if (isRetryable(error) || !isApiError(error)) break;
        result.dropped.push({ op, error });
        if (error.code === 'STALE_CHECKOFF') result.stale++;
      }
      this.items = this.items.filter((item) => item.id !== op.id);
      this.save();
    }
    result.remaining = this.items.length;
    return result;
  }
}

function send(api: ApiClient, op: QueuedOp) {
  const params = { gameId: op.gameId, entryId: op.entryId };
  switch (op.kind) {
    case 'complete':
      return api.call('completeEntry', { params, body: { clientAt: op.clientAt } });
    case 'uncomplete':
      return api.call('uncompleteEntry', { params });
    case 'partial':
      return api.call('patchEntry', { params, body: { partial: op.partial } });
  }
}

/** Shows queued operations on top of (possibly cached) server data. */
export function overlayQueue(today: TodayDto, ops: readonly QueuedOp[]): TodayDto {
  if (ops.length === 0) return today;
  return {
    ...today,
    games: today.games.map((game) => {
      const mine = ops.filter((op) => op.gameId === game.id);
      if (mine.length === 0) return game;
      let lockedAt = game.lockedAt;
      const entries = game.entries.map((entry) => {
        let next = entry;
        for (const op of mine) {
          if (op.entryId !== entry.id) continue;
          if (op.kind === 'complete') {
            next = { ...next, completedAt: next.completedAt ?? op.clientAt };
            lockedAt ??= op.clientAt;
          } else if (op.kind === 'uncomplete') next = { ...next, completedAt: null };
          else next = { ...next, partial: op.partial };
        }
        return next;
      });
      return { ...game, entries, lockedAt, status: lockedAt && game.status === 'scheduled' ? 'live' : game.status };
    }),
  };
}

function defaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
