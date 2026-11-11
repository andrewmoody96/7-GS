import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ApiClient } from '../api/client';
import type { CheckoffQueue } from '../api/offlineQueue';
import { PastSeriesScreen, SeriesScreen } from '../screens/Series';
import { SignInScreen } from '../screens/SignIn';
import { StarterEditorScreen } from '../screens/StarterEditor';
import {
  FilmRoomRedirect,
  HistoryScreen,
  InjuredListScreen,
  LineupsScreen,
  ManagementScreen,
  RotationScreen,
  SettingsScreen,
  StarterRedirect,
  TeamScreen,
} from '../screens/Team';
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
        <Route path="team" element={<TeamScreen />} />
        <Route path="team/management" element={<ManagementScreen />} />
        <Route path="team/lineups" element={<LineupsScreen />} />
        <Route path="team/rotation" element={<RotationScreen />} />
        <Route path="team/rotation/:weekday" element={<StarterEditorScreen />} />
        <Route path="team/il" element={<InjuredListScreen />} />
        <Route path="team/history" element={<HistoryScreen />} />
        <Route path="team/history/series/:seriesId" element={<PastSeriesScreen />} />
        <Route path="team/settings" element={<SettingsScreen />} />
        {/* Old links from before Team (Film Room and Season). */}
        <Route path="film-room" element={<FilmRoomRedirect />} />
        <Route path="film-room/starters/:weekday" element={<StarterRedirect />} />
        <Route path="season" element={<Navigate to="/team" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
