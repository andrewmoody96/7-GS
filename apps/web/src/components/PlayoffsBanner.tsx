// Until 2.0 ships: a line on Today, "Playoffs coming 12/20", that opens the 1.4 notes on
// what's changing. Not dismissible. Delete this component (and its use in Today) in 2.0.

import { useState } from 'react';
import { APP_VERSION, RELEASES } from '../releaseNotes';
import { IconTrophy } from './icons';
import { Sheet } from './Sheet';
import { ReleaseNoteView } from './WhatsNew';

// Just the playoffs section of the 1.4 notes, not the rest of that release.
const release = RELEASES.find((r) => r.id === '1.4.0');
const HEADS_UP = release ? { ...release, added: undefined, improved: undefined, fixed: undefined } : undefined;

export function PlayoffsBanner() {
  const [open, setOpen] = useState(false);
  // Belt and braces: a 2.0 build never shows it, even if the component is left in.
  if (!HEADS_UP || !APP_VERSION.startsWith('1.')) return null;
  return (
    <>
      <button type="button" className="playoffs-banner" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <IconTrophy aria-hidden="true" />
        <span className="playoffs-banner__title">Playoffs coming 12/20</span>
        <span className="playoffs-banner__go">What’s changing ›</span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        kicker="Coming in v2.0"
        title="Playoffs"
        footer={
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        }
      >
        <ReleaseNoteView note={HEADS_UP} showTitle={false} />
      </Sheet>
    </>
  );
}
