import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/oswald/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/board.css';
import './styles/screens.css';
import './styles/week.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createApi } from './api';
import { applyThemePref, getThemePref } from './app/theme';

applyThemePref(getThemePref());

// Opened from the iPhone Home Screen: the page itself doesn't scroll (see .is-installed in
// shell.css), so iOS's frosted edge under the status bar never covers the top bar.
const installed =
  (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (installed) document.documentElement.classList.add('is-installed');

if (import.meta.env.PROD) {
  // Precache the app shell; new versions activate on the next load.
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

void createApi().then((api) => {
  createRoot(root).render(
    <StrictMode>
      <App api={api} />
    </StrictMode>,
  );
});
