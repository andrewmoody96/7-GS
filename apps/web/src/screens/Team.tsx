// Team: the season at a glance (record, pace, goal) and the sections that run the team.
// Management (Coaching in basketball and hockey) is one page holding the planning: This
// Week (only this week's days), Default Lineups (what every new week starts with) and
// Injuries. Then Team History and Settings.

import type { StarterDto, TaskDto } from '@7gs/contracts';
import type { LocalDate } from '@7gs/rules';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  useCareerQuery,
  useCurrentSeasonQuery,
  useMeQuery,
  useSaveWeekPlan,
  useSeasonSeriesQuery,
  useSeasonsQuery,
  useStandingsQuery,
  useStartersQuery,
  useTasksQuery,
} from '../app/queries';
import { useTasksModal } from '../app/tasksModal';
import { IconChevronRight, IconInfo, IconWarning } from '../components/icons';
import { RemindersCard } from '../components/RemindersCard';
import { initialPlan, samePlan, WeekPlanGrid, weekPlanBodies } from '../components/WeekPlanGrid';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { AllowanceChips, IlExplainer, TaskGroup, TaskSheet } from '../components/TaskViews';
import { formatRange, formatTimeOfDay, formatWinPct, signed } from '../lib/format';
import type { CareerDto, SeasonDto, SeriesSummaryDto } from '@7gs/contracts';
import { vocab } from '../vocab';
import { Clubhouse, GoalCard, Pace, seasonStatusLabel, seasonTotals, Standings, type StatItem } from './Season';
import { WeekCardView } from './WeekCard';
import { TeamBadge } from '../components/Badges';
import { ReleaseNoteView } from '../components/WhatsNew';
import { APP_VERSION, latestVersionOf, RELEASES, SINCE_LAST_MAJOR, versionLabel } from '../releaseNotes';
import { useBadgeCount } from './Badges';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const TEAM_SECTIONS = {
  lineups: 'This Week',
  rotation: 'Default Lineups',
  il: 'Injuries',
  history: 'Team History',
  settings: 'Settings',
} as const;

