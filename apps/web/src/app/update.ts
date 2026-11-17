// App updates. main.tsx registers the service worker here. The first time the app is
// opened (or brought back) each day it looks for a new version and, if there is one,
// reloads into it right away. Settings can check by hand; a version found that way (or
// found too late after opening) is offered by the UpdateBar and applied on tap.

import { useSyncExternalStore } from 'react';

let apply: (() => void) | null = null;
const listeners = new Set<() => void>();

/**
 * Until when a version found by the open-of-the-day check is applied straight away (a
 * reload just after opening interrupts nothing). Found later, it waits for a tap instead.
 */
let autoApplyUntil = 0;
const AUTO_APPLY_WINDOW_MS = 20_000;

/** Called by the service worker registration when an update is waiting. */
export function offerUpdate(fn: () => void): void {
  if (Date.now() < autoApplyUntil) {
    autoApplyUntil = 0;
    fn();
    return;
  }
  apply = fn;
  listeners.forEach((l) => l());
}

/** The function that reloads into the new version, or null while there's nothing new. */
export function useUpdateAvailable(): (() => void) | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => apply,
    () => null,
  );
}

let registration: ServiceWorkerRegistration | null = null;
const LAST_CHECK_KEY = '7gs.updateCheckedOn';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Called once the service worker is registered (production builds only). */
export function setRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
}

/** The first open of the day (by the device's date) looks for a new version. */
export function checkIfFirstOpenToday(): void {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_CHECK_KEY);
  } catch {
    // Storage unavailable: just check.
  }
  if (last === todayKey()) return;
  autoApplyUntil = Date.now() + AUTO_APPLY_WINDOW_MS;
  void checkForUpdate().then((outcome) => {
    if (outcome !== 'available') autoApplyUntil = 0;
  });
}

/**
 * Look for a new version now. 'available' means the UpdateBar is (or will be) showing;
 * 'current' means this is the latest; 'unsupported' means updates aren't checked here
 * (the demo in development, or a browser without service workers).
 */
export async function checkForUpdate(): Promise<'available' | 'current' | 'unsupported'> {
  if (!registration) return 'unsupported';
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, todayKey());
  } catch {
    // Fine: it checks again next time.
  }
  try {
    await registration.update();
  } catch {
    return 'current';
  }
  const pending = registration.installing ?? registration.waiting;
  if (!pending) return apply ? 'available' : 'current';
  if (registration.waiting) return 'available';
  // Still downloading: wait for it to finish installing.
  return new Promise((resolve) => {
    pending.addEventListener('statechange', () => {
      if (pending.state === 'installed') resolve('available');
      else if (pending.state === 'redundant') resolve('current');
    });
  });
}
