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

/** Page background per sport and scheme (--bg in tokens.css), for the status bar and browser chrome. */
const BAR_COLORS: Record<string, { light: string; dark: string }> = {
  baseball: { light: '#ece5d3', dark: '#08110c' },
  basketball: { light: '#efe2c8', dark: '#0c0e13' },
  hockey: { light: '#e9eff4', dark: '#070b10' },
};

export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  // Each theme-color tag answers one system scheme; a forced theme sets both to its color.
  const bar = BAR_COLORS[root.dataset.sport ?? 'baseball'] ?? BAR_COLORS.baseball!;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = bar[pref === 'system' ? scheme : pref];
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
