import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getMockBackend } from '../api';
import { isApiError } from '../api/client';
import { SCENARIOS, type ScenarioName } from '../api/mock/scenarios';
import { IconFilmRoom, IconSeason, IconSeries, IconToday } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { ErrorPanel } from '../components/States';
import { formatDate, formatDayTime } from '../lib/format';
import { vocab } from '../vocab';
import { useApi, useCheckoffQueue, useQueuedOps } from './context';
import { forgetCachedMe, invalidateGameDay, useMeQuery } from './queries';
import { useNotify } from './toast';
import { useNow } from './hooks';

const TABS = [
  { to: '/', label: vocab.tabs.today, Icon: IconToday, end: true },
  { to: '/series', label: vocab.tabs.series, Icon: IconSeries, end: false },
  { to: '/film-room', label: vocab.tabs.filmRoom, Icon: IconFilmRoom, end: false },
  { to: '/season', label: vocab.tabs.season, Icon: IconSeason, end: false },
] as const;

/** Requires a session: unauthenticated users go to sign-in; offline users keep their cached profile. */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMeQuery();
  const api = useApi();
  const unauthorized = isApiError(me.error) && me.error.code === 'UNAUTHORIZED';
  useEffect(() => {
    if (unauthorized) forgetCachedMe();
  }, [unauthorized]);
  if (unauthorized) return <Navigate to="/sign-in" replace />;
  if (me.data) return children;
  if (me.isPending) {
    return (
      <div className="splash" role="status">
        <span className="splash__tile">7</span>
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  return (
    <main className="screen">
      <ErrorPanel error={me.error} onRetry={() => void me.refetch()} />
      {api.mode === 'http' ? (
        <p className="fine center">
          Running against the real API. Is it up on :8787? For demo data, run with <code>VITE_API_MODE=mock</code>.
        </p>
      ) : null}
    </main>
  );
}

function TopBar() {
  const me = useMeQuery();
  const queued = useQueuedOps();
  const pos = me.data?.position;
  const meta =
    pos?.phase === 'season'
      ? `S${pos.seasonNumber} · ${vocab.term.series} ${pos.seriesNumber}`
      : pos?.phase === 'preseason'
        ? vocab.term.preseason
        : pos?.phase === 'offseason'
          ? vocab.term.offseason
          : '';
  return (
    <header className="topbar">
      <Link to="/" className="wordmark" aria-label={`${vocab.app.name}, ${vocab.tabs.today}`}>
        <span className="wordmark__tile" aria-hidden="true">
          7
        </span>
        <span className="wordmark__text" aria-hidden="true">
          Game Series
        </span>
      </Link>
      <div className="topbar__meta">
        {queued.length > 0 ? (
          <span className="syncchip" role="status">
            {queued.length} to sync
          </span>
        ) : null}
        {me.data ? (
          <p className="topbar__date">
            <span>{formatDate(me.data.today)}</span>
            {meta ? <span className="topbar__phase">{meta}</span> : null}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function DemoBar() {
  const backend = getMockBackend();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const [open, setOpen] = useState(false);
  if (!backend) return null;

  const refresh = () => {
    // Drop unused data and refetch what is on screen (clear() alone can leave mounted
    // observers holding the old demo day).
    qc.removeQueries({ type: 'inactive' });
    void qc.resetQueries();
    setOpen(false);
    navigate('/');
  };
  const labels: Record<ScenarioName, [string, string]> = {
    midseason: ['Mid-series Friday', 'Leads 2–1 with a live game (a carried-over one-off pinch hits), a rally W and a doubleheader Saturday.'],
    rally: ['Rally Cap morning', 'Last night’s forfeit is Rally Cap eligible until 11:59 a.m.'],
    doubleheader: ['Doubleheader Saturday', 'Clinch game: two games today, one of them a makeup.'],
    preseason: [vocab.term.preseason, 'Signed up this week; Opening Day is Monday.'],
    offseason: [vocab.term.offseason, 'A full season in the books.'],
  };

  return (
    <div className="demobar">
      <span className="demobar__tag">Demo data</span>
      <span className="demobar__text">
        Mock API · {formatDayTime(now, backend.timeZone)}
      </span>
      <button type="button" className="demobar__btn" onClick={() => setOpen(true)}>
        Demo controls
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} kicker="Mock mode" title="Demo controls">
        <p className="lede">
          Everything runs in your browser against a fake API that uses the real game rules. Pick a moment in the season:
        </p>
        <ul className="scenarios">
          {SCENARIOS.map((name) => (
            <li key={name}>
              <button
                type="button"
                className={`scenario${backend.scenario === name ? ' is-current' : ''}`}
                onClick={() => {
                  backend.reset(name);
                  refresh();
                }}
              >
                <strong>{labels[name][0]}</strong>
                <small>{labels[name][1]}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              backend.advance(24 * 60 * 60 * 1000);
              refresh();
            }}
          >
            Advance one day
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              backend.reset();
              refresh();
            }}
          >
            Reset this scenario
          </button>
        </div>
        <p className="fine">The demo clock follows real time from a pinned moment, so games still lock and go final on schedule.</p>
      </Sheet>
    </div>
  );
}

/** Replays queued check-offs when back online (http mode only). */
function useOfflineSync() {
  const api = useApi();
  const queue = useCheckoffQueue();
  const qc = useQueryClient();
  const notify = useNotify();
  useEffect(() => {
    if (api.mode !== 'http') return;
    let cancelled = false;
    const run = async () => {
      if (queue.size === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      const result = await queue.replay(api);
      if (cancelled) return;
      if (result.sent > 0 || result.dropped.length > 0) invalidateGameDay(qc);
      if (result.stale > 0) notify(vocab.error.STALE_CHECKOFF, 'error');
      else if (result.dropped.length > 0) notify('A queued check-off was rejected. Showing the latest score.', 'error');
      else if (result.sent > 0 && result.remaining === 0) notify('Back online. Check-offs synced.', 'success');
    };
    void run();
    window.addEventListener('online', run);
    const unsubscribe = queue.subscribe(() => void run());
    const timer = window.setInterval(() => void run(), 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [api, queue, qc, notify]);
}

export function AppShell() {
  useOfflineSync();
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <DemoBar />
      <TopBar />
      <main id="main" className="app__main" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}>
            <Icon className="tab__icon" />
            <span className="tab__label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
