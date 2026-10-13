import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import type { ApiClient } from './api/client';
import { CheckoffQueue } from './api/offlineQueue';
import { createQueryClient } from './app/queries';
import { AppProviders, AppRoutes } from './app/routes';

/** The router's base: '' at the domain root, '/7-GS' on GitHub Pages (from Vite's `base`). */
const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '');

export function App({ api }: { api: ApiClient }) {
  const [queue] = useState(() => new CheckoffQueue());
  const [queryClient] = useState(createQueryClient);
  return (
    <AppProviders api={api} queue={queue} queryClient={queryClient}>
      <BrowserRouter basename={BASENAME}>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
