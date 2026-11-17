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
import { checkIfFirstOpenToday, offerUpdate, setRegistration } from './app/update';

applyThemePref(getThemePref());

if (import.meta.env.PROD) {
  // Precache the app shell. Look for a new version the first time the app is opened or
  // brought back each day (and from Settings); when one is waiting, the UpdateBar offers a reload.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => offerUpdate(() => void updateSW(true)),
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        setRegistration(registration);
        checkIfFirstOpenToday();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkIfFirstOpenToday();
        });
      },
    });
  });
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
