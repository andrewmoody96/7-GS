// First sign-in: choose a sport (when there's more than one), then Auto / light / dark,
// before the How it works guide. Both stay in Team → Settings.
//
// The step lives in the page address (?welcome=…): picking a sport saves it on the
// account and redraws the app in that sport's words, and the address survives that.

import { THEME_TERMS, type Theme } from '@7gs/rules';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMeQuery, useUpdateMe } from '../app/queries';
import { getThemePref, setThemePref, type ThemePref } from '../app/theme';
import { AVAILABLE_THEMES, vocab } from '../vocab';
import { Sheet } from './Sheet';

export const WELCOME_PARAM = 'welcome';

type Step = 'sport' | 'look';

/** The current step, or null when the welcome setup isn't running. */
export function useWelcomeStep(): [Step | null, (next: Step | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(WELCOME_PARAM);
  const step: Step | null =
    raw === null ? null : raw === 'look' || AVAILABLE_THEMES.length < 2 ? 'look' : 'sport';
  const go = (next: Step | null) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next === null) out.delete(WELCOME_PARAM);
        else out.set(WELCOME_PARAM, next);
        return out;
      },
      { replace: true },
    );
  return [step, go];
}

export function WelcomeSetup({ onDone }: { onDone: () => void }) {
  const [step, go] = useWelcomeStep();
  if (step === null) return null;
  return step === 'sport' ? <SportStep onNext={() => go('look')} /> : <LookStep onDone={() => { go(null); onDone(); }} />;
}

function SportStep({ onNext }: { onNext: () => void }) {
  const me = useMeQuery();
  const update = useUpdateMe();
  const current = me.data?.theme ?? 'baseball';
  const pick = (theme: Theme) => {
    if (theme === current) onNext();
    else update.mutate({ theme }, { onSuccess: onNext });
  };
  return (
    <Sheet open onClose={onNext} kicker={`Welcome to ${vocab.app.name}`} title="Pick your sport">
      <p className="lede">
        Same game, your favorite look. It only changes the words and the scoreboard, never the rules, and you can switch any
        time in Settings.
      </p>
      <div className="choices">
        {AVAILABLE_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            className={`choice${theme === current ? ' is-selected' : ''}`}
            disabled={update.isPending}
            onClick={() => pick(theme)}
          >
            <strong>{THEME_TERMS[theme].name}</strong>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function LookStep({ onDone }: { onDone: () => void }) {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const choose = (next: ThemePref) => {
    setPref(next);
    setThemePref(next);
  };
  const options: { value: ThemePref; label: string; hint: string }[] = [
    { value: 'system', label: 'Auto', hint: 'Follows your phone or computer.' },
    { value: 'light', label: vocab.flavor.light, hint: 'Light, all the time.' },
    { value: 'dark', label: vocab.flavor.dark, hint: 'Dark, all the time.' },
  ];
  return (
    <Sheet
      open
      onClose={onDone}
      kicker={`Welcome to ${vocab.app.name}`}
      title="Pick your look"
      footer={
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Done
          </button>
        </div>
      }
    >
      <p className="lede">You can change this any time in Team → Settings.</p>
      <div className="choices" role="radiogroup" aria-label="Look">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={pref === o.value}
            className={`choice${pref === o.value ? ' is-selected' : ''}`}
            onClick={() => choose(o.value)}
          >
            <strong>{o.label}</strong>
            <small>{o.hint}</small>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
