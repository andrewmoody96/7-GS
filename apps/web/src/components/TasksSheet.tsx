// The Add task window, opened from the + in the tab bar on any screen. Add a task and,
// if you like, put it straight into today or a later day this week. Your full task list
// lives here too: tap a task to edit it, retire it or put it on the IL.

import type { GameDto, TaskDto } from '@7gs/contracts';
import { LIMITS, type TaskKind } from '@7gs/rules';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAddTask, useMeQuery, useTasksQuery, useWeekQuery, useWeeksQuery } from '../app/queries';
import { weekdayShort } from '../lib/format';
import { vocab } from '../vocab';
import { Stepper, Switch } from './Controls';
import { IconPlus } from './icons';
import { Sheet } from './Sheet';
import { KindPicker, TaskGroup, TaskSheet } from './TaskViews';

/** Games still open to additions this week, today first. */
function schedulableGames(games: readonly GameDto[], today: string): GameDto[] {
  return games
    .filter((g) => g.playedDate >= today && g.status !== 'final' && g.editPolicy !== 'closed')
    .sort((a, b) => (a.playedDate === b.playedDate ? a.slot - b.slot : a.playedDate < b.playedDate ? -1 : 1));
}

function dayLabel(game: GameDto, today: string, games: readonly GameDto[]): string {
  const base = game.playedDate === today ? 'Today' : weekdayShort(game.playedDate);
  const doubleheader = games.some((g) => g.playedDate === game.playedDate && g.id !== game.id);
  return doubleheader ? `${base} G${game.slot}` : base;
}

export function TasksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMeQuery();
  const tasks = useTasksQuery();
  const weeks = useWeeksQuery();
  // The week being played (or Opening Week); falls back to next week during Review Week.
  const week = weeks.data?.find((w) => w.label !== 'next') ?? weeks.data?.[0] ?? null;
  const card = useWeekQuery(open ? (week?.startDate ?? null) : null);
  const add = useAddTask();
  const [editing, setEditing] = useState<TaskDto | null>(null);

  const [name, setName] = useState('');
  const [points, setPoints] = useState(1);
  const [kind, setKind] = useState<TaskKind>('recurring');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mustHit, setMustHit] = useState(true);
  const nameId = useId();
  const whenId = useId();

  useEffect(() => {
    if (!open) return;
    setName('');
    setPoints(1);
    setKind('recurring');
    setGameId(null);
    setMustHit(true);
  }, [open]);

  const today = me.data?.today ?? '';
  const games = card.data ? schedulableGames(card.data.games, today) : [];
  const game = games.find((g) => g.id === gameId) ?? null;
  const started = game?.editPolicy === 'additions_only';
  const isToday = game?.playedDate === today;
  // Once the week has started, a task added to today is always a must-hit.
  const canChoose = game !== null && !(started && isToday);
  const required = started && isToday ? true : mustHit;

  const all = tasks.data ?? [];
  const active = all.filter((t) => t.status === 'active');
  const injured = all.filter((t) => t.status === 'injured');
  const retired = all.filter((t) => t.status === 'retired');
  const current = editing ? (all.find((t) => t.id === editing.id) ?? editing) : null;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || add.isPending) return;
    add.mutate(
      { body: { name: name.trim(), points, kind }, schedule: game ? { game, required } : null },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        kicker={vocab.terms.roster}
        title="Add a task"
        footer={
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" disabled={!name.trim() || add.isPending} onClick={() => submit()}>
              <IconPlus /> {add.isPending ? 'Adding…' : 'Add task'}
            </button>
          </div>
        }
      >
        <form className="form addtask-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor={nameId} className="field__label">
              Task
            </label>
            <input
              id={nameId}
              className="input"
              value={name}
              maxLength={LIMITS.taskNameMax}
              placeholder="e.g. Call the dentist"
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Stepper label="Worth" value={points} min={1} max={LIMITS.pointsMax} suffix={points === 1 ? 'run' : 'runs'} onChange={setPoints} />
          <KindPicker value={kind} onChange={setKind} name="addtask-kind" />

          {games.length > 0 ? (
            <div className="field">
              <span className="field__label" id={whenId}>
                Put it in a lineup
              </span>
              <div className="daychips" role="radiogroup" aria-labelledby={whenId}>
                <label className={`daychip${gameId === null ? ' is-selected' : ''}`}>
                  <input type="radio" name="addtask-when" className="sr-only" checked={gameId === null} onChange={() => setGameId(null)} />
                  Not yet
                </label>
                {games.map((g) => (
                  <label key={g.id} className={`daychip${gameId === g.id ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="addtask-when"
                      className="sr-only"
                      checked={gameId === g.id}
                      onChange={() => setGameId(g.id)}
                    />
                    {dayLabel(g, today, games)}
                  </label>
                ))}
              </div>
              <p className="field__hint">
                {game === null
                  ? 'It goes on your task list. You can put it in any day’s lineup later.'
                  : !started
                    ? `This week hasn’t started, so this is just planning: runs to win stays ${game.threshold}.`
                    : isToday
                      ? `The week has started, so a task added to today is a must-hit. Runs to win goes ${game.threshold} → ${game.threshold + points}.`
                      : `Runs to win goes ${game.threshold} → ${game.threshold + points}, so the day gets no easier.`}
              </p>
            </div>
          ) : null}

          {canChoose ? (
            <div className="field musthit-choice">
              <Switch label={vocab.pinchHit.mustHitSwitch} checked={mustHit} onChange={setMustHit} />
              <p className="field__hint">{mustHit ? vocab.pinchHit.mustHitOn : vocab.pinchHit.mustHitOff}</p>
            </div>
          ) : null}
        </form>

        <details className="disclosure">
          <summary>
            Your {vocab.terms.roster.toLowerCase()} · {active.length + injured.length}
          </summary>
          {all.length === 0 ? <p className="muted">Nothing yet. Add the habits and to-dos you want to get done.</p> : null}
          {active.length > 0 ? <TaskGroup title={`Active · ${active.length}`} tasks={active} onSelect={setEditing} /> : null}
          {injured.length > 0 ? (
            <TaskGroup title={`${vocab.term.paused} · ${injured.length}`} tasks={injured} onSelect={setEditing} />
          ) : null}
          {retired.length > 0 ? <TaskGroup title={`Retired · ${retired.length}`} tasks={retired} onSelect={setEditing} /> : null}
        </details>
      </Sheet>
      {current ? <TaskSheet task={current} today={me.data?.today ?? null} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
