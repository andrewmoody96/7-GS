import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PlayoffsBanner } from './PlayoffsBanner';

describe('the playoffs heads-up on Today', () => {
  it('opens the 2.0 notes, and can’t be dismissed', async () => {
    const user = userEvent.setup();
    render(<PlayoffsBanner />);
    const banner = screen.getByRole('button', { name: /Playoffs coming 12\/20/ });
    await user.click(banner);
    const sheet = await screen.findByRole('dialog', { name: 'Playoffs' });
    expect(sheet).toHaveTextContent('Playoffs arrive Sunday, December 20 (v2.0)');
    expect(sheet).toHaveTextContent('Exhibition');
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    // Closing the notes leaves the banner where it is.
    expect(screen.getByRole('button', { name: /Playoffs coming 12\/20/ })).toBeInTheDocument();
  });
});
