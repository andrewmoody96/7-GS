import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ApiClient } from '../api/client';
import type { CheckoffQueue } from '../api/offlineQueue';
import { FilmRoomScreen } from '../screens/FilmRoom';
import { SeasonScreen } from '../screens/Season';
import { SeriesScreen } from '../screens/Series';
import { SignInScreen } from '../screens/SignIn';
import { StarterEditorScreen } from '../screens/StarterEditor';
import { TodayScreen } from '../screens/Today';
import { AppShell, AuthGate } from './AppShell';
import { ApiProvider } from './context';
import { ToastProvider } from './toast';

export function AppProviders({
  api,
  queue,
  queryClient,
  children,
}: {
  api: ApiClient;
  queue: CheckoffQueue;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api} queue={queue}>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route
        element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        }
      >
        <Route index element={<TodayScreen />} />
        <Route path="series" element={<SeriesScreen />} />
        <Route path="film-room" element={<FilmRoomScreen />} />
        <Route path="film-room/starters/:weekday" element={<StarterEditorScreen />} />
        <Route path="season" element={<SeasonScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
