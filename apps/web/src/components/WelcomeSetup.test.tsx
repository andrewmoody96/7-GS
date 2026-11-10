import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders, AppRoutes } from '../app/routes';
import { getThemePref, setThemePref } from '../app/theme';

function renderApp(path: string) {
  window.localStorage.clear();
  setThemePref('system');
  const { api } = createMockApi({ storage: null, realNow: () => Date.parse('2026-10-02T17:00:00Z'), scenario: 'preseason', fresh: true });
  render(
    <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe('welcome setup on first sign-in', () => {
  it('asks for the sport, then the look in that sport’s words, then opens the How it works guide', async () => {
    const user = userEvent.setup();
    renderApp('/?welcome=start');
    const sport = await screen.findByRole('dialog', { name: 'Pick your sport' });
    await user.click(within(sport).getByRole('button', { name: 'Basketball' }));

    // Picking a sport redraws the app in its words; the setup carries on to the look.
    const look = await screen.findByRole('dialog', { name: 'Pick your look' });
    await user.click(within(look).getByRole('radio', { name: /Primetime/ }));
    expect(getThemePref()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.sport).toBe('basketball');
    await user.click(within(look).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('dialog', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByText(/A task list you play like a basketball season/)).toBeInTheDocument();
  });

  it('stays out of the way for a returning account', async () => {
    renderApp('/');
    expect(await screen.findByRole('dialog', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pick your look' })).toBeNull();
  });
});
