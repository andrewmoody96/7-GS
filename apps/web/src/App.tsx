import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import type { ApiClient } from './api/client';
import { CheckoffQueue } from './api/offlineQueue';
import { createQueryClient } from './app/queries';
import { AppProviders, AppRoutes } from './app/routes';

export function App({ api }: { api: ApiClient }) {
  const [queue] = useState(() => new CheckoffQueue());
  const [queryClient] = useState(createQueryClient);
  return (
    <AppProviders api={api} queue={queue} queryClient={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