/** A Team sub-page: a "Team /" breadcrumb back to the overview, then the title. */
function SubPage({
  title,
  className,
  inManagement = false,
  children,
}: {
  title: string;
  className?: string;
  /** Under Management: the breadcrumb runs Team / Management /. */
  inManagement?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`screen screen--team${className ? ` ${className}` : ''}`}>
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            <Link to="/team">{vocab.tabs.team}</Link> /
            {inManagement ? (
              <>
                {' '}
                <Link to="/team/management">{vocab.flavor.management}</Link> /
              </>
            ) : null}
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
  const career = useCareerQuery();
  const badges = useBadgeCount();
  if (season.isPending) return <Loading label="Loading your team" />;
  if (season.isError) return <ErrorPanel error={season.error} onRetry={() => void season.refetch()} />;
  const s = season.data;
  const totals = s ? seasonTotals(me.data, s) : null;
  return (
    <div className="screen screen--team">
      <header className="screen__head teamhead">
        {/* The season line and the chips run full width; the name and the big photo share the row between. */}
        <p className="screen__kicker teamhead__kicker">
          {s ? `${vocab.term.season} ${s.number} · ${seasonStatusLabel(s.status)} · ${formatRange(s.startDate, s.playEndDate)}` : vocab.tabs.team}
        </p>
        <FitName name={me.data?.displayName ?? vocab.tabs.team} />
        {/* The name is right there, so the photo shows on its own here. */}
        <TeamBadge name={me.data?.displayName ?? vocab.tabs.team} size={160} plain />
        <div className="teamhead__chips">
          <AllowanceChips allowances={me.data?.allowances} />
        </div>
      </header>
      {s && totals ? (
        <Standings
          season={s}
          total={totals.total}
          afterBoard={<StandingsLine seasonId={s.id} />}
          extra={[badgesStat(badges), ...titleStats(career.data)]}
        />
      ) : null}
      <nav className="todo teamnav" aria-label={vocab.tabs.team}>
        <TeamLink to="/team/management" title={vocab.flavor.management} sub="This Week, Default Lineups and Injuries." />
        <TeamLink to="/team/history" title={TEAM_SECTIONS.history} sub="Past series and seasons, and your career stats." />
        <TeamLink to="/team/settings" title={TEAM_SECTIONS.settings} sub="Name, sport, look, reminders and account." />
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

export function ManagementScreen() {
  const tasks = useTasksQuery();
  const injured = (tasks.data ?? []).filter((t) => t.status === 'injured').length;
  return (
    <SubPage title={vocab.flavor.management}>
      <nav className="todo teamnav" aria-label={vocab.flavor.management}>
        <TeamLink to="/team/lineups" title={TEAM_SECTIONS.lineups} sub="This week’s days, one by one. Changes here don’t repeat." />
        <TeamLink to="/team/rotation" title={TEAM_SECTIONS.rotation} sub="What each weekday starts with, every new week." />
        <TeamLink
          to="/team/il"
          title={TEAM_SECTIONS.il}
          sub={injured > 0 ? `${injured} ${injured === 1 ? 'task' : 'tasks'} on hold.` : 'Put a task on hold without it costing you games.'}
        />
      </nav>
    </SubPage>
  );
}

/** The team name's size range on the Team page, in px. */
const NAME_MIN_PX = 24;
const NAME_MAX_PX = 96;

/**
 * The team name, sized to its space: as large as it can be while its longest word fits the
 * column beside the photo and the whole name is no taller than the photo. Every word uses
 * that one size. Found by a short search (wrapping changes as the size does), and redone
 * when the column's width changes or the fonts load. A single word too long even at the
 * smallest size may break across lines.
 */
function FitName({ name }: { name: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [fit, setFit] = useState<{ size: number; squeeze: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastWidth = -1;
    const measure = (force = false) => {
      const available = el.clientWidth;
      if (!available || (!force && available === lastWidth)) return;
      lastWidth = available;
      const photo = el.parentElement?.querySelector<HTMLElement>(':scope > .badge');
      const photoHeight = photo?.getBoundingClientRect().height ?? 0;
      const words = [...el.querySelectorAll<HTMLElement>('.teamhead__word')];
      // Measure words whole, even if the last fit let a long one break.
      el.dataset.measuring = '';
      const fits = (px: number) => {
        el.style.fontSize = `${px}px`;
        const widest = Math.max(0, ...words.map((w) => w.getBoundingClientRect().width));
        const height = el.getBoundingClientRect().height;
        return widest <= available + 0.5 && (!photoHeight || height <= photoHeight);
      };
      let best: { size: number; squeeze: boolean };
      if (fits(NAME_MAX_PX)) best = { size: NAME_MAX_PX, squeeze: false };
      else if (!fits(NAME_MIN_PX)) best = { size: NAME_MIN_PX, squeeze: true };
      else {
        let lo = NAME_MIN_PX;
        let hi = NAME_MAX_PX;
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        best = { size: lo, squeeze: false };
      }
      el.style.fontSize = `${best.size}px`;
      delete el.dataset.measuring;
      setFit((prev) => (prev && prev.size === best.size && prev.squeeze === best.squeeze ? prev : best));
    };
    measure(true);
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    let live = true;
    void document.fonts?.ready.then(() => live && measure(true));
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [name]);
  const words = name.trim().split(/\s+/);
  return (
    <h1
      ref={ref}
      className={`screen__title teamhead__name${fit?.squeeze ? ' is-squeezed' : ''}`}
      style={fit ? { fontSize: `${fit.size}px` } : undefined}
    >
      {words.map((word, i) => (
        <span key={i}>
          <span className="teamhead__word">{word}</span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </h1>
  );
}

/** Team → Badges, with how many are collected. */
/** Badges as a stat tile that opens the collection. */
function badgesStat(count: number | null): StatItem {
  return { label: 'Badges', value: count === null ? '–' : String(count), to: '/team/badges' };
}

/** Championships across every season, for the team stats. */
function titleStats(c: CareerDto | undefined): StatItem[] {
  return [
    { label: 'Division titles', value: c ? String(c.divisionTitles) : '–' },
    { label: 'Conference titles', value: c ? String(c.conferenceTitles) : '–' },
    { label: 'League titles', value: c ? String(c.leagueTitles) : '–' },
  ];
}

const ORDINAL = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Under the record: where the team stands in its division, opening the full standings. */
function StandingsLine({ seasonId }: { seasonId: string }) {
  const standings = useStandingsQuery(seasonId);
  let text = 'Standings';
  if (standings.data) {
    const conference = standings.data.conferences.find((l) => l.yours)!;
    const division = conference.divisions.find((d) => d.yours)!;
    const place = division.rows.findIndex((r) => r.you) + 1;
    const me = division.rows[place - 1]!;
    const where = `${conference.abbreviation} ${division.name}`;
    const played = division.rows.some((r) => r.wins + r.losses > 0);
    text = !played
      ? `${where} · Standings`
      : me.gamesBack === 0
        ? `${ORDINAL(place)} in the ${where}`
        : `${ORDINAL(place)} in the ${where} · ${me.gamesBack} GB`;
  }
  return (
    <Link to="/team/standings" className="standingsline">
      <span>{text}</span>
      <IconChevronRight aria-hidden="true" />
    </Link>
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
    <SubPage title={TEAM_SECTIONS.lineups} className="screen--board" inManagement>
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

/**
 * Settings → What's changed: the current version (with its fixes), the one before it, and
 * a summary of everything since the last major release. Opens at the top.
 */
export function ChangesScreen() {
  const [current, previous] = RELEASES;
  return (
    <SubPage title="What’s changed">
      <p className="muted">You’re on {versionLabel(APP_VERSION)}.</p>
      {[current, previous].map((note, i) =>
        note ? (
          <section key={note.id} className="card changes__release">
            <header className="changes__head">
              <h2 className="card__title">{versionLabel(latestVersionOf(note) ?? note.title)}</h2>
              <span className={`changes__tag${i === 0 ? ' is-current' : ''}`}>{i === 0 ? 'Current version' : 'Previous version'}</span>
            </header>
            <ReleaseNoteView note={note} showTitle={false} />
          </section>
        ) : null,
      )}
      <section className="card changes__release">
        <header className="changes__head">
          <h2 className="card__title">{SINCE_LAST_MAJOR.title}</h2>
          <span className="changes__tag">Since {SINCE_LAST_MAJOR.since}</span>
        </header>
        <ul className="whatsnew__list">
          {SINCE_LAST_MAJOR.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </SubPage>
  );
}

export function RotationScreen() {
  return (
    <SubPage title={TEAM_SECTIONS.rotation} inManagement>
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
    <SubPage title={TEAM_SECTIONS.il} inManagement>
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
      {me.data?.isAdmin ? (
        <nav className="todo teamnav" aria-label="Admin">
          <TeamLink to="/team/admin/accounts" title="Accounts" sub="Who’s signed up, and when each account was last seen." />
        </nav>
      ) : null}
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
    ...titleStats(c).map((x): [string, string] => [x.label, x.value]),
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
          {s.titles?.division || s.titles?.conference || s.titles?.league ? (
            <span className="seasonhist__titles">
              🏆{' '}
              {[
                s.titles.division ? 'Division champions' : null,
                s.titles.conference ? 'Conference champions' : null,
                s.titles.league ? 'League champions' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </summary>
        {series.isPending && open ? <p className="loading-line">Loading series…</p> : null}
        {open ? (
          <p className="seasonhist__standings">
            <Link to={`/team/standings?season=${s.id}`}>Standings</Link>
          </p>
        ) : null}
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
  if (tasks.isError) return <ErrorPanel error={tasks.error} onRetry={() => void tasks.refetch()} />;
  const all = tasks.data ?? [];
  const byId = new Map(all.map((t) => [t.id, t]));
  const saved = starters.data ?? [];
  return (
    <section aria-label={vocab.flavor.rotation}>
      <aside className="explainer explainer--plan">
        <IconInfo />
        <div>
          <p className="explainer__title">Every week starts here</p>
          <p>
            A new week copies these when it opens (next week opens Friday). Saving also updates those days on weeks already open,
            unless the week has started. To change one day only, use <Link to="/team/lineups">{TEAM_SECTIONS.lineups}</Link>.
          </p>
        </div>
      </aside>
      <WeekPlanCard
        // A fresh plan whenever the saved lineups change (after a save, or a day edited below).
        key={saved.map((s) => `${s.weekday}:${s.lineup.map((l) => `${l.taskId}${l.required ? '!' : ''}`).join(',')}`).join('|')}
        tasks={all}
        starters={saved}
        today={me.data?.today ?? null}
      />
      <h2 className="taskgroup__title weekplan__days">Day by day</h2>
      <p className="muted">Open a day for its name, order, {vocab.term.bench.toLowerCase()} and {vocab.terms.lockTime.toLowerCase()}.</p>
      <ol className="rotation">
        {saved.map((s) => (
          <li key={s.weekday}>
            <StarterCard starter={s} tasks={byId} defaultLockTime={me.data?.defaultLockTime ?? null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Every weekday on one grid (components/WeekPlanGrid), saved together. */
function WeekPlanCard({ tasks, starters, today }: { tasks: TaskDto[]; starters: StarterDto[]; today: string | null }) {
  const rows = useMemo(() => tasks.filter((t) => t.status === 'active' && t.kind === 'recurring'), [tasks]);
  const start = useMemo(() => initialPlan(rows, starters, { fillEmpty: false }), [rows, starters]);
  const [plan, setPlan] = useState(start);
  const save = useSaveWeekPlan();
  const dirty = !samePlan(plan, start);
  const sidelined = tasks.filter((t) => t.status === 'injured' && starters.some((s) => s.lineup.some((l) => l.taskId === t.id)));
  if (rows.length === 0) {
    return (
      <EmptyState title="No tasks yet">
        <p>Add a task with + Add task and it shows up here to plan.</p>
      </EmptyState>
    );
  }
  return (
    <section className="card weekplan" aria-label="Plan the week">
      <h2 className="card__title">Plan the week</h2>
      <WeekPlanGrid tasks={rows} allTasks={tasks} starters={starters} plan={plan} onChange={setPlan} label={vocab.flavor.rotation} />
      {sidelined.length > 0 ? (
        <p className="field__hint">
          {sidelined.map((t) => t.name).join(', ')} {sidelined.length === 1 ? 'is' : 'are'} on the {vocab.terms.pausedShort} and
          {sidelined.length === 1 ? ' keeps its' : ' keep their'} days.
        </p>
      ) : null}
      {dirty || save.isPending ? (
        <div className="weekplan__bar">
          <button type="button" className="btn btn--quiet" disabled={save.isPending} onClick={() => setPlan(start)}>
            Undo changes
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                bodies: weekPlanBodies(plan, rows, starters),
                today: (today as LocalDate | null) ?? null,
                activeIds: new Set(tasks.filter((t) => t.status === 'active').map((t) => t.id)),
              })
            }
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
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

