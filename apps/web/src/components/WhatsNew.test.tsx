import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import { LATEST_RELEASE, RELEASES, unseenReleases } from '../releaseNotes';
import { WhatsNew } from './WhatsNew';

describe('release notes', () => {
  it('lists what an account hasn’t seen', () => {
    expect(unseenReleases(LATEST_RELEASE)).toEqual([]);
    // Never saw a popup (or an id we no longer list): every recent release, newest first, up to 3.
    expect(unseenReleases(null).map((r) => r.id)).toEqual(RELEASES.slice(0, 3).map((r) => r.id));
    expect(unseenReleases(null).map((r) => r.id)).toEqual(['2026-11-passwords', '2026-11-team-photo']);
    expect(unseenReleases('some-old-id-we-no-longer-list')).toEqual(unseenReleases(null));
    // Someone who saw the team-photo notes gets just the newer ones.
    expect(unseenReleases('2026-11-team-photo').map((r) => r.id)).toEqual(['2026-11-passwords']);
  });
});

describe('What’s new', () => {
  it('shows once after an update, then marks it seen on the account', async () => {
    const user = userEvent.setup();
    const { api } = createMockApi({ storage: null, realNow: () => Date.parse('2026-10-02T17:00:00Z'), scenario: 'midseason', fresh: true });
    await api.call('updateMe', { body: { seenRelease: 'an-older-release' } });
    render(
      <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
        <MemoryRouter>
          <WhatsNew seen="an-older-release" ready />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(await screen.findByRole('dialog', { name: /What’s new/ })).toBeInTheDocument();
    expect(screen.getByText(/Optional password/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(async () => expect((await api.call('getMe')).seenRelease).toBe(LATEST_RELEASE));
    expect(screen.queryByRole('dialog', { name: /What’s new/ })).toBeNull();
  });

  it('stays closed when everything has been seen, or until other popups are done', () => {
    const { api } = createMockApi({ storage: null, realNow: () => Date.parse('2026-10-02T17:00:00Z'), scenario: 'midseason', fresh: true });
    render(
      <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
        <MemoryRouter>
          <WhatsNew seen={LATEST_RELEASE} ready />
          <WhatsNew seen={null} ready={false} />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
