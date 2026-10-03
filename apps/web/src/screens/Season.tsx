import type { MeDto, SeasonDto } from '@7gs/contracts';
import { GAMES_PER_SEASON, seasonPace } from '@7gs/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useCheckoffQueue } from '../app/context';
import { forgetCachedMe, useCurrentSeasonQuery, useMeQuery, useUpdateMe, useUpdateSeasonGoal } from '../app/queries';
import { getThemePref, setThemePref, type ThemePref } from '../app/theme';
import { Stepper } from '../components/Controls';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { Tile } from '../components/Tile';
import { formatRange, formatTimeOfDay, formatWinPct, signed } from '../lib/format';
import { vocab } from '../vocab';
import { AllowanceChips } from './FilmRoom';

const STATUS_LABEL: Record<SeasonDto['status'], string> = {
  upcoming: vocab.term.preseason,
  active: 'In progress',
  offseason: vocab.term.offseason,
  complete: 'Complete',
};

export function SeasonScreen() {
  const season = useCurrentSeasonQuery();
  const me = useMeQuery();
  if (season.isPending) return <Loading label="Loading the season" />;
  if (season.isError) return <ErrorPanel error={season.error} onRetry={() => void season.refetch()} />;
  const s = season.data;
  return (
    <div className="screen screen--season">
      {s ? (
        <>
          <header className="screen__head">
            <div>
              <p className="screen__kicker">
                {STATUS_LABEL[s.status]} · {formatRange(s.startDate, s.playEndDate)}
              </p>
              <h1 className="screen__title">
                {vocab.term.season} {s.number}
              </h1>
            </div>
          </header>
          <Standings season={s} />
          <Pace season={s} />
          <GoalCard season={s} phase={me.data?.position.phase ?? 'season'} />
        </>
      ) : (
        <EmptyState title={vocab.term.season}>
          <p>No season on the calendar yet.</p>
        </EmptyState>
      )}
      {me.data ? <Clubhouse me={me.data} /> : null}
    </div>
  );
}

function Standings({ season: s }: { season: SeasonDto }) {
  const played = s.wins + s.losses;
  const winPct = played === 0 ? null : Math.round((s.wins / played) * 1000) / 1000;
  const stats: [string, string][] = [
    [vocab.terms.runDifferential, signed(s.runDifferential)],
    [vocab.terms.rallyWins, String(s.rallyWins)],
    [vocab.terms.seriesRecord, `${s.seriesWon}–${s.seriesLost}`],
    [vocab.terms.winStreak, String(s.currentWinStreak)],
    [vocab.terms.longestWinStreak, String(s.longestWinStreak)],
    ['Games left', String(Math.max(0, GAMES_PER_SEASON - played))],
  ];
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

function Pace({ season: s }: { season: SeasonDto }) {
  if (s.winGoal === null) {
    return (
      <section className="card pace">
        <h2 className="card__title">{vocab.terms.winGoal}</h2>
        <p className="muted">No goal set. A goal turns every game into a pace race, even after a series is decided.</p>
      </section>
    );
  }
  const pace = seasonPace(s.wins, s.losses, s.winGoal);
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

function GoalCard({ season: s, phase }: { season: SeasonDto; phase: MeDto['position']['phase'] }) {
  const update = useUpdateSeasonGoal();
  const [goal, setGoal] = useState(s.winGoal ?? 105);
  useEffect(() => setGoal(s.winGoal ?? 105), [s.winGoal]);
  const open = s.status === 'upcoming' && phase !== 'season';
  return (
    <section className="card goal" aria-labelledby="goal-title">
      <header className="card__head">
        <h2 id="goal-title" className="card__title">
          Set the {vocab.terms.winGoal.toLowerCase()}
        </h2>
        <p className="card__sub">
          {open
            ? `Out of ${GAMES_PER_SEASON} games. Locked once the season starts.`
            : phase === 'offseason'
              ? `Next season’s goal can’t be set from here yet.`
              : `Goals are set in ${vocab.term.preseason} or ${vocab.term.offseason}.`}
        </p>
      </header>
      {open ? (
        <div className="goal__row">
          <Stepper label={`${vocab.terms.winGoal} (wins)`} value={goal} min={1} max={GAMES_PER_SEASON} onChange={setGoal} />
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

function Clubhouse({ me }: { me: MeDto }) {
  const api = useApi();
  const queue = useCheckoffQueue();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(me.displayName);
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const nameId = useId();
  const themeId = useId();
  const logout = useMutation({
    mutationFn: () => api.call('logout'),
    onSettled: async () => {
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
    },
  });

  return (
    <section className="card clubhouse" aria-labelledby="clubhouse-title">
      <header className="card__head">
        <h2 id="clubhouse-title" className="card__title">
          Clubhouse
        </h2>
        <p className="card__sub">{me.email}</p>
      </header>
      <AllowanceChips allowances={me.allowances} />
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
          <dt>Default first pitch</dt>
          <dd>{me.defaultLockTime ? formatTimeOfDay(me.defaultLockTime) : 'First check-off'}</dd>
        </div>
      </dl>
      <div className="field">
        <span className="field__label" id={themeId}>
          Theme
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
              {pref === 'system' ? 'Auto' : pref === 'light' ? 'Day game' : 'Night game'}
            </label>
          ))}
        </div>
      </div>
      <button type="button" className="btn btn--quiet btn--danger-text" onClick={() => logout.mutate()} disabled={logout.isPending}>
        Sign out
      </button>
    </section>
  );
}
