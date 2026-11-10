// Team → Settings → Reminders: turn notifications on for this device, choose which
// reminders to get, and optionally get them by email too.

import type { ReminderPrefsDto, ReminderSettingsDto } from '@7gs/contracts';
import { useEffect, useId, useState } from 'react';
import { useApi } from '../app/context';
import { useReminderDevice, useRemindersQuery, useSendTestReminder, useUpdateReminders } from '../app/queries';
import { useNotify } from '../app/toast';
import { pushState, subscribeDevice, unsubscribeDevice, type PushState } from '../lib/push';
import { vocab } from '../vocab';
import { Switch } from './Controls';
import { ErrorPanel, Loading } from './States';

type Text = string | (() => string);
const text = (t: Text) => (typeof t === 'function' ? t() : t);

// Labels that use theme words are functions, so they follow a theme switch.
const KINDS: { key: Exclude<keyof ReminderPrefsDto, 'eveningAt' | 'email'>; label: Text; hint: Text }[] = [
  { key: 'evening', label: 'Evening check-in', hint: 'Only if today’s game isn’t won yet.' },
  { key: 'lastCall', label: 'Last call', hint: () => `Around 10:30 p.m., only if a ${vocab.term.required.toLowerCase()} is still open.` },
  { key: 'rally', label: () => `${vocab.term.comebackToken} available`, hint: 'The morning after a loss you can still appeal.' },
  { key: 'plan', label: 'Plan next week', hint: 'Friday when next week opens, and Sunday evening if you haven’t planned it.' },
];

export function RemindersCard() {
  const settings = useRemindersQuery();
  if (settings.isPending) return <Loading label="Loading reminders" />;
  if (settings.isError) return <ErrorPanel error={settings.error} onRetry={() => void settings.refetch()} />;
  return <Reminders settings={settings.data} />;
}

function Reminders({ settings: s }: { settings: ReminderSettingsDto }) {
  const update = useUpdateReminders();
  const test = useSendTestReminder();
  const timeId = useId();
  return (
    <section className="card reminders" aria-labelledby="reminders-title">
      <header className="card__head">
        <h2 id="reminders-title" className="card__title">
          Reminders
        </h2>
      </header>
      <ThisDevice pushKey={s.pushKey} />
      <ul className="reminders__kinds">
        {KINDS.map(({ key, label, hint }) => (
          <li key={key}>
            <Switch label={text(label)} checked={s[key]} onChange={(on) => update.mutate({ [key]: on })} />
            <p className="field__hint">{text(hint)}</p>
            {key === 'evening' && s.evening ? (
              <div className="reminders__time">
                <label htmlFor={timeId} className="field__label">
                  Check in at
                </label>
                <input
                  id={timeId}
                  className="input input--time"
                  type="time"
                  value={s.eveningAt}
                  onChange={(e) => {
                    if (e.target.value) update.mutate({ eveningAt: e.target.value });
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
        <li>
          <Switch label="Also email me" checked={s.email && s.emailAvailable} disabled={!s.emailAvailable} onChange={(on) => update.mutate({ email: on })} />
          <p className="field__hint">
            {s.emailAvailable ? 'The same reminders, by email.' : 'Email isn’t set up for this app yet, so reminders come as notifications only.'}
          </p>
        </li>
      </ul>
      <button type="button" className="btn" disabled={test.isPending} onClick={() => test.mutate()}>
        Send a test reminder
      </button>
    </section>
  );
}

const STATE_COPY: Record<PushState, string> = {
  'needs-install':
    'On iPhone, reminders work in the Home Screen app. In Safari, tap Share → Add to Home Screen, open 7-Game Series from there, and turn them on here.',
  unsupported: 'This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari.',
  blocked: 'Notifications are blocked for 7-Game Series. Allow them in your browser’s site settings (on iPhone: Settings → Notifications → 7GS), then come back.',
  off: 'Get reminders on this device as notifications.',
  on: 'Reminders are on for this device.',
};

function ThisDevice({ pushKey }: { pushKey: string }) {
  const api = useApi();
  const device = useReminderDevice();
  const notify = useNotify();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = api.mode === 'mock';

  useEffect(() => {
    let live = true;
    void pushState()
      .then((next) => live && setState(next))
      .catch(() => live && setState('unsupported'));
    return () => {
      live = false;
    };
  }, []);

  if (demo) {
    return <p className="reminders__device">Notifications aren’t sent in the demo. In the real app, turn them on here for each device.</p>;
  }
  if (state === null) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const sub = await subscribeDevice(pushKey);
      await device.mutateAsync({ subscribe: sub });
      setState('on');
      notify('Reminders are on for this device.', 'success');
    } catch (error) {
      setState(await pushState().catch(() => 'unsupported' as const));
      notify(error instanceof Error ? error.message : 'Couldn’t turn reminders on.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeDevice();
      if (endpoint) await device.mutateAsync({ unsubscribe: endpoint });
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`reminders__device reminders__device--${state}`}>
      <p>{STATE_COPY[state]}</p>
      {state === 'off' ? (
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void turnOn()}>
          Turn on reminders on this device
        </button>
      ) : state === 'on' ? (
        <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => void turnOff()}>
          Turn off on this device
        </button>
      ) : null}
    </div>
  );
}
