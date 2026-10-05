// The weekly lineup card (GAME_DESIGN §4a): all seven days of a series. Free planning
// until the week's first pitch; after it, lineups only grow (pinch hitters, bench adds).

import type { GameDto, GameSummaryDto, TaskDto, WeekDto, WeekSummaryDto } from '@7gs/contracts';
import { localDateOf, weekday, weekDates, type LocalDate } from '@7gs/rules';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNow, useTimeZone } from '../app/hooks';
import { useAddToBench, usePatchLineup, useTasksQuery, useWeekQuery, useWeeksQuery } from '../app/queries';
import { useNotify } from '../app/toast';
import { EntryPills } from '../components/EntryPills';
import { IconCheck, IconEdit, IconLock, IconPlus, IconStar } from '../components/icons';
import { LineupEditor, type EditorState } from '../components/LineupEditor';
import { PinchHitSheet } from '../components/PinchHitSheet';
import { Sheet } from '../components/Sheet';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { formatDayTime, formatMonthDay, formatRange, formatTimeOfDay, gameScore, weekdayShort } from '../lib/format';
import { benchOf, isNoDecision, lineupOf, pinchHitRaise } from '../lib/game';
import { vocab } from '../vocab';

export function WeekCardView() {
  const weeks = useWeeksQuery();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const timeZone = useTimeZone();
  if (weeks.isPending) return <Loading label="Loading the lineup card" />;
  if (weeks.isError) return <ErrorPanel error={weeks.error} onRetry={() => void weeks.refetch()} />;
  const list = weeks.data;
  if (list.length === 0) {
    return (
      <EmptyState title={vocab.term.offseason}>
        <p>No series to plan this week. {vocab.week.nextOpensFriday}</p>
      </EmptyState>
    );
  }
  const requested = params.get('week');
  const selected = list.find((w) => w.startDate === requested) ?? list.find((w) => w.label === 'current') ?? list[0]!;
  const today = localDateOf(now, timeZone);

  return (
    <section aria-label={vocab.week.title} className="weekcard">
      {list.length > 1 ? (
        <div className="segmented segmented--small" role="tablist" aria-label="Week">
          {list.map((w) => (
            <WeekTab
              key={w.startDate}
              week={w}
              selected={w.startDate === selected.startDate}
              onSelect={() => setParams({ tab: 'week', week: w.startDate }, { replace: true })}
            />
          ))}
        </div>
      ) : weekday(today) < 5 && selected.label === 'current' ? (
        <p className="fine weekcard__opens">{vocab.week.nextOpensFriday}</p>
      ) : null}
      <WeekView key={selected.startDate} startDate={selected.startDate} today={today} timeZone={timeZone} />
    </section>
  );
}

function WeekTab({ week, selected, onSelect }: { week: WeekSummaryDto; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={selected} className="segmented__item" onClick={onSelect}>
      {week.label === 'current' ? vocab.week.thisWeek : vocab.week.nextWeek}
      {week.locked ? <IconLock width={14} height={14} title={vocab.terms.weekLocked} /> : null}
    </button>
  );
}

/** "Mon 9:00 AM": the week's first scheduled first pitch, for the planning banner. */
function firstPitchLine(week: WeekDto): string | null {
  const first = [...week.games]
    .sort((a, b) => (a.playedDate < b.playedDate ? -1 : a.playedDate > b.playedDate ? 1 : a.slot - b.slot))
    .find((g) => g.status !== 'final');
  if (!first) return null;
  return first.lockTime
    ? `${weekdayShort(first.playedDate)} ${formatTimeOfDay(first.lockTime)}`
    : `${weekdayShort(first.playedDate)}’s first check-off`;
}

function WeekView({ startDate, today, timeZone }: { startDate: LocalDate; today: LocalDate; timeZone: string }) {
  const week = useWeekQuery(startDate);
  const tasks = useTasksQuery();
  if (week.isPending) return <Loading label="Building the week’s lineups" />;
  if (week.isError) return <ErrorPanel error={week.error} onRetry={() => void week.refetch()} />;
  const w = week.data;
  const roster = tasks.data ?? [];
  return (
    <>
      <div className={`weekbanner weekbanner--${w.locked ? 'locked' : 'open'}`} role="status">
        <span className="weekbanner__icon" aria-hidden="true">
          {w.locked ? <IconLock /> : <IconEdit />}
        </span>
        <div>
          <p className="weekbanner__title">
            {w.locked ? vocab.week.lockedTitle : vocab.week.planningTitle}
            <span className="weekbanner__range">
              {vocab.term.series} {w.series.number} · {formatRange(w.startDate, w.endDate)}
            </span>
          </p>
          <p className="weekbanner__blurb">
            {w.locked ? vocab.week.lockedBlurb : vocab.week.planningBlurb(firstPitchLine(w))}
          </p>
          {w.locked && w.lockedAt ? (
            <p className="weekbanner__fine">
              {vocab.term.lockedAt} {formatDayTime(w.lockedAt, timeZone)}
            </p>
          ) : null}
        </div>
      </div>
      <ol className="weekdays">
        {weekDates(w.startDate).map((date) => (
          <DayColumn
            key={date}
            date={date}
            today={today}
            games={w.games.filter((g) => g.playedDate === date).sort((a, b) => a.slot - b.slot)}
            moved={w.series.games.filter((g) => (g.postponed || g.suspended) && g.scheduledDate === date && g.playedDate !== date)}
            roster={roster}
          />
        ))}
      </ol>
    </>
  );
}

