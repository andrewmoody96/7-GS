import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopMenu } from './TopMenu';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderMenu(onHowItWorks = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <p>Outside</p>
      <TopMenu onHowItWorks={onHowItWorks} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onHowItWorks;
}

describe('the top bar menu', () => {
  it('opens to Settings, How it works and What’s changed', async () => {
    const user = userEvent.setup();
    renderMenu();
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Settings', 'How it works', 'What’s changed']);
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();
  });

  it('goes to Settings or What’s changed, and opens How it works, closing as it does', async () => {
    const user = userEvent.setup();
    const onHowItWorks = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/team/settings');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'What’s changed' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/team/settings/changes');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'How it works' }));
    expect(onHowItWorks).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape or a tap outside, and moves with the arrow keys', async () => {
    const user = userEvent.setup();
    renderMenu();
    const button = screen.getByRole('button', { name: 'Menu' });
    await user.click(button);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'How it works' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'What’s changed' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
