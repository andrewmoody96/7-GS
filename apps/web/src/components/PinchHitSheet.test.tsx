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

    await user.click(screen.getByRole('button', { name: /^Add a task$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/pick a task to see the raise/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add to lineup' })).toBeDisabled();

    await user.click(within(dialog).getByLabelText(/Meal prep/));
    expect(within(dialog).getByText('Runs to win 6 → 8')).toBeInTheDocument();
    expect(within(dialog).getByText('+2 pinch hit')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Add to lineup' }));
    expect(await screen.findByText('Runs to win 8 · +3 pinch hit')).toBeInTheDocument();
    const today = await api.call('getToday');
    expect(today.games[0]!.threshold).toBe(8);
    expect(today.games[0]!.entries.find((e) => e.taskName === 'Meal prep')).toMatchObject({ required: true, role: 'lineup' });
  });

  it('creates a brand-new task in the sheet and adds it to today', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<TodayScreen />);
    await user.click(await screen.findByRole('button', { name: /^Add a task$/ }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByText('Or create a new task'));
    await user.type(within(dialog).getByLabelText('New task'), 'Call the dentist');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    // The new task comes back selected, with the raise shown before confirming.
    expect(await within(dialog).findByText('Runs to win 6 → 7')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add to lineup' }));
    await waitFor(async () => {
      const today = await api.call('getToday');
      expect(today.games[0]!.entries.find((e) => e.taskName === 'Call the dentist')).toMatchObject({ required: true, role: 'lineup' });
    });
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

describe('Film Room: adding to a later day', () => {
  it('offers the must-hit choice for a later day, and adds a regular task when it’s off', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<FilmRoomScreen />, '/film-room');
    // Friday demo: Saturday is a later day in a week that has already started.
    const saturday = await screen.findByRole('listitem', { name: /^Sat / });
    await user.click(within(saturday).getAllByRole('button', { name: /^Add a task$/ })[0]!);
    const dialog = await screen.findByRole('dialog');
    const toggle = within(dialog).getByRole('switch', { name: 'Make it a must-hit' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(within(dialog).getByText(/skipping it won’t sink the day/)).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText(/Inbox zero/));
    await user.click(within(dialog).getByRole('button', { name: 'Add to lineup' }));
    await waitFor(async () => {
      const week = await api.call('getWeek', { params: { startDate: (await api.call('listWeeks')).weeks[0]!.startDate } });
      const games = week.games.filter((g) => g.playedDate > '2026-10-02');
      const added = games.flatMap((g) => g.entries).find((e) => e.taskName === 'Inbox zero' && e.pinchHitAt !== null);
      expect(added).toMatchObject({ required: false, role: 'lineup' });
    });
  });

  it('gives no choice when adding to today', async () => {
    const user = userEvent.setup();
    renderWithApp(<TodayScreen />);
    await user.click(await screen.findByRole('button', { name: /^Add a task$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('switch', { name: 'Make it a must-hit' })).toBeNull();
  });
});

describe('Film Room: the weekly lineup card', () => {
  it('shows this week locked (additions only) and next week open for planning', async () => {
    const user = userEvent.setup();
    renderWithApp(<FilmRoomScreen />, '/film-room');
    expect(await screen.findByText('Week in progress — add only')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) / })).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /Edit day/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Add a task$/ }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: /Next week/ }));
    expect(await screen.findByText('Planning')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Edit day/ })).toHaveLength(7));
    expect(screen.queryByRole('button', { name: /^Add a task$/ })).toBeNull();
  });
});