function DayColumn({
  date,
  today,
  games,
  moved,
  roster,
}: {
  date: LocalDate;
  today: LocalDate;
  games: GameDto[];
  moved: GameSummaryDto[];
  roster: TaskDto[];
}) {
  const isToday = date === today;
  return (
    <li className={`weekday${isToday ? ' is-today' : ''}`} aria-label={`${weekdayShort(date)} ${formatMonthDay(date)}`}>
      <header className="weekday__head">
        <span className="weekday__dow">{weekdayShort(date)}</span>
        <span className="weekday__date">{formatMonthDay(date)}</span>
        {isToday ? <span className="tag tag--today">Today</span> : null}
        {games.length > 1 ? <span className="tag">{vocab.term.doubleheader}</span> : null}
      </header>
      {moved.map((g) => (
        <p key={g.id} className="weekday__moved">
          {vocab.gameLabel(g.gameNumber)} ·{' '}
          {g.postponed ? `${vocab.term.postponed} → ${weekdayShort(g.playedDate)}` : vocab.suspension.movedTo(weekdayShort(g.playedDate))}
        </p>
      ))}
      {games.length === 0 && moved.length === 0 ? <p className="empty-line">No game.</p> : null}
      {games.map((g) => (
        <DayGame key={g.id} game={g} roster={roster} />
      ))}
    </li>
  );
}

