// Server state with TanStack Query. Check-offs are optimistic; in http mode they fall
// back to the offline queue when the network is down (DATA_MODEL §9).

import type {
  GameDto,
  LineupPatchDto,
  MeDto,
  MePatchDto,
  StarterPutDto,
  TaskUpdateDto,
  TodayDto,
} from '@7gs/contracts';
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { isApiError, isRetryable } from '../api/client';
import { overlayQueue, type NewQueuedOp } from '../api/offlineQueue';
import { useApi, useCheckoffQueue, useQueuedOps } from './context';
import { errorMessage } from './errors';
import { useNotify } from './toast';

export const qk = {
  me: ['me'] as const,
  calendar: ['calendar'] as const,
  today: ['today'] as const,
  currentSeries: ['series', 'current'] as const,
  series: (id: string) => ['series', id] as const,
  tasks: ['tasks'] as const,
  starters: ['starters'] as const,
  currentSeason: ['season', 'current'] as const,
  game: (id: string) => ['game', id] as const,
  rally: (id: string) => ['rally', id] as const,
  rainout: (id: string) => ['rainout', id] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Let the service worker's cached responses answer while offline.
        networkMode: 'offlineFirst',
        staleTime: 15_000,
        retry: (count, error) => isRetryable(error) && count < 2,
      },
      // Mutations must run offline so check-offs can be queued instead of paused.
      mutations: { networkMode: 'always', retry: false },
    },
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

const ME_CACHE_KEY = '7gs.me';

function cachedMe(): MeDto | undefined {
  try {
    const raw = window.localStorage.getItem(ME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MeDto) : undefined;
  } catch {
    return undefined;
  }
}

export function forgetCachedMe(): void {
  try {
    window.localStorage.removeItem(ME_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function useMeQuery() {
  const api = useApi();
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      const me = await api.call('getMe');
      if (api.mode === 'http') {
        try {
          window.localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me));
        } catch {
          // ignore
        }
      }
      return me;
    },
    // In http mode a cached profile lets the app open offline.
    initialData: api.mode === 'http' ? cachedMe : undefined,
    initialDataUpdatedAt: 0,
  });
}

export function useTodayQuery() {
  const api = useApi();
  const queued = useQueuedOps();
  const select = useCallback((data: TodayDto) => overlayQueue(data, queued), [queued]);
  return useQuery({ queryKey: qk.today, queryFn: () => api.call('getToday'), select });
}

export function useCurrentSeriesQuery() {
  const api = useApi();
  return useQuery({ queryKey: qk.currentSeries, queryFn: () => api.call('getCurrentSeries') });
}

export function useTasksQuery() {
  const api = useApi();
  return useQuery({ queryKey: qk.tasks, queryFn: async () => (await api.call('listTasks')).tasks });
}

export function useStartersQuery() {
  const api = useApi();
  return useQuery({ queryKey: qk.starters, queryFn: async () => (await api.call('listStarters')).starters });
}

export function useCurrentSeasonQuery() {
  const api = useApi();
  return useQuery({ queryKey: qk.currentSeason, queryFn: () => api.call('getCurrentSeason') });
}

export function useCalendarQuery() {
  const api = useApi();
  return useQuery({ queryKey: qk.calendar, queryFn: () => api.call('getCalendar') });
}

export function useGameQuery(gameId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: qk.game(gameId ?? 'none'),
    queryFn: () => api.call('getGame', { params: { gameId: gameId ?? '' } }),
    enabled: gameId !== null,
  });
}

export function useRallyQuoteQuery(gameId: string | null, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: qk.rally(gameId ?? 'none'),
    queryFn: () => api.call('getRallyQuote', { params: { gameId: gameId ?? '' } }),
    enabled: enabled && gameId !== null,
    staleTime: 60_000,
  });
}

export function useRainoutQuoteQuery(gameId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: qk.rainout(gameId ?? 'none'),
    queryFn: () => api.call('getRainoutQuote', { params: { gameId: gameId ?? '' } }),
    enabled: gameId !== null,
    staleTime: 0,
  });
}

// ── Cache helpers ────────────────────────────────────────────────────────────

