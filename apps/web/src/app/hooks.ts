import { useEffect, useState } from 'react';
import { useApi } from './context';
import { useMeQuery } from './queries';

/** The transport's clock, refreshed periodically so lock times and countdowns move. */
export function useNow(intervalMs = 30_000): Date {
  const api = useApi();
  const [now, setNow] = useState(() => api.now());
  useEffect(() => {
    setNow(api.now());
    const timer = window.setInterval(() => setNow(api.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [api, intervalMs]);
  return now;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The user's IANA zone (from the profile), falling back to the device's. */
export function useTimeZone(): string {
  const me = useMeQuery();
  return me.data?.timezone ?? deviceTimeZone();
}

/** Remembers per-device that a one-time moment (like a celebration) was shown. */
export function onceKey(key: string): { seen: boolean; mark: () => void } {
  const storageKey = `7gs.seen.${key}`;
  let seen = false;
  try {
    seen = window.localStorage.getItem(storageKey) === '1';
  } catch {
    seen = false;
  }
  return {
    seen,
    mark: () => {
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // ignore
      }
    },
  };
}
