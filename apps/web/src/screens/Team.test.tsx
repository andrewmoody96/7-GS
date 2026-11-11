import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import type { Theme } from '@7gs/rules';
import { applyTheme } from '../vocab';
import { ManagementScreen, RotationScreen, TeamScreen } from './Team';

function renderAt(path: string, theme: Theme) {
  applyTheme(theme);
  const { api } = createMockApi({ storage: null, realNow: () => Date.parse('2026-10-02T17:00:00Z'), scenario: 'midseason', fresh: true });
  render(
    <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/team" element={<TeamScreen />} />
          <Route path="/team/management" element={<ManagementScreen />} />
          <Route path="/team/rotation" element={<RotationScreen />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => applyTheme('baseball'));

describe('Team', () => {
  it('shows three buttons: Management, Team History and Settings', async () => {
    renderAt('/team', 'baseball');
    const nav = await screen.findByRole('navigation', { name: 'Team' });
    const titles = [...nav.querySelectorAll('strong')].map((el) => el.textContent);
    expect(titles).toEqual(['Management', 'Team History', 'Settings']);
  });

  it.each(['basketball', 'hockey'] as const)('calls it Coaching in %s', async (theme) => {
    renderAt('/team', theme);
    const nav = await screen.findByRole('navigation', { name: 'Team' });
    expect(nav.querySelector('strong')?.textContent).toBe('Coaching');
  });

  it('opens a page with This Week, Default Lineups and Injuries', async () => {
    renderAt('/team/management', 'hockey');
    expect(screen.getByRole('heading', { name: 'Coaching' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Coaching' });
    expect([...nav.querySelectorAll('strong')].map((el) => el.textContent)).toEqual(['This Week', 'Default Lineups', 'Injuries']);
  });

  it('leads back through Coaching from Default Lineups', () => {
    renderAt('/team/rotation', 'basketball');
    expect(screen.getByRole('link', { name: 'Coaching' })).toHaveAttribute('href', '/team/management');
  });
});
