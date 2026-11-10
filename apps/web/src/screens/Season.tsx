import type { MeDto, SeasonDto } from '@7gs/contracts';
import { gamesInSeason, GAMES_PER_SEASON, HEAD_START_SERIES, seasonPace, THEME_TERMS } from '@7gs/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useCheckoffQueue } from '../app/context';
import { forgetCachedMe, useUpdateMe, useUpdateSeasonGoal } from '../app/queries';
import { errorMessage } from '../app/errors';
import { getThemePref, setThemePref, type ThemePref } from '../app/theme';
import { useNotify } from '../app/toast';
import { Stepper } from '../components/Controls';
import { Sheet } from '../components/Sheet';
import { Tile } from '../components/Tile';
import { formatTimeOfDay, formatWinPct, signed } from '../lib/format';
import { AVAILABLE_THEMES, vocab } from '../vocab';

// A function, not a constant: the labels follow the account's theme.
const statusLabel = (): Record<SeasonDto['status'], string> => ({
  upcoming: vocab.term.preseason,
  active: 'In progress',
  offseason: vocab.term.offseason,
  complete: 'Complete',
});

export const seasonStatusLabel = (status: SeasonDto['status']) => statusLabel()[status];

/** The season's game count (more in Season 1 after a Head Start) and whether a Head Start is on. */
export function seasonTotals(me: MeDto | undefined, season: SeasonDto): { total: number; headStart: boolean } {
  const pos = me?.position;
  return {
    total: me ? gamesInSeason(me, season.number) : GAMES_PER_SEASON,
    headStart: pos?.phase === 'season' && pos.seriesNumber === HEAD_START_SERIES,
  };
}

