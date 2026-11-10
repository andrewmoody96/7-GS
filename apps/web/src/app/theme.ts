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

/** Page background per scheme (--bg in tokens.css), for the status bar and browser chrome. */
const BAR_COLOR = { light: '#ece5d3', dark: '#08110c' } as const;

export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  // Each theme-color tag answers one system scheme; a forced theme sets both to its color.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = BAR_COLOR[pref === 'system' ? scheme : pref];
  }
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
