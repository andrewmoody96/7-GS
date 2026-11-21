// "What's new": after an update, the release notes this account hasn't seen yet, once.
// Seen is stored on the account (Me.seenRelease), so dismissing it on the phone means the
// desktop doesn't show it again. A brand-new account skips straight to "seen".

import { useState } from 'react';
import { useUpdateMe } from '../app/queries';
import { LATEST_RELEASE, unseenReleases, versionLabel, type ReleaseNote } from '../releaseNotes';
import { Sheet } from './Sheet';

const SECTIONS: [keyof Pick<ReleaseNote, 'added' | 'improved' | 'fixed'>, string][] = [
  ['added', 'New'],
  ['improved', 'Improved'],
  ['fixed', 'Fixed'],
];

/** One release's notes: its named sections, then New / Improved / Fixed. */
export function ReleaseNoteView({ note, showTitle }: { note: ReleaseNote; showTitle: boolean }) {
  return (
    <section className="whatsnew">
      {showTitle ? <h3 className="whatsnew__title">{note.title}</h3> : null}
      {note.sections?.map((section) => (
        <div key={section.title} className="whatsnew__group whatsnew__group--section">
          <h4 className="whatsnew__label">{section.title}</h4>
          <ul className="whatsnew__list">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {SECTIONS.map(([key, label]) =>
        note[key]?.length ? (
          <div key={key} className={`whatsnew__group whatsnew__group--${key}`}>
            <h4 className="whatsnew__label">{label}</h4>
            <ul className="whatsnew__list">
              {note[key]!.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}

export function WhatsNew({ seen, ready }: { seen: string | null; ready: boolean }) {
  const updateMe = useUpdateMe();
  const [closed, setClosed] = useState(false);
  const notes = unseenReleases(seen);
  const open = ready && !closed && notes.length > 0;
  const close = () => {
    setClosed(true);
    updateMe.mutate({ seenRelease: LATEST_RELEASE });
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      kicker={notes[0]?.version ? versionLabel(notes[0].version) : 'App update'}
      title="What’s new"
      footer={
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={close}>
            Got it
          </button>
        </div>
      }
    >
      {notes.map((note) => (
        <ReleaseNoteView key={note.id} note={note} showTitle={notes.length > 1} />
      ))}
    </Sheet>
  );
}
