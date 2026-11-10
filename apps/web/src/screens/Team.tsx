// Team: the season at a glance (record, pace, goal) and the sections that run the team:
// this week's lineups, the weekday rotation, the Injured List and settings.

import type { StarterDto, TaskDto } from '@7gs/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useCurrentSeasonQuery, useMeQuery, useStartersQuery, useTasksQuery } from '../app/queries';
import { useTasksModal } from '../app/tasksModal';
import { IconChevronRight, IconWarning } from '../components/icons';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { AllowanceChips, IlExplainer, TaskGroup, TaskSheet } from '../components/TaskViews';
import { formatRange, formatTimeOfDay } from '../lib/format';
import { vocab } from '../vocab';
import { Clubhouse, GoalCard, Pace, SEASON_STATUS_LABEL, seasonTotals, Standings } from './Season';
import { WeekCardView } from './WeekCard';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const TEAM_SECTIONS = {
  lineups: 'This week’s lineups',
  rotation: 'Rotation',
  il: vocab.term.paused,
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
            {s ? `${vocab.term.season} ${s.number} · ${SEASON_STATUS_LABEL[s.status]} · ${formatRange(s.startDate, s.playEndDate)}` : vocab.tabs.team}
          </p>
          <h1 className="screen__title">{me.data?.displayName ?? vocab.tabs.team}</h1>
        </div>
        <AllowanceChips allowances={me.data?.allowances} />
      </header>
      {s && totals ? <Standings season={s} total={totals.total} /> : null}
      <nav className="todo teamnav" aria-label={vocab.tabs.team}>
        <TeamLink to="/team/lineups" title={TEAM_SECTIONS.lineups} sub="Plan each day and add to days already under way." />
        <TeamLink to="/team/rotation" title={TEAM_SECTIONS.rotation} sub="Your default lineup for each weekday." />
        <TeamLink
          to="/team/il"
          title={TEAM_SECTIONS.il}
          sub={injured > 0 ? `${injured} ${injured === 1 ? 'task' : 'tasks'} sitting out.` : 'Rest a task without lowering the bar.'}
        />
        <TeamLink to="/team/settings" title={TEAM_SECTIONS.settings} sub="Team name, theme, sign out and your account." />
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
        <TaskGroup title="Tap a task to place it on the IL" tasks={active} onSelect={setSelected} />
      ) : null}
      {current ? <TaskSheet task={current} today={me.data?.today ?? null} onClose={() => setSelected(null)} /> : null}
    </SubPage>
  );
}

export function SettingsScreen() {
  const me = useMeQuery();
  return <SubPage title={TEAM_SECTIONS.settings}>{me.data ? <Clubhouse me={me.data} /> : <Loading label="Loading settings" />}</SubPage>;
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
  if (starters.isPending || tasks.isPending) return <Loading label="Loading the rotation" />;
  if (starters.isError) return <ErrorPanel error={starters.error} onRetry={() => void starters.refetch()} />;
  const byId = new Map((tasks.data ?? []).map((t) => [t.id, t]));
  return (
    <section aria-label="Rotation">
      <p className="lede">
        Your default plan for each weekday, used to fill in future weeks. It doesn’t change days already on this week’s{' '}
        {vocab.week.title}. To add a task to this week, use <strong>+ Add task</strong> or <Link to="/team/lineups">{TEAM_SECTIONS.lineups}</Link>.
      </p>
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

