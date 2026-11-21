import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import { evaluateAchievements, type Theme } from '@7gs/rules';
import { applyTheme } from '../vocab';
import { ChangesScreen, ManagementScreen, RotationScreen, TeamScreen } from './Team';

function renderAt(path: string, theme: Theme) {
  applyTheme(theme);
  const { api } = createMockApi({ storage: null, realNow: () => Date.parse('2026-10-02T17:00:00Z'), scenario: 'midseason', fresh: true });
  const view = render(
    <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/team" element={<TeamScreen />} />
          <Route path="/team/management" element={<ManagementScreen />} />
          <Route path="/team/rotation" element={<RotationScreen />} />
          <Route path="/team/settings/changes" element={<ChangesScreen />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  return { api, view };
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

describe('Badges', () => {
  it('shows the count earned from the account’s own history', async () => {
    const { api } = renderAt('/team', 'baseball');
    const { stats } = await api.call('getAchievements');
    const earned = evaluateAchievements(stats).filter((p) => p.earned).length;
    // A team mid-season has played and won: more than the first-day badges.
    expect(stats.wins).toBeGreaterThan(0);
    expect(earned).toBeGreaterThan(2);
    // A tile in the team stats, opening the collection.
    const link = await screen.findByRole('link', { name: 'Badges' });
    expect(link).toHaveAttribute('href', '/team/badges');
    await waitFor(() => expect(link.closest('.stat')?.querySelector('dd')?.textContent).toBe(String(earned)));
    expect(await screen.findByRole('link', { name: /Standings|in the/ })).toHaveAttribute('href', '/team/standings');
  });
});

describe('Default Lineups grid', () => {
  it('plans every weekday on one grid and saves only the days that changed', async () => {
    const user = userEvent.setup();
    const { api } = renderAt('/team/rotation', 'baseball');
    const grid = await screen.findByRole('table', { name: 'Default Lineups' });
    const before = (await api.call('listStarters')).starters;
    // A task in Monday's lineup that isn't a must-hit there.
    const mon = before.find((s) => s.weekday === 1)!;
    const tasks = (await api.call('listTasks')).tasks;
    const slot = mon.lineup.find((l) => !l.required && tasks.find((t) => t.id === l.taskId)?.status === 'active')!;
    const name = tasks.find((t) => t.id === slot.taskId)!.name;

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const cell = () => within(grid).getByRole('button', { name: new RegExp(`^${name} on Mon:`) });
    expect(cell()).toHaveAccessibleName(`${name} on Mon: in the lineup`);
    await user.click(cell());
    expect(cell()).toHaveAccessibleName(`${name} on Mon: must-hit`);

    // Undo puts it back; then make the change for real and save.
    await user.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(cell()).toHaveAccessibleName(`${name} on Mon: in the lineup`);
    await user.click(cell());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const after = (await api.call('listStarters')).starters;
      expect(after.find((s) => s.weekday === 1)!.lineup.find((l) => l.taskId === slot.taskId)).toMatchObject({ required: true });
    });
    const after = (await api.call('listStarters')).starters;
    // Monday keeps its order, name and bench; the other days are untouched.
    const monAfter = after.find((s) => s.weekday === 1)!;
    expect(monAfter.lineup.map((l) => l.taskId)).toEqual(mon.lineup.map((l) => l.taskId));
    expect(monAfter).toMatchObject({ name: mon.name, lockTime: mon.lockTime, bench: mon.bench });
    for (const day of [2, 3, 4, 5, 6, 7]) {
      expect(after.find((s) => s.weekday === day)).toEqual(before.find((s) => s.weekday === day));
    }
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
  });
});

describe('What’s changed', () => {
  it('shows three tiles: this version, the one before, and everything since the last major release', () => {
    renderAt('/team/settings/changes', 'baseball');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(['v1.3.1-beta', 'v1.2.1-beta', 'Since the last major release']);
    expect(screen.getByText('Current version')).toBeInTheDocument();
    expect(screen.getByText('Previous version')).toBeInTheDocument();
    expect(screen.getByText('Since v0.11.2026_beta')).toBeInTheDocument();
    // The newest fixes come first in the current tile.
    expect(screen.getByText('v1.3.1-beta fixes')).toBeInTheDocument();
  });
});
