// The top bar's ≡ menu: Settings, How it works and What's changed, from any screen. It's
// the way in for people who don't go exploring (Settings is otherwise under Team).

import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconHelp, IconSettings, IconStar } from './icons';

/** Three lines that fold into an X while the menu is open (styles in shell.css). */
function Burger() {
  return (
    <svg className="burger" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path className="burger__top" d="M4 7h16" />
      <path className="burger__middle" d="M4 12h16" />
      <path className="burger__bottom" d="M4 17h16" />
    </svg>
  );
}

export function TopMenu({ onHowItWorks }: { onHowItWorks: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Closes on a tap outside it or Escape (focus goes back to the button).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (go: () => void) => () => {
    setOpen(false);
    go();
  };
  /** Up and down move between the items. */
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="topmenu" ref={root}>
      <button
        ref={button}
        type="button"
        className="icon-btn topmenu__button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <Burger />
      </button>
      {open ? (
        <div id={menuId} className="topmenu__list" role="menu" aria-label="Menu" onKeyDown={onMenuKey}>
          <button type="button" role="menuitem" className="topmenu__item" onClick={choose(() => navigate('/team/settings'))}>
            <IconSettings aria-hidden="true" />
            Settings
          </button>
          <button type="button" role="menuitem" className="topmenu__item" onClick={choose(onHowItWorks)}>
            <IconHelp aria-hidden="true" />
            How it works
          </button>
          <button type="button" role="menuitem" className="topmenu__item" onClick={choose(() => navigate('/team/settings/changes'))}>
            <IconStar aria-hidden="true" />
            What’s changed
          </button>
        </div>
      ) : null}
    </div>
  );
}
