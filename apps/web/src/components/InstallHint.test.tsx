import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallHint } from './InstallHint';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function as(userAgent: string) {
  window.localStorage.clear();
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => vi.restoreAllMocks());

describe('Add to Home Screen hint', () => {
  it('shows iPhone steps in Safari and stays gone once dismissed', async () => {
    as(IPHONE);
    const user = userEvent.setup();
    const { unmount } = render(<InstallHint />);
    expect(screen.getByText('Add 7-Game Series to your Home Screen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show me how' }));
    expect(screen.getByText('Add to Home Screen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Add 7-Game Series to your Home Screen')).toBeNull();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByText('Add 7-Game Series to your Home Screen')).toBeNull();
  });

  it('stays out of the way on a computer', () => {
    as(DESKTOP);
    render(<InstallHint />);
    expect(screen.queryByText('Add 7-Game Series to your Home Screen')).toBeNull();
  });
});