function DayGame({ game, roster }: { game: GameDto; roster: TaskDto[] }) {
  const [editing, setEditing] = useState(false);
  const [pinch, setPinch] = useState<{ taskId: string | null } | null>(null);
  const [benchOpen, setBenchOpen] = useState(false);
  const patchLineup = usePatchLineup();
  const policy = game.editPolicy;
  const raise = pinchHitRaise(game);
  const oneOffs = new Set(roster.filter((t) => t.kind === 'one_off').map((t) => t.id));
  const lineup = lineupOf(game);
  const bench = benchOf(game);
  const final = game.status === 'final';

  const save = (state: EditorState) =>
    patchLineup.mutate(
      {
        gameId: game.id,
        patch: {
          threshold: state.threshold,
          minTasks: state.minTasks,
          entries: [
            ...state.lineup.map((s, i) => ({ taskId: s.taskId, position: i + 1, required: s.required, role: 'lineup' as const })),
            ...state.bench.map((s, i) => ({ taskId: s.taskId, position: i + 1, required: false, role: 'bench' as const })),
          ],
        },
      },
      { onSuccess: () => setEditing(false) },
    );

  const meta: string[] = [vocab.gameLabel(game.gameNumber)];
  if (game.slot === 2) meta.push(`${vocab.term.game} 2`);
  if (game.postponed) meta.push(`${vocab.terms.makeup} of ${weekdayShort(game.scheduledDate)}`);
  if (game.suspended) meta.push(vocab.suspension.resumedFrom(weekdayShort(game.scheduledDate)));

  return (
    <article className={`dayg dayg--${policy}`} aria-label={`${vocab.gameLabel(game.gameNumber)}: ${game.starterName}`}>
      <div className="dayg__top">
        <div className="dayg__who">
          <p className="dayg__starter">{game.starterName}</p>
          <p className="dayg__meta">{meta.join(' · ')}</p>
        </div>
        <div className="dayg__rtw" aria-label={vocab.pinchHit.thresholdLine(game.threshold, raise)}>
          <span className="dayg__rtwnum">{game.threshold}</span>
          <span className="dayg__rtwlabel">{vocab.terms.threshold}</span>
          {raise > 0 ? <span className="dayg__raise">{vocab.pinchHit.raise(raise)}</span> : null}
        </div>
      </div>
      <GameStatusLine game={game} />

      {editing ? (
        <LineupEditor game={game} tasks={roster} saving={patchLineup.isPending} onSave={save} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {lineup.length === 0 ? <p className="empty-line">Empty lineup.</p> : null}
          <ol className="daylineup" aria-label={vocab.terms.lineup}>
            {lineup.map((e) => (
              <li key={e.id} className={`daylineup__item${e.completedAt ? ' is-done' : ''}`}>
                <span className="daylineup__pos" aria-hidden="true">
                  {e.completedAt ? <IconCheck width={14} height={14} /> : e.position}
                </span>
                <span className="daylineup__name">
                  {e.taskName}
                  <span className="sr-only">{e.completedAt ? ', done' : ''}</span>
                </span>
                <span className="daylineup__runs">
                  {e.points}
                  <span className="sr-only"> {e.points === 1 ? 'run' : 'runs'}</span>
                  <span aria-hidden="true"> {vocab.terms.runsShort}</span>
                </span>
                {e.required || e.pinchHitAt || e.carriedOver || oneOffs.has(e.taskId) ? (
                  <span className="daylineup__pills">
                    <EntryPills entry={e} oneOff={oneOffs.has(e.taskId)} />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {bench.length > 0 ? (
            <div className="daybench">
              <p className="daybench__title">{vocab.term.bench}</p>
              <ul>
                {bench.map((e) => (
                  <li key={e.id} className="daybench__item">
                    <span className="daybench__name">
                      {e.taskName}
                      <span className="pill pill--runs">{e.points}</span>
                      {oneOffs.has(e.taskId) ? <span className="pill pill--oneoff">{vocab.taskKind.one_off}</span> : null}
                    </span>
                    {policy === 'additions_only' ? (
                      <button type="button" className="btn btn--small btn--quiet" onClick={() => setPinch({ taskId: e.taskId })}>
                        <IconStar width={16} height={16} /> {vocab.pinchHit.makeMustHit}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {policy === 'free' ? (
            <div className="dayg__actions">
              <button type="button" className="btn btn--small" onClick={() => setEditing(true)}>
                <IconEdit width={16} height={16} /> {vocab.week.editDay}
              </button>
            </div>
          ) : policy === 'additions_only' && !final ? (
            <div className="dayg__actions">
              <button type="button" className="btn btn--small btn--primary" onClick={() => setPinch({ taskId: null })}>
                <IconStar width={16} height={16} /> {vocab.pinchHit.action}
              </button>
              <button type="button" className="btn btn--small" onClick={() => setBenchOpen(true)}>
                <IconPlus width={16} height={16} /> {vocab.week.addToBench}
              </button>
            </div>
          ) : null}
        </>
      )}
      {policy === 'additions_only' ? (
        <>
          <PinchHitSheet game={game} open={pinch !== null} initialTaskId={pinch?.taskId ?? null} onClose={() => setPinch(null)} />
          <AddToBenchSheet game={game} roster={roster} open={benchOpen} onClose={() => setBenchOpen(false)} />
        </>
      ) : null}
    </article>
  );
}

function GameStatusLine({ game }: { game: GameDto }) {
  if (game.status === 'final') {
    if (isNoDecision(game)) {
      return <p className="dayg__status dayg__status--nd">{vocab.terms.noDecisionShort} · {vocab.terms.noDecision}</p>;
    }
    const win = game.result === 'W';
    return (
      <p className={`dayg__status dayg__status--${win ? 'win' : 'loss'}`}>
        {vocab.term.final} · {game.result} {gameScore(game)}
        {game.resultDetail && game.resultDetail !== 'clean' ? ` · ${vocab.resultDetailShort[game.resultDetail]}` : ''}
      </p>
    );
  }
  if (game.status === 'live') return <p className="dayg__status dayg__status--live">{vocab.gameStatus.live}</p>;
  return null;
}

function AddToBenchSheet({ game, roster, open, onClose }: { game: GameDto; roster: TaskDto[]; open: boolean; onClose: () => void }) {
  const add = useAddToBench();
  const notify = useNotify();
  const [taskId, setTaskId] = useState<string | null>(null);
  const inGame = new Set(game.entries.map((e) => e.taskId));
  const addable = roster.filter((t) => t.status === 'active' && !inGame.has(t.id));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker={`${vocab.gameLabel(game.gameNumber)} · ${weekdayShort(game.playedDate)} · ${game.starterName}`}
      title={vocab.week.addToBench}
      footer={
        <div className="actions">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!taskId || add.isPending}
            onClick={() => {
              const task = addable.find((t) => t.id === taskId);
              if (!task) return;
              add.mutate(
                { gameId: game.id, taskId: task.id },
                {
                  onSuccess: () => {
                    notify(`${task.name} is on the ${vocab.term.bench.toLowerCase()}.`, 'success');
                    setTaskId(null);
                    onClose();
                  },
                },
              );
            }}
          >
            Add
          </button>
        </div>
      }
    >
      <p className="lede">Bench work is optional. It only counts once subbed in for a task that isn’t a must-hit, so runs to win doesn’t change.</p>
      {addable.length === 0 ? (
        <p className="empty-line">Every active task is already in this game.</p>
      ) : (
        <fieldset className="radios">
          <legend className="sr-only">Task</legend>
          {addable.map((t) => (
            <label key={t.id} className="radio">
              <input type="radio" name={`bench-${game.id}`} checked={taskId === t.id} onChange={() => setTaskId(t.id)} />
              <span className="radio__label">
                {t.name}
                <span className="pill pill--runs">{vocab.runs(t.points)}</span>
                {t.kind === 'one_off' ? <span className="pill pill--oneoff">{vocab.taskKind.one_off}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </Sheet>
  );
}
