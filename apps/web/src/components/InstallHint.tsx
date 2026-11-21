// A nudge, in a phone's browser only, to put the app on the Home Screen. Gone for good once
// dismissed, and never shown inside the Home Screen app itself or on desktop.

import { useEffect, useState, type ReactNode } from 'react';
import {
  canPromptInstall,
  dismissInstallHint,
  installHintDismissed,
  installPlatform,
  onInstallPromptChange,
  promptInstall,
  type InstallPlatform,
} from '../lib/install';
import { IconAddSquare, IconMoreHorizontal, IconMoreVertical, IconShare } from './icons';

/** A browser button drawn inline, so the steps show what to look for. */
function Key({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="installsteps__key" role="img" aria-label={label}>
      {children}
    </span>
  );
}

/**
 * The steps for each phone, shared with the How it works guide. Worded for any browser
 * (Safari, Chrome, DuckDuckGo, …): each puts these buttons in its toolbar or menu.
 */
export function InstallSteps({ platform }: { platform: InstallPlatform }) {
  return platform === 'ios' ? (
    <ol className="installsteps">
      <li>
        Tap{' '}
        <Key label="Share">
          <IconShare />
        </Key>{' '}
        <strong>Share</strong> in your browser. Don’t see it? Tap{' '}
        <Key label="More">
          <IconMoreHorizontal />
        </Key>{' '}
        first.
      </li>
      <li>
        Choose{' '}
        <Key label="Add">
          <IconAddSquare />
        </Key>{' '}
        <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
      </li>
      <li>Open 7-Game Series from your Home Screen and sign in with the 6-digit code we email you.</li>
    </ol>
  ) : (
    <ol className="installsteps">
      <li>
        Tap{' '}
        <Key label="Menu">
          <IconMoreVertical />
        </Key>{' '}
        <strong>Menu</strong> in your browser.
      </li>
      <li>
        Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.
      </li>
      <li>Open 7-Game Series from your Home Screen.</li>
    </ol>
  );
}

export function InstallHint({ dismissible = true }: { dismissible?: boolean }) {
  const [platform] = useState(installPlatform);
  const [hidden, setHidden] = useState(() => dismissible && installHintDismissed());
  const [open, setOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  useEffect(() => onInstallPromptChange(() => setCanPrompt(canPromptInstall())), []);

  if (!platform || hidden) return null;
  const dismiss = () => {
    dismissInstallHint();
    setHidden(true);
  };
  return (
    <aside className="notice installhint" aria-label="Add to Home Screen">
      <p className="installhint__lede">
        <strong>Add 7-Game Series to your Home Screen</strong> for the full app: full screen, stays signed in
        {platform === 'ios' ? ', and reminders work' : ''}.
      </p>
      {open ? <InstallSteps platform={platform} /> : null}
      <div className="installhint__actions">
        {platform === 'android' && canPrompt ? (
          <button type="button" className="btn btn--primary" onClick={() => void promptInstall().then((ok) => ok && setHidden(true))}>
            Install
          </button>
        ) : !open ? (
          <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
            Show me how
          </button>
        ) : null}
        {dismissible ? (
          <button type="button" className="btn btn--quiet" onClick={dismiss}>
            Not now
          </button>
        ) : null}
      </div>
    </aside>
  );
}