export function Standings({ season: s, total }: { season: SeasonDto; total: number }) {
  const played = s.wins + s.losses;
  const winPct = played === 0 ? null : Math.round((s.wins / played) * 1000) / 1000;
  const stats: [string, string][] = [
    [vocab.terms.runDifferential, signed(s.displayDifferential)],
    [vocab.terms.rallyWins, String(s.rallyWins)],
    [vocab.terms.seriesRecord, `${s.seriesWon}–${s.seriesLost}`],
    [vocab.terms.winStreak, String(s.currentWinStreak)],
    [vocab.terms.longestWinStreak, String(s.longestWinStreak)],
    ['Games left', String(seasonPace(s.wins, s.losses, 0, s.noDecisions, total).remaining)],
  ];
  // Suspended games that ended with no decision: neither a W nor an L.
  if (s.noDecisions > 0) stats.splice(2, 0, [vocab.terms.noDecisions, String(s.noDecisions)]);
  return (
    <>
      <section className="board board--record" aria-label={vocab.terms.record}>
        <p className="board__eyebrow">{vocab.terms.record}</p>
        <div className="record">
          <div className="record__side">
            <Tile value={s.wins} size="l" />
            <span className="record__label">{vocab.terms.win}</span>
          </div>
          <span className="record__dash" aria-hidden="true">
            –
          </span>
          <div className="record__side">
            <Tile value={s.losses} size="l" />
            <span className="record__label">{vocab.terms.loss}</span>
          </div>
          <div className="record__pct">
            <span className="record__pctnum">{formatWinPct(winPct)}</span>
            <span className="record__label">{vocab.terms.winPct}</span>
          </div>
        </div>
      </section>
      <dl className="statgrid">
        {stats.map(([label, value]) => (
          <div key={label} className="stat">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function Pace({ season: s, total }: { season: SeasonDto; total: number }) {
  if (s.winGoal === null) {
    return (
      <section className="card pace">
        <h2 className="card__title">{vocab.terms.winGoal}</h2>
        <p className="muted">No goal set. A goal turns every game into a pace race, even after a series is decided.</p>
      </section>
    );
  }
  const pace = seasonPace(s.wins, s.losses, s.winGoal, s.noDecisions, total);
  const pct = (n: number) => `${Math.min(100, (n / s.winGoal!) * 100)}%`;
  const gb = Math.abs(pace.gamesBehind).toFixed(1);
  const verdict = !pace.goalStillPossible
    ? 'Out of reach this season'
    : pace.gamesBehind === 0
      ? 'Right on pace'
      : pace.onPace
        ? `${gb} games ahead of pace`
        : `${gb} ${vocab.terms.gamesBehind}`;
  return (
    <section className="card pace" aria-labelledby="pace-title">
      <header className="card__head">
        <h2 id="pace-title" className="card__title">
          Pace · goal {s.winGoal} wins
        </h2>
        <p className={`pace__verdict pace__verdict--${pace.onPace ? 'ahead' : 'behind'}`}>{verdict}</p>
      </header>
      <div
        className="pacebar"
        role="meter"
        aria-label="Wins toward goal"
        aria-valuemin={0}
        aria-valuemax={s.winGoal}
        aria-valuenow={s.wins}
        aria-valuetext={`${s.wins} of ${s.winGoal} wins; goal pace is ${pace.expectedWins}`}
      >
        <span className="pacebar__fill" style={{ width: pct(s.wins) }} />
        <span className="pacebar__mark" style={{ left: pct(pace.expectedWins) }} title={`Goal pace: ${pace.expectedWins}`} />
      </div>
      <dl className="pace__facts">
        <div>
          <dt>Wins</dt>
          <dd>{s.wins}</dd>
        </div>
        <div>
          <dt>Goal pace</dt>
          <dd>{pace.expectedWins}</dd>
        </div>
        <div>
          <dt>Projected</dt>
          <dd>{pace.projectedWins ?? '—'}</dd>
        </div>
        <div>
          <dt>Still needed</dt>
          <dd>
            {pace.winsNeeded} <small>in {pace.remaining}</small>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function GoalCard({
  season: s,
  total,
  phase,
  headStart,
}: {
  season: SeasonDto;
  total: number;
  phase: MeDto['position']['phase'];
  headStart: boolean;
}) {
  const update = useUpdateSeasonGoal();
  // A reasonable default: a bit better than winning 4 of every 7.
  const suggested = Math.round(total * 0.6);
  const [goal, setGoal] = useState(s.winGoal ?? suggested);
  useEffect(() => setGoal(s.winGoal ?? suggested), [s.winGoal, suggested]);
  // During a Head Start the goal stays open until Opening Day.
  const open = headStart || (s.status === 'upcoming' && phase !== 'season');
  return (
    <section className="card goal" aria-labelledby="goal-title">
      <header className="card__head">
        <h2 id="goal-title" className="card__title">
          Set the {vocab.terms.winGoal.toLowerCase()}
        </h2>
        <p className="card__sub">
          {open
            ? headStart
              ? `Out of ${total} games, Head Start included. Locks on Opening Day.`
              : `Out of ${total} games. Locked once the season starts.`
            : phase === 'offseason'
              ? `Next season’s goal can’t be set from here yet.`
              : `Goals are set in ${vocab.term.preseason} or ${vocab.term.offseason}.`}
        </p>
      </header>
      {open ? (
        <div className="goal__row">
          <Stepper label={`${vocab.terms.winGoal} (wins)`} value={goal} min={1} max={total} onChange={setGoal} />
          <button
            type="button"
            className="btn btn--primary"
            disabled={update.isPending || goal === s.winGoal}
            onClick={() => update.mutate({ seasonId: s.id, winGoal: goal })}
          >
            Save goal
          </button>
        </div>
      ) : (
        <p className="goal__locked">
          {s.winGoal !== null ? `${s.winGoal} wins` : 'No goal'} · <span className="muted">locked</span>
        </p>
      )}
    </section>
  );
}

export function Clubhouse({ me }: { me: MeDto }) {
  const api = useApi();
  const queue = useCheckoffQueue();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(me.displayName);
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const nameId = useId();
  const themeId = useId();
  const sportId = useId();
  const [deleting, setDeleting] = useState(false);
  // Signing out and deleting both leave nothing of this account on the device.
  const leave = async () => {
    queue.clear();
    forgetCachedMe();
    qc.clear();
    try {
      // Don't leave this account's cached API responses on the device.
      if (typeof caches !== 'undefined') await caches.delete('7gs-api');
    } catch {
      // Cache Storage unavailable (insecure context or tests).
    }
    navigate('/sign-in', { replace: true });
  };
  const logout = useMutation({ mutationFn: () => api.call('logout'), onSettled: leave });

  return (
    <section className="card clubhouse" aria-labelledby="clubhouse-title">
      <header className="card__head">
        <h2 id="clubhouse-title" className="card__title">
          Team & account
        </h2>
        <p className="card__sub">{me.email}</p>
      </header>
      <form
        className="field clubhouse__name"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== me.displayName) updateMe.mutate({ displayName: name.trim() });
        }}
      >
        <label className="field__label" htmlFor={nameId}>
          Team name
        </label>
        <div className="addtask__row">
          <input id={nameId} className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={!name.trim() || name.trim() === me.displayName || updateMe.isPending}>
            Save
          </button>
        </div>
      </form>
      <dl className="facts">
        <div>
          <dt>Time zone</dt>
          <dd>{me.timezone}</dd>
        </div>
        <div>
          <dt>Default {vocab.term.lockedAt.toLowerCase()}</dt>
          <dd>{me.defaultLockTime ? formatTimeOfDay(me.defaultLockTime) : 'First check-off'}</dd>
        </div>
      </dl>
      <div className="field">
        <span className="field__label" id={sportId}>
          Sport
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby={sportId}>
          {AVAILABLE_THEMES.map((sport) => (
            <label key={sport} className={`segmented__item${me.theme === sport ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="sport"
                className="sr-only"
                checked={me.theme === sport}
                disabled={updateMe.isPending}
                onChange={() => updateMe.mutate({ theme: sport })}
              />
              {THEME_TERMS[sport].name}
            </label>
          ))}
        </div>
        <p className="field__hint">Changes the words and the look, never the rules or your record.</p>
      </div>
      <div className="field">
        <span className="field__label" id={themeId}>
          Look
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby={themeId}>
          {(['system', 'light', 'dark'] as const).map((pref) => (
            <label key={pref} className={`segmented__item${theme === pref ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="theme"
                className="sr-only"
                checked={theme === pref}
                onChange={() => {
                  setTheme(pref);
                  setThemePref(pref);
                }}
              />
              {pref === 'system' ? 'Auto' : pref === 'light' ? vocab.flavor.light : vocab.flavor.dark}
            </label>
          ))}
        </div>
      </div>
      <div className="clubhouse__exit">
        <button type="button" className="btn btn--quiet btn--danger-text" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </button>
        <button type="button" className="clubhouse__delete" onClick={() => setDeleting(true)}>
          Delete account
        </button>
      </div>
      <DeleteAccountSheet open={deleting} email={me.email} onClose={() => setDeleting(false)} onDeleted={leave} />
    </section>
  );
}

function DeleteAccountSheet({
  open,
  email,
  onClose,
  onDeleted,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const api = useApi();
  const notify = useNotify();
  const [typed, setTyped] = useState('');
  const confirmId = useId();
  const matches = typed.trim().toLowerCase() === email;
  const remove = useMutation({
    mutationFn: () => api.call('deleteMe', { body: { confirmEmail: typed.trim() } }),
    onSuccess: async () => {
      await onDeleted();
      notify('Your account and all its data were deleted.', 'success');
    },
  });
  const close = () => {
    if (remove.isPending) return;
    setTyped('');
    remove.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      kicker="Settings"
      title="Delete your account?"
      footer={
        <div className="actions">
          <button type="button" className="btn btn--quiet" onClick={close} disabled={remove.isPending}>
            Keep my account
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => remove.mutate()}
            disabled={!matches || remove.isPending}
          >
            {remove.isPending ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      }
    >
      <p>
        This permanently deletes every season, series and game, your tasks and {vocab.flavor.rotation.toLowerCase()}, and your {vocab.terms.comebackTokens} and
        Rainouts. It signs you out on every device. <strong>It can’t be undone.</strong>
      </p>
      <p className="fine">You can sign up again later with the same email, but you’ll start from scratch.</p>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches && !remove.isPending) remove.mutate();
        }}
      >
        <label className="field__label" htmlFor={confirmId}>
          Type <span className="deleteacct__email">{email}</span> to confirm
        </label>
        <input
          id={confirmId}
          className="input"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </form>
      {remove.isError ? <p className="notice notice--error">{errorMessage(remove.error)}</p> : null}
    </Sheet>
  );
}