function patchTodayGame(qc: QueryClient, gameId: string, update: (game: GameDto) => GameDto): void {
  qc.setQueryData<TodayDto>(qk.today, (old) =>
    old ? { ...old, games: old.games.map((g) => (g.id === gameId ? update(g) : g)) } : old,
  );
}

export function putTodayGame(qc: QueryClient, game: GameDto): void {
  patchTodayGame(qc, game.id, () => game);
  qc.setQueryData(qk.game(game.id), game);
}

function invalidate(qc: QueryClient, ...keys: QueryKey[]): void {
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}

/** Everything a game-day change can ripple into. */
export function invalidateGameDay(qc: QueryClient): void {
  invalidate(qc, qk.today, ['series'], qk.currentSeason, qk.me, ['game']);
}

// ── Check-offs (optimistic, offline-capable) ─────────────────────────────────

const CHECKOFF_KEY = ['checkoff'] as const;

type EntryAction =
  | { kind: 'complete'; gameId: string; entryId: string; clientAt: string }
  | { kind: 'uncomplete'; gameId: string; entryId: string; clientAt: string }
  | { kind: 'partial'; gameId: string; entryId: string; clientAt: string; partial: boolean };

function applyAction(game: GameDto, action: EntryAction): GameDto {
  const entries = game.entries.map((e) => {
    if (e.id !== action.entryId) return e;
    if (action.kind === 'complete') return { ...e, completedAt: e.completedAt ?? action.clientAt };
    if (action.kind === 'uncomplete') return { ...e, completedAt: null };
    return { ...e, partial: action.partial };
  });
  const lockedAt = action.kind === 'complete' ? (game.lockedAt ?? action.clientAt) : game.lockedAt;
  return { ...game, entries, lockedAt, status: lockedAt && game.status === 'scheduled' ? 'live' : game.status };
}

/** Check-off, undo, and warning-track changes share one optimistic pipeline. */
export function useEntryAction() {
  const api = useApi();
  const queue = useCheckoffQueue();
  const qc = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationKey: CHECKOFF_KEY,
    mutationFn: async (action: EntryAction): Promise<GameDto | null> => {
      const enqueue = () => {
        queue.enqueue(action as NewQueuedOp);
        return null;
      };
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      // Keep order: once anything is queued, later actions queue behind it.
      if (api.mode === 'http' && (offline || queue.size > 0)) return enqueue();
      try {
        const params = { gameId: action.gameId, entryId: action.entryId };
        if (action.kind === 'complete') {
          return await api.call('completeEntry', { params, body: { clientAt: action.clientAt } });
        }
        if (action.kind === 'uncomplete') return await api.call('uncompleteEntry', { params });
        return await api.call('patchEntry', { params, body: { partial: action.partial } });
      } catch (error) {
        if (api.mode === 'http' && isApiError(error) && error.isNetwork) return enqueue();
        throw error;
      }
    },
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: qk.today });
      const previous = qc.getQueryData<TodayDto>(qk.today);
      patchTodayGame(qc, action.gameId, (g) => applyAction(g, action));
      return { previous };
    },
    onError: (error, _action, context) => {
      if (context?.previous) qc.setQueryData(qk.today, context.previous);
      notify(errorMessage(error), 'error');
      if (isApiError(error) && (error.code === 'STALE_CHECKOFF' || error.code === 'GAME_FINAL')) {
        invalidateGameDay(qc);
      }
    },
    onSuccess: (game) => {
      // Only the last in-flight check-off may overwrite the optimistic cache.
      if (game && qc.isMutating({ mutationKey: CHECKOFF_KEY }) <= 1) putTodayGame(qc, game);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: CHECKOFF_KEY }) <= 1) invalidate(qc, ['series'], qk.currentSeason);
    },
  });
}

// ── Game-day mutations ───────────────────────────────────────────────────────

