import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import { APP_VERSION, LATEST_RELEASE, RELEASES, unseenReleases } from '../releaseNotes';
import { WhatsNew } from './WhatsNew';

describe('release notes', () => {
  it('lists what an account hasn’t seen, up to and including a recap', () => {
    expect(unseenReleases(LATEST_RELEASE)).toEqual([]);
    // 1.1 recaps everything since launch, so nobody gets notes older than it.
    expect(RELEASES.find((r) => r.recap)).toMatchObject({ id: '1.1.0', version: '1.1.0-beta' });
    expect(unseenReleases(null).map((r) => r.id)).toEqual(['1.2.0', '1.1.0']);
    expect(unseenReleases('some-old-id-we-no-longer-list')).toEqual(unseenReleases(null));
    expect(unseenReleases('2026-11-guided-setup').map((r) => r.id)).toEqual(['1.2.0', '1.1.0']);
    // Someone who saw 1.1 gets just 1.2.
    expect(unseenReleases('1.1.0').map((r) => r.id)).toEqual(['1.2.0']);
  });

  it('keeps the version number in step with the newest release', () => {
    // A fix release (1.2.1) only bumps the version; its notes join the 1.2 entry.
    const minor = (v: string) => v.split('.').slice(0, 2).join('.');
    expect(minor(APP_VERSION)).toBe(minor(RELEASES.find((r) => r.version !== null)!.version!));
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
    expect(screen.getByText('1.0: everything since launch')).toBeInTheDocument();
    expect(screen.getByText('1.1: Badges')).toBeInTheDocument();
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
