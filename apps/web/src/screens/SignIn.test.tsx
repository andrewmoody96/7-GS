import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient } from '../api/client';
import { createMockApi } from '../api/mock';
import { CheckoffQueue } from '../api/offlineQueue';
import { createQueryClient } from '../app/queries';
import { AppProviders } from '../app/routes';
import { SignInScreen } from './SignIn';

const CODE = '482913';

/** The demo backend, but with real email: no devToken, and a code to check. */
function emailingApi() {
  const { api: mock } = createMockApi({ storage: null, realNow: () => Date.parse('2026-10-02T17:00:00Z'), fresh: true });
  const calls: string[] = [];
  const api: ApiClient = {
    mode: 'http',
    now: () => mock.now(),
    call: (async (name: string, options?: { body?: { code?: string; email?: string; timezone?: string } }) => {
      calls.push(name);
      if (name === 'getMe') throw new ApiError(401, 'UNAUTHORIZED', 'Sign in.');
      if (name === 'requestMagicLink') return { sent: true };
      if (name === 'verifyLoginCode') {
        if (options?.body?.code !== CODE) throw new ApiError(401, 'UNAUTHORIZED', 'That code isn’t right. 4 tries left.');
        // A real session, minted by the demo backend for the same address.
        const { devToken } = await mock.call('requestMagicLink', { body: { email: options.body.email! } });
        return mock.call('verifyMagicLink', { body: { token: devToken!, timezone: options.body.timezone! } });
      }
      return (mock.call as (n: string, o?: unknown) => Promise<unknown>)(name, options);
    }) as ApiClient['call'],
  };
  return { api, calls };
}

function renderSignIn(api: ApiClient) {
  render(
    <AppProviders api={api} queue={new CheckoffQueue()} queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={['/sign-in']}>
        <Routes>
          <Route path="/sign-in" element={<SignInScreen />} />
          <Route path="/" element={<p>Today screen</p>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => vi.useRealTimers());

describe('sign-in code', () => {
  it('asks for the emailed code with the number pad and one-time-code autofill, and signs in at the 6th digit', async () => {
    const user = userEvent.setup();
    const { api, calls } = emailingApi();
    renderSignIn(api);
    await user.type(await screen.findByLabelText('Email'), 'fan@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));

    const field = await screen.findByLabelText('6-digit code');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveFocus();
    expect(screen.getByText(/Enter the 6-digit code we sent to/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in now' })).toBeNull();

    // A wrong code: the message shows, the field clears and keeps focus.
    await user.type(field, '111111');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code isn’t right. 4 tries left.');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(field).toHaveFocus();

    // Pasted with spaces (as copied from an email): digits only, then straight in.
    fireEvent.change(field, { target: { value: '482 913' } });
    expect(await screen.findByText('Today screen')).toBeInTheDocument();
    expect(calls.filter((c) => c === 'verifyLoginCode')).toHaveLength(2);
  });

  it('offers a new code after 30 seconds', async () => {
    const { api, calls } = emailingApi();
    renderSignIn(api);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'fan@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    const resend = await screen.findByRole('button', { name: /Send a new code in \d+s/ });
    expect(resend).toBeDisabled();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    const ready = await screen.findByRole('button', { name: 'Send a new code' });
    fireEvent.click(ready);
    await waitFor(() => expect(calls.filter((c) => c === 'requestMagicLink')).toHaveLength(2));
  });
});