function useGameMutation<V>(fn: (vars: V) => Promise<GameDto>, success?: string) {
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: fn,
    onSuccess: (game) => {
      putTodayGame(qc, game);
      invalidateGameDay(qc);
      if (success) notify(success, 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
}

export function usePatchLineup() {
  const api = useApi();
  return useGameMutation((v: { gameId: string; patch: LineupPatchDto }) =>
    api.call('patchLineup', { params: { gameId: v.gameId }, body: v.patch }),
  );
}

export function useLockGame() {
  const api = useApi();
  return useGameMutation((gameId: string) => api.call('lockGame', { params: { gameId } }));
}

export function useSubstitute() {
  const api = useApi();
  return useGameMutation((v: { gameId: string; outEntryId: string; inEntryId: string }) =>
    api.call('substitute', { params: { gameId: v.gameId }, body: { outEntryId: v.outEntryId, inEntryId: v.inEntryId } }),
  );
}

export function useAddToBench() {
  const api = useApi();
  return useGameMutation((v: { gameId: string; taskId: string }) =>
    api.call('addToBench', { params: { gameId: v.gameId }, body: { taskId: v.taskId } }),
  );
}

export function useCallRainout() {
  const api = useApi();
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (v: { gameId: string; makeupDate: string }) =>
      api.call('callRainout', { params: { gameId: v.gameId }, body: { makeupDate: v.makeupDate } }),
    onSuccess: (series) => {
      qc.setQueryData(qk.currentSeries, series);
      invalidateGameDay(qc);
      invalidate(qc, ['rainout']);
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
}

/** Rolls once per game; the key survives retries so a flaky network can't double-roll. */
export function useRollRally() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gameId: string) => {
      const storageKey = `7gs.rally-key.${gameId}`;
      let key: string | null = null;
      try {
        key = window.sessionStorage.getItem(storageKey);
      } catch {
        key = null;
      }
      if (!key) {
        key = globalThis.crypto.randomUUID();
        try {
          window.sessionStorage.setItem(storageKey, key);
        } catch {
          // ignore
        }
      }
      return api.call('rollRally', { params: { gameId }, headers: { 'Idempotency-Key': key } });
    },
    onSuccess: (result) => {
      qc.setQueryData(qk.game(result.game.id), result.game);
      invalidateGameDay(qc);
      invalidate(qc, ['rally']);
    },
  });
}

// ── Roster, starters, season, profile ────────────────────────────────────────

function useRosterMutation<V, R>(fn: (vars: V) => Promise<R>, success?: (result: R) => string) {
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      invalidate(qc, qk.tasks, qk.starters, qk.today);
      if (success) notify(success(result), 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
}

export function useCreateTask() {
  const api = useApi();
  return useRosterMutation(
    (body: { name: string; points: number; notes?: string | null }) => api.call('createTask', { body }),
    (task) => `${task.name} joins the roster.`,
  );
}

export function useUpdateTask() {
  const api = useApi();
  return useRosterMutation((v: { taskId: string; body: TaskUpdateDto }) =>
    api.call('updateTask', { params: { taskId: v.taskId }, body: v.body }),
  );
}

export function useRetireTask() {
  const api = useApi();
  return useRosterMutation(
    (taskId: string) => api.call('retireTask', { params: { taskId } }),
    (task) => `${task.name} retired.`,
  );
}

export function usePlaceOnInjuredList() {
  const api = useApi();
  return useRosterMutation(
    (taskId: string) => api.call('placeOnInjuredList', { params: { taskId } }),
    ({ task }) => `${task.name} placed on the Injured List.`,
  );
}

export function useActivateFromInjuredList() {
  const api = useApi();
  return useRosterMutation(
    (taskId: string) => api.call('activateFromInjuredList', { params: { taskId } }),
    ({ task }) => `${task.name} is back from the IL.`,
  );
}

export function usePutStarter() {
  const api = useApi();
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (v: { weekday: number; body: StarterPutDto }) =>
      api.call('putStarter', { params: { weekday: v.weekday }, body: v.body }),
    onSuccess: () => {
      invalidate(qc, qk.starters, ['series']);
      notify('Starter saved. It applies from the next game not yet built.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
}

export function useUpdateSeasonGoal() {
  const api = useApi();
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (v: { seasonId: string; winGoal: number }) =>
      api.call('updateSeason', { params: { seasonId: v.seasonId }, body: { winGoal: v.winGoal } }),
    onSuccess: (season) => {
      qc.setQueryData(qk.currentSeason, season);
      notify(`Goal set: ${season.winGoal} wins.`, 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
}

export function useUpdateMe() {
  const api = useApi();
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (patch: MePatchDto) => api.call('updateMe', { body: patch }),
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me);
      invalidateGameDay(qc);
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
}
