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
  it('asks for the look (only one sport so far), then opens the How it works guide', async () => {
    const user = userEvent.setup();
    renderApp('/?welcome=start');
    const sheet = await screen.findByRole('dialog', { name: 'Pick your look' });
    // No sport question while baseball is the only theme.
    expect(screen.queryByRole('dialog', { name: 'Pick your sport' })).toBeNull();
    await user.click(within(sheet).getByRole('radio', { name: /Night game/ }));
    expect(getThemePref()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('dialog', { name: 'How it works' })).toBeInTheDocument();
  });

  it('stays out of the way for a returning account', async () => {
    renderApp('/');
    expect(await screen.findByRole('dialog', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pick your look' })).toBeNull();
  });
});
