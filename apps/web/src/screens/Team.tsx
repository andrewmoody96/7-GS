// Team: the season at a glance (record, pace, goal) and the sections that run the team.
// Management (Coaching in basketball and hockey) holds the planning: This Week (only this
// week's days), Default Lineups (what every new week starts with) and Injuries. Then Team
// History and Settings.

import type { StarterDto, TaskDto } from '@7gs/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCareerQuery,
  useCurrentSeasonQuery,
  useMeQuery,
  useSeasonSeriesQuery,
  useSeasonsQuery,
  useStartersQuery,
  useTasksQuery,
} from '../app/queries';
import { useTasksModal } from '../app/tasksModal';
import { IconChevronRight, IconInfo, IconWarning } from '../components/icons';
import { RemindersCard } from '../components/RemindersCard';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { AllowanceChips, IlExplainer, TaskGroup, TaskSheet } from '../components/TaskViews';
import { formatRange, formatTimeOfDay, formatWinPct, signed } from '../lib/format';
import type { CareerDto, SeasonDto, SeriesSummaryDto } from '@7gs/contracts';
import { vocab } from '../vocab';
import { Clubhouse, GoalCard, Pace, seasonStatusLabel, seasonTotals, Standings } from './Season';
import { WeekCardView } from './WeekCard';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const TEAM_SECTIONS = {
  lineups: 'This Week',
  rotation: 'Default Lineups',
  il: 'Injuries',
  history: 'Team History',
  settings: 'Settings',
} as const;

