import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { ApiClient } from '../api/client';
import type { CheckoffQueue, QueuedOp } from '../api/offlineQueue';

interface ApiContextValue {
  api: ApiClient;
  queue: CheckoffQueue;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ api, queue, children }: ApiContextValue & { children: ReactNode }) {
  return <ApiContext.Provider value={{ api, queue }}>{children}</ApiContext.Provider>;
}

function useApiContext(): ApiContextValue {
  const value = useContext(ApiContext);
  if (!value) throw new Error('ApiProvider is missing');
  return value;
}

export function useApi(): ApiClient {
  return useApiContext().api;
}

export function useCheckoffQueue(): CheckoffQueue {
  return useApiContext().queue;
}

/** Queued (not yet synced) check-offs, re-rendering when the queue changes. */
export function useQueuedOps(): readonly QueuedOp[] {
  const queue = useCheckoffQueue();
  return useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => queue.list(),
    () => queue.list(),
  );
}
