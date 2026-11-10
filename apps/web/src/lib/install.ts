// Putting the app on the Home Screen. In a phone's browser the app works, but the Home
// Screen version opens full screen, keeps you signed in and (on iPhone) is the only place
// reminders can be turned on. Android's browser can install in one tap; iPhone needs Share.

import { isInstalled, isIos } from './push';

export type InstallPlatform = 'ios' | 'android';

/** Which phone's steps to show, or null when the hint doesn't apply (desktop, or already installed). */
export function installPlatform(): InstallPlatform | null {
  if (typeof navigator === 'undefined' || isInstalled()) return null;
  if (isIos()) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return null;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// Chrome on Android offers its own install prompt; keep it for our button.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function onInstallPromptChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Show the browser's own install prompt. Resolves true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  listeners.forEach((fn) => fn());
  return outcome === 'accepted';
}

const DISMISSED_KEY = '7gs.installHintDismissed';

export function installHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Private mode: the hint may show again next visit.
  }
}
