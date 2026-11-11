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
import { LineupsScreen } from '../screens/Team';
import { TodayScreen } from '../screens/Today';
import { TasksSheet } from './TasksSheet';
import { TaskSheet } from './TaskViews';

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

describe('Lineups: adding to a later day', () => {
  it('offers the must-hit choice for a later day, and adds a regular task when it’s off', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<LineupsScreen />, '/team/lineups');
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

describe('Lineups: the weekly lineup card', () => {
  it('shows this week locked (additions only) and next week open for planning', async () => {
    const user = userEvent.setup();
    renderWithApp(<LineupsScreen />, '/team/lineups');
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

describe('Add task window', () => {
  it('adds a task to a later day this week, as a regular task when must-hit is off', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<TasksSheet open onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Task'), 'Book flights');
    // Friday demo: the week has started. Saturday is a doubleheader; pick its first game.
    await user.click((await within(dialog).findAllByText(/^Sat/))[0]!);
    expect(within(dialog).getByText(/so the day gets no easier/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Make it a must-hit' }));
    await user.click(within(dialog).getByRole('button', { name: /Add task/ }));
    await waitFor(async () => {
      const week = await api.call('getWeek', { params: { startDate: (await api.call('listWeeks')).weeks[0]!.startDate } });
      const added = week.games.flatMap((g) => g.entries).find((e) => e.taskName === 'Book flights');
      expect(added).toMatchObject({ required: false, role: 'lineup' });
    });
  });

  it('makes a task added to today a must-hit, with no choice', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<TasksSheet open onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Task'), 'Call the dentist');
    await user.click(await within(dialog).findByText('Today'));
    expect(within(dialog).queryByRole('switch', { name: 'Make it a must-hit' })).toBeNull();
    expect(within(dialog).getByText(/a task added to today is a must-hit/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Add task/ }));
    await waitFor(async () => {
      const today = (await api.call('getToday')).games[0]!;
      expect(today.entries.find((e) => e.taskName === 'Call the dentist')).toMatchObject({ required: true, role: 'lineup' });
    });
  });

  it('just adds it to the task list when no day is picked', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<TasksSheet open onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Task'), 'Learn to juggle');
    await user.click(within(dialog).getByRole('button', { name: /Add task/ }));
    await waitFor(async () => {
      expect((await api.call('listTasks')).tasks.some((t) => t.name === 'Learn to juggle')).toBe(true);
    });
    const today = (await api.call('getToday')).games[0]!;
    expect(today.entries.some((e) => e.taskName === 'Learn to juggle')).toBe(false);
  });

  it('puts a repeating task in the chosen weekdays’ default lineups, without touching a started week', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<TasksSheet open onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Task'), 'Stretch');
    const everyWeek = within(within(dialog).getByRole('group', { name: 'Every week' }));
    await user.click(everyWeek.getByText('Mon'));
    await user.click(everyWeek.getByText('Thu'));
    expect(within(dialog).getByText(/Every Mon and Thu starts with it/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Make it a must-hit' }));
    await user.click(within(dialog).getByRole('button', { name: /Add task/ }));
    await waitFor(async () => {
      const task = (await api.call('listTasks')).tasks.find((t) => t.name === 'Stretch');
      const { starters } = await api.call('listStarters');
      const holding = starters.filter((s) => s.lineup.some((l) => l.taskId === task?.id && !l.required)).map((s) => s.weekday);
      expect(holding).toEqual([1, 4]);
    });
    // The demo week has started, so its days keep their lineups.
    const week = await api.call('getWeek', { params: { startDate: (await api.call('listWeeks')).weeks[0]!.startDate } });
    expect(week.games.flatMap((g) => g.entries).some((e) => e.taskName === 'Stretch')).toBe(false);
  });

  it('only offers every week for repeating tasks', async () => {
    const user = userEvent.setup();
    renderWithApp(<TasksSheet open onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'Every week' })).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/One-off/));
    expect(within(dialog).queryByRole('group', { name: 'Every week' })).toBeNull();
  });
});

describe('Deleting a task', () => {
  it('asks first, says it stays this week, and offers undo while it does', async () => {
    const user = userEvent.setup();
    const { api } = renderWithApp(<div />);
    const today = (await api.call('getToday')).games[0]!;
    const entry = today.entries.find((e) => e.role === 'lineup' && e.completedAt === null)!;
    const task = (await api.call('listTasks')).tasks.find((t) => t.id === entry.taskId)!;
    const withTask = (await api.call('listTasks')).tasks.find((t) => t.id === task.id)!;

    const view = render(
      <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
        <MemoryRouter>
          <TaskSheet task={withTask} today={today.playedDate} onClose={() => {}} />
        </MemoryRouter>
      </AppProviders>,
    );
    const dialog = await view.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete task…' }));
    expect(within(dialog).getByText(/stays in this week’s lineups through/)).toBeInTheDocument();
    // Keep backs out without deleting.
    await user.click(within(dialog).getByRole('button', { name: 'Keep' }));
    expect((await api.call('listTasks')).tasks.find((t) => t.id === task.id)!.status).not.toBe('retired');

    await user.click(within(dialog).getByRole('button', { name: 'Delete task…' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => {
      expect((await api.call('listTasks')).tasks.find((t) => t.id === task.id)).toMatchObject({ status: 'retired' });
    });

    const leaving = (await api.call('listTasks')).tasks.find((t) => t.id === task.id)!;
    view.unmount();
    const again = render(
      <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
        <MemoryRouter>
          <TaskSheet task={leaving} today={today.playedDate} onClose={() => {}} />
        </MemoryRouter>
      </AppProviders>,
    );
    const sheet = await again.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Undo delete' }));
    await waitFor(async () => {
      expect((await api.call('listTasks')).tasks.find((t) => t.id === task.id)).toMatchObject({ status: 'active' });
    });
  });
});
