import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { withResponseValidation } from '../api/client';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import { pinchHitMath } from '../lib/game';
import { FilmRoomScreen } from '../screens/FilmRoom';
import { TodayScreen } from '../screens/Today';

// Friday 2 October 2026 in Chicago: the midseason demo (week locked, a carried-over one-off).
const REAL_NOW = Date.parse('2026-10-02T17:00:00Z');

function renderWithApp(ui: React.ReactNode, path = '/') {
  const { api, backend } = createMockApi({
    storage: null,
    realNow: () => REAL_NOW,
    timeZone: 'America/Chicago',
    scenario: 'midseason',
    fresh: true,
  });
  const client = withResponseValidation(api);
  render(
    <AppProviders api={client} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AppProviders>,
  );
  return { api: client, backend };
}

describe('pinch-hit math', () => {
  it('raises runs to win by exactly the task’s runs, and the opponent answers back', () => {
    expect(pinchHitMath(4, 2)).toEqual({ before: 4, after: 6, opponentBefore: 3, opponentAfter: 5 });
    expect(pinchHitMath(1, 1)).toEqual({ before: 1, after: 2, opponentBefore: 0, opponentAfter: 1 });
  });
});

describe('Today: pinch hitters', () => {
  it('shows the raise before confirming, then sends the pinch hitter in', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<TodayScreen />);

    // The carried-over one-off already raised today's bar by 1.
    expect(await screen.findByText('Runs to win 6 · +1 pinch hit')).toBeInTheDocument();
    expect(screen.getByText('Carried over')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Pinch hit$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/pick a task to see the raise/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send in' })).toBeDisabled();

    await user.click(within(dialog).getByLabelText(/Meal prep/));
    expect(within(dialog).getByText('Runs to win 6 → 8')).toBeInTheDocument();
    expect(within(dialog).getByText('+2 pinch hit')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Send in' }));
    expect(await screen.findByText('Runs to win 8 · +3 pinch hit')).toBeInTheDocument();
    const today = await api.call('getToday');
    expect(today.games[0]!.threshold).toBe(8);
    expect(today.games[0]!.entries.find((e) => e.taskName === 'Meal prep')).toMatchObject({ required: true, role: 'lineup' });
  });

  it('makes a bench task a must-hit with the same confirmation', async () => {
    const user = userEvent.setup();
    renderWithApp(<TodayScreen />);
    const bench = await screen.findByRole('region', { name: 'Bench' });
    const makeMustHit = within(bench).getAllByRole('button', { name: /Make must-hit/ });
    await user.click(makeMustHit[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Make must-hit: Practice Spanish' })).toBeInTheDocument();
    expect(within(dialog).getByText('Runs to win 6 → 7')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Make must-hit' }));
    expect(await screen.findByText('Runs to win 7 · +2 pinch hit')).toBeInTheDocument();
  });
});

describe('Film Room: the weekly lineup card', () => {
  it('shows this week locked (additions only) and next week open for planning', async () => {
    const user = userEvent.setup();
    renderWithApp(<FilmRoomScreen />, '/film-room');
    expect(await screen.findByText('Week locked — additions only')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) / })).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /Edit day/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Pinch hit$/ }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: /Next week/ }));
    expect(await screen.findByText('Planning')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Edit day/ })).toHaveLength(7));
    expect(screen.queryByRole('button', { name: /^Pinch hit$/ })).toBeNull();
  });
});
