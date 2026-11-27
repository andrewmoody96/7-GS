import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import { APP_VERSION, LATEST_RELEASE, latestVersionOf, RELEASES, unseenReleases } from '../releaseNotes';
import { WhatsNew } from './WhatsNew';

describe('release notes', () => {
  it('lists what an account hasn’t seen, up to and including a recap', () => {
    expect(unseenReleases(LATEST_RELEASE)).toEqual([]);
    // 1.1 recaps everything since launch, so nobody gets notes older than it.
    expect(RELEASES.find((r) => r.recap)).toMatchObject({ id: '1.1.0', version: '1.1.0-beta' });
    // At most three at a time, newest first.
    expect(unseenReleases(null).map((r) => r.id)).toEqual(['1.4.0', '1.3.0', '1.2.0']);
    expect(unseenReleases('some-old-id-we-no-longer-list')).toEqual(unseenReleases(null));
    expect(unseenReleases('2026-11-guided-setup').map((r) => r.id)).toEqual(['1.4.0', '1.3.0', '1.2.0']);
    // Someone who saw 1.2 gets 1.3 and 1.4; someone who saw 1.3, just 1.4.
    expect(unseenReleases('1.2.0').map((r) => r.id)).toEqual(['1.4.0', '1.3.0']);
    expect(unseenReleases('1.3.0').map((r) => r.id)).toEqual(['1.4.0']);
    // Only three fit, so the 1.1 recap drops off once three newer releases are out.
    expect(unseenReleases('1.0.0').map((r) => r.id)).toEqual(['1.4.0', '1.3.0', '1.2.0']);
  });

  it('keeps the version number in step with the newest release', () => {
    // A fix release (1.3.1) is a patch on its feature release's entry.
    expect(APP_VERSION).toBe(latestVersionOf(RELEASES[0]!));
    expect(RELEASES.at(-1)).toMatchObject({ id: '0.11.2026', title: 'v0.11.2026_beta' });
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
    expect(screen.getByText('Playoffs arrive Sunday, December 20 (v2.0)')).toBeInTheDocument();
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
