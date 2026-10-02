// Theme preference: follow the system by default, or force light/dark per device.

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = '7gs.theme';

export function getThemePref(): ThemePref {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, pref);
  } catch {
    // Not persisted; still applied for this session.
  }
  applyThemePref(pref);
}