/** A Team sub-page: a "Team /" breadcrumb back to the overview, then the title. */
function SubPage({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={`screen screen--team${className ? ` ${className}` : ''}`}>
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            <Link to="/team">{vocab.tabs.team}</Link> /
          </p>
          <h1 className="screen__title">{title}</h1>
        </div>
      </header>
      {children}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

export function TeamScreen() {
  const season = useCurrentSeasonQuery();
  const me = useMeQuery();
  const tasks = useTasksQuery();
  if (season.isPending) return <Loading label="Loading your team" />;
  if (season.isError) return <ErrorPanel error={season.error} onRetry={() => void season.refetch()} />;
  const s = season.data;
  const injured = (tasks.data ?? []).filter((t) => t.status === 'injured').length;
  const totals = s ? seasonTotals(me.data, s) : null;
  return (
    <div className="screen screen--team">
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            {s ? `${vocab.term.season} ${s.number} · ${seasonStatusLabel(s.status)} · ${formatRange(s.startDate, s.playEndDate)}` : vocab.tabs.team}
          </p>
          <h1 className="screen__title">{me.data?.displayName ?? vocab.tabs.team}</h1>
        </div>
        <AllowanceChips allowances={me.data?.allowances} />
      </header>
      {s && totals ? <Standings season={s} total={totals.total} /> : null}
      <nav className="teamnav" aria-label={vocab.tabs.team}>
        <h2 className="teamnav__head">{vocab.flavor.management}</h2>
        <div className="todo">
          <TeamLink to="/team/lineups" title={TEAM_SECTIONS.lineups} sub="This week’s days, one by one. Changes here don’t repeat." />
          <TeamLink to="/team/rotation" title={TEAM_SECTIONS.rotation} sub="What each weekday starts with, every new week." />
          <TeamLink
            to="/team/il"
            title={TEAM_SECTIONS.il}
            sub={
              injured > 0
                ? `${injured} ${injured === 1 ? 'task' : 'tasks'} on hold.`
                : 'Put a task on hold without it costing you games.'
            }
          />
        </div>
        <div className="todo teamnav__more">
          <TeamLink to="/team/history" title={TEAM_SECTIONS.history} sub="Past series and seasons, and your career stats." />
          <TeamLink to="/team/settings" title={TEAM_SECTIONS.settings} sub="Name, sport, look, reminders and account." />
        </div>
      </nav>
      {s && totals ? (
        <>
          <Pace season={s} total={totals.total} />
          <GoalCard season={s} total={totals.total} phase={me.data?.position.phase ?? 'season'} headStart={totals.headStart} />
        </>
      ) : (
        <EmptyState title={vocab.term.season}>
          <p>No season on the calendar yet.</p>
        </EmptyState>
      )}
    </div>
  );
}

function TeamLink({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <Link to={to} className="todo__item">
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <IconChevronRight />
    </Link>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

export function LineupsScreen() {
  return (
    <SubPage title={TEAM_SECTIONS.lineups} className="screen--board">
      <aside className="explainer explainer--plan">
        <IconInfo />
        <div>
          <p className="explainer__title">Only this week</p>
          <p>
            Changes here are for these days only and don’t repeat. Next week’s days open here on Friday. For a task you want
            every week, add it to <Link to="/team/rotation">{TEAM_SECTIONS.rotation}</Link>.
          </p>
        </div>
      </aside>
      <WeekCardView />
    </SubPage>
  );
}

export function RotationScreen() {
  return (
    <SubPage title={TEAM_SECTIONS.rotation}>
      <Rotation />
    </SubPage>
  );
}

export function InjuredListScreen() {
  const tasks = useTasksQuery();
  const me = useMeQuery();
  const [selected, setSelected] = useState<TaskDto | null>(null);
  if (tasks.isPending) return <Loading label="Loading your tasks" />;
  if (tasks.isError) return <ErrorPanel error={tasks.error} onRetry={() => void tasks.refetch()} />;
  const injured = tasks.data.filter((t) => t.status === 'injured');
  const active = tasks.data.filter((t) => t.status === 'active');
  const current = selected ? (tasks.data.find((t) => t.id === selected.id) ?? selected) : null;
  return (
    <SubPage title={TEAM_SECTIONS.il}>
      <IlExplainer />
      {injured.length > 0 ? (
        <TaskGroup title={`Sitting out · ${injured.length}`} tasks={injured} onSelect={setSelected} />
      ) : (
        <p className="muted">Nobody’s on the {vocab.terms.pausedShort} right now.</p>
      )}
      {active.length > 0 ? (
        <TaskGroup title={`Tap a task to place it on the ${vocab.terms.pausedShort}`} tasks={active} onSelect={setSelected} />
      ) : null}
      {current ? <TaskSheet task={current} today={me.data?.today ?? null} onClose={() => setSelected(null)} /> : null}
    </SubPage>
  );
}

export function SettingsScreen() {
  const me = useMeQuery();
  return (
    <SubPage title={TEAM_SECTIONS.settings}>
      <RemindersCard />
      {me.data ? <Clubhouse me={me.data} /> : <Loading label="Loading settings" />}
    </SubPage>
  );
}

// ── History and career ───────────────────────────────────────────────────────

export function HistoryScreen() {
  const career = useCareerQuery();
  const seasons = useSeasonsQuery();
  if (career.isPending || seasons.isPending) return <Loading label="Loading your history" />;
  if (career.isError) return <ErrorPanel error={career.error} onRetry={() => void career.refetch()} />;
  if (seasons.isError) return <ErrorPanel error={seasons.error} onRetry={() => void seasons.refetch()} />;
  // Upcoming seasons have nothing to look back on yet.
  const started = seasons.data.filter((s) => s.status !== 'upcoming');
  return (
    <SubPage title={TEAM_SECTIONS.history}>
      <CareerCard career={career.data} />
      {started.length === 0 ? (
        <EmptyState title="Nothing played yet">
          <p>Your seasons and series show up here once Opening Day comes.</p>
        </EmptyState>
      ) : (
        started.map((s, i) => <SeasonHistory key={s.id} season={s} defaultOpen={i === 0} />)
      )}
    </SubPage>
  );
}

function CareerCard({ career: c }: { career: CareerDto }) {
  const stats: [string, string][] = [
    [vocab.terms.record, `${c.wins}–${c.losses}`],
    [vocab.terms.winPct, formatWinPct(c.winPct)],
    [vocab.terms.seriesRecord, `${c.seriesWon}–${c.seriesLost}`],
    [vocab.terms.longestWinStreak, String(c.longestWinStreak)],
    [vocab.terms.rallyWins, String(c.rallyWins)],
    [vocab.terms.runDifferential, signed(c.displayDifferential)],
  ];
  return (
    <section className="card career" aria-labelledby="career-title">
      <header className="card__head">
        <h2 id="career-title" className="card__title">
          Career
        </h2>
        <p className="card__sub">
          {c.seasonsPlayed === 0
            ? 'Every season you play adds up here.'
            : `${c.seasonsPlayed} ${c.seasonsPlayed === 1 ? 'season' : 'seasons'} played`}
          {c.bestSeason
            ? ` · Best: ${vocab.term.season} ${c.bestSeason.number}, ${c.bestSeason.wins}–${c.bestSeason.losses}`
            : ''}
        </p>
      </header>
      <dl className="statgrid">
        {stats.map(([label, value]) => (
          <div key={label} className="stat">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const STATUS_WORD: Record<SeasonDto['status'], string> = {
  upcoming: 'Upcoming',
  active: 'In progress',
  offseason: 'Review Week',
  complete: 'Final',
};

function SeasonHistory({ season: s, defaultOpen }: { season: SeasonDto; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const series = useSeasonSeriesQuery(open ? s.id : null);
  return (
    <section className="card seasonhist" aria-label={`${vocab.term.season} ${s.number}`}>
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="disclosure seasonhist__details">
        <summary>
          <span className="seasonhist__title">
            {vocab.term.season} {s.number} · {s.wins}–{s.losses}
          </span>
          <span className="seasonhist__meta">
            {STATUS_WORD[s.status]} · {formatRange(s.startDate, s.playEndDate)} · {vocab.terms.seriesRecord} {s.seriesWon}–{s.seriesLost}
            {s.winGoal !== null ? ` · Goal ${s.winGoal}` : ''}
          </span>
        </summary>
        {series.isPending && open ? <p className="loading-line">Loading series…</p> : null}
        {series.data ? (
          <ol className="todo seasonhist__series">
            {series.data.map((x) => (
              <li key={x.id}>
                <SeriesRow series={x} />
              </li>
            ))}
          </ol>
        ) : null}
      </details>
    </section>
  );
}

function seriesOutcome(x: SeriesSummaryDto): string {
  if (x.number === 0) return `${x.wins}–${x.losses}`;
  if (x.result === 'won') return `W ${x.wins}–${x.losses}`;
  if (x.result === 'lost') return `L ${x.wins}–${x.losses}`;
  return `${x.wins}–${x.losses}`;
}

function SeriesRow({ series: x }: { series: SeriesSummaryDto }) {
  return (
    <Link to={`/team/history/series/${x.id}`} className={`todo__item seriesrow seriesrow--${x.result ?? 'open'}`}>
      <span>
        <strong>
          {vocab.seriesName(x.number)} · vs {x.opponent.name}
        </strong>
        <small>
          {formatRange(x.startDate, x.endDate)}
          {x.ironMan ? ` · ${vocab.terms.ironMan}` : ''}
        </small>
      </span>
      <span className="seriesrow__score">{seriesOutcome(x)}</span>
      <IconChevronRight />
    </Link>
  );
}

// ── Old links ────────────────────────────────────────────────────────────────

/** /film-room and /film-room?tab=… from before Team existed. */
export function FilmRoomRedirect() {
  const [params] = useSearchParams();
  const tasksModal = useTasksModal();
  const tab = params.get('tab');
  const toTasks = tab === 'tasks' || tab === 'roster';
  useEffect(() => {
    if (toTasks) tasksModal.open();
  }, [toTasks, tasksModal]);
  return <Navigate to={tab === 'rotation' ? '/team/rotation' : toTasks ? '/team' : '/team/lineups'} replace />;
}

export function StarterRedirect() {
  const { weekday } = useParams();
  return <Navigate to={`/team/rotation/${weekday ?? ''}`} replace />;
}

// ── Rotation ─────────────────────────────────────────────────────────────────

function Rotation() {
  const starters = useStartersQuery();
  const tasks = useTasksQuery();
  const me = useMeQuery();
  if (starters.isPending || tasks.isPending) return <Loading label={`Loading the ${vocab.flavor.rotation.toLowerCase()}`} />;
  if (starters.isError) return <ErrorPanel error={starters.error} onRetry={() => void starters.refetch()} />;
  const byId = new Map((tasks.data ?? []).map((t) => [t.id, t]));
  return (
    <section aria-label={vocab.flavor.rotation}>
      <aside className="explainer explainer--plan">
        <IconInfo />
        <div>
          <p className="explainer__title">Every week starts here</p>
          <p>
            A new week copies these when it opens (next week opens Friday). When you save a day, it also updates that day on
            weeks already open, unless the week has started. To change one day only, use{' '}
            <Link to="/team/lineups">{TEAM_SECTIONS.lineups}</Link>.
          </p>
        </div>
      </aside>
      <ol className="rotation">
        {(starters.data ?? []).map((s) => (
          <li key={s.weekday}>
            <StarterCard starter={s} tasks={byId} defaultLockTime={me.data?.defaultLockTime ?? null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StarterCard({
  starter,
  tasks,
  defaultLockTime,
}: {
  starter: StarterDto;
  tasks: Map<string, TaskDto>;
  defaultLockTime: string | null;
}) {
  const musts = starter.lineup.filter((s) => s.required).length;
  const injured = [...starter.lineup, ...starter.bench].filter((s) => tasks.get(s.taskId)?.status === 'injured').length;
  const lock = starter.lockTime ?? defaultLockTime;
  return (
    <Link to={`/team/rotation/${starter.weekday}`} className="starter-card">
      <span className="starter-card__day">{WEEKDAYS[starter.weekday - 1]}</span>
      <span className="starter-card__body">
        <span className="starter-card__name">{starter.name}</span>
        <span className="starter-card__meta">
          {vocab.terms.threshold} {starter.threshold} · {starter.lineup.length} in {vocab.terms.lineup.toLowerCase()} · {musts}{' '}
          {musts === 1 ? vocab.term.required.toLowerCase() : `${vocab.term.required.toLowerCase()}s`}
          {starter.minTasks !== null ? ` · min ${starter.minTasks}` : ''}
        </span>
        <span className="starter-card__meta">
          {lock ? vocab.lock.firstPitchAt(formatTimeOfDay(lock)) : vocab.lock.firstPitchOnCheckoff}
          {injured > 0 ? ` · ${injured} on ${vocab.terms.pausedShort}` : ''}
        </span>
        {starter.warnings.length > 0 ? (
          <span className="starter-card__warn">
            <IconWarning width={16} height={16} /> {vocab.starterWarning[starter.warnings[0]!]}
          </span>
        ) : null}
      </span>
      <IconChevronRight />
    </Link>
  );
}

