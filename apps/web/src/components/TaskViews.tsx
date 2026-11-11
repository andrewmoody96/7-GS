// Task views shared by the Add task window and the Team screens: the task list, a task's
// edit sheet (with the Injured List controls), the recurring/one-off picker and the
// month's allowance chips.

import type { AllowancesDto, TaskDto } from '@7gs/contracts';
import { addDays, compareDates, IL_MIN_DAYS, LIMITS, type LocalDate, type TaskKind } from '@7gs/rules';
import { useEffect, useId, useState } from 'react';
import { useActivateFromInjuredList, usePlaceOnInjuredList, useRestoreTask, useRetireTask, useUpdateTask } from '../app/queries';
import { formatDate, weekdayLong, weekdayShort } from '../lib/format';
import { isLeaving, newPointsFrom } from '../lib/tasks';
import { vocab } from '../vocab';
import { Stepper } from './Controls';
import { IconBandage, IconChevronRight, IconFlame } from './icons';
import { Sheet } from './Sheet';

export function AllowanceChips({ allowances }: { allowances: AllowancesDto | undefined }) {
  if (!allowances) return null;
  return (
    <ul className="allowances" aria-label="This month">
      <li className="allowance">
        <span className="allowance__num">{allowances.rallyTokens}</span>
        <span className="allowance__label">{vocab.terms.comebackTokens}</span>
      </li>
      <li className="allowance">
        <span className="allowance__num">{allowances.rainouts}</span>
        <span className="allowance__label">
          {vocab.terms.rainouts}
          {allowances.ironManBonusHeld ? <small> incl. {vocab.terms.ironMan}</small> : null}
        </span>
      </li>
    </ul>
  );
}

export function IlExplainer() {
  return (
    <aside className="explainer">
      <IconBandage />
      <div>
        <p className="explainer__title">{vocab.term.paused}</p>
        <p>{vocab.il.explainer}</p>
        <p>{vocab.il.minimum(IL_MIN_DAYS)}</p>
      </div>
    </aside>
  );
}

export function TaskGroup({ title, tasks, onSelect }: { title: string; tasks: TaskDto[]; onSelect: (t: TaskDto) => void }) {
  return (
    <div className="taskgroup">
      {title ? <h2 className="taskgroup__title">{title}</h2> : null}
      <ul className="tasklist">
        {tasks.map((task) => (
          <li key={task.id}>
            <button type="button" className={`taskrow taskrow--${task.status}`} onClick={() => onSelect(task)}>
              <span className="taskrow__main">
                <span className="taskrow__name">{task.name}</span>
                <span className="taskrow__meta">
                  <span className="pill pill--runs">{vocab.runs(task.points)}</span>
                  {task.kind === 'one_off' ? (
                    <span className="pill pill--oneoff">
                      {vocab.taskKind.one_off}
                      {task.status === 'retired' ? ' · done' : ''}
                    </span>
                  ) : null}
                  {task.carryover && task.status !== 'retired' ? <span className="pill pill--carried">{vocab.carryoverNote}</span> : null}
                  {isLeaving(task) && task.lockedThrough ? (
                    <span className="pill pill--leaving">Leaving after {weekdayShort(task.lockedThrough)}</span>
                  ) : null}
                  {newPointsFrom(task) && !isLeaving(task) ? (
                    <span className="pill pill--carried">{vocab.runs(task.points)} from {weekdayShort(newPointsFrom(task)!)}</span>
                  ) : null}
                  {task.status === 'injured' && task.ilMinUntil ? (
                    <span className="pill pill--il">{vocab.il.eligibleOn(formatDate(task.ilMinUntil))}</span>
                  ) : null}
                </span>
              </span>
              <span className="taskrow__streak" title="Current streak · best">
                <IconFlame width={16} height={16} />
                <span>{task.currentStreak}</span>
                <small>best {task.longestStreak}</small>
              </span>
              <IconChevronRight width={18} height={18} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Recurring (stays on your task list) or one-off (retires once done). */
export function KindPicker({ value, onChange, name }: { value: TaskKind; onChange: (kind: TaskKind) => void; name: string }) {
  const labelId = useId();
  return (
    <div className="field">
      <span className="field__label" id={labelId}>
        Kind
      </span>
      <div className="segmented segmented--kind" role="radiogroup" aria-labelledby={labelId}>
        {(['recurring', 'one_off'] as const).map((kind) => (
          <label key={kind} className={`segmented__item${value === kind ? ' is-selected' : ''}`}>
            <input type="radio" name={name} className="sr-only" checked={value === kind} onChange={() => onChange(kind)} />
            {vocab.taskKind[kind]}
          </label>
        ))}
      </div>
      <p className="field__hint">
        {value === 'one_off'
          ? `Retires once done. Missed as a ${vocab.term.required.toLowerCase()}, it moves to the next game as a ${vocab.terms.pinchHitter.toLowerCase()}.`
          : 'Stays on your task list, day after day.'}
      </p>
    </div>
  );
}

export function TaskSheet({ task, today, onClose }: { task: TaskDto; today: LocalDate | null; onClose: () => void }) {
  const update = useUpdateTask();
  const retire = useRetireTask();
  const restore = useRestoreTask();
  const toIl = usePlaceOnInjuredList();
  const activate = useActivateFromInjuredList();
  const [name, setName] = useState(task.name);
  const [points, setPoints] = useState(task.points);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [kind, setKind] = useState<TaskKind>(task.kind);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const nameId = useId();
  const notesId = useId();

  useEffect(() => {
    setName(task.name);
    setPoints(task.points);
    setNotes(task.notes ?? '');
    setKind(task.kind);
  }, [task.id, task.name, task.points, task.notes, task.kind]);

  const dirty =
    name.trim() !== task.name || points !== task.points || (notes || null) !== task.notes || kind !== task.kind;
  const canActivate = task.ilMinUntil === null || today === null || compareDates(today, task.ilMinUntil) >= 0;
  const retired = task.status === 'retired';

  return (
    <Sheet
      open
      onClose={onClose}
      kicker={isLeaving(task) ? 'Leaving' : vocab.taskStatus[task.status]}
      title={task.name}
      footer={
        <div className="actions">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dirty || !name.trim() || update.isPending}
            onClick={() =>
              update.mutate(
                { taskId: task.id, body: { name: name.trim(), points, notes: notes.trim() ? notes : null, kind } },
                { onSuccess: onClose },
              )
            }
          >
            Save
          </button>
        </div>
      }
    >
      <div className="form">
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Name
          </label>
          <input id={nameId} className="input" value={name} maxLength={LIMITS.taskNameMax} onChange={(e) => setName(e.target.value)} />
        </div>
        <Stepper
          label="Worth"
          value={points}
          min={1}
          max={LIMITS.pointsMax}
          suffix={points === 1 ? 'run' : 'runs'}
          onChange={setPoints}
          hint={
            task.lockedThrough && !retired
              ? `Days already under way (through ${weekdayShort(task.lockedThrough)}) keep ${vocab.runs(task.lockedPoints ?? task.points)}. A new value starts ${weekdayShort(addDays(task.lockedThrough, 1))}.`
              : `Days you’ve already started keep the ${vocab.term.points.toLowerCase()} they were planned with.`
          }
        />
        {newPointsFrom(task) && !retired ? (
          <p className="notice">
            Worth {vocab.runs(task.points)} from {weekdayLong(newPointsFrom(task)!)}. This week stays{' '}
            {vocab.runs(task.lockedPoints!)}.
          </p>
        ) : null}
        <div className="field">
          <label className="field__label" htmlFor={notesId}>
            Notes
          </label>
          <textarea
            id={notesId}
            className="input textarea"
            value={notes}
            maxLength={LIMITS.notesMax}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {!retired ? <KindPicker value={kind} onChange={setKind} name={`kind-${task.id}`} /> : null}
        {task.carryover && !retired ? <p className="notice">{vocab.carryoverNote}.</p> : null}
        <p className="streakline">
          <IconFlame width={16} height={16} /> Streak {task.currentStreak} · best {task.longestStreak}
        </p>
      </div>

      {!retired ? (
        <section className="il-box" aria-label={vocab.term.paused}>
          <h3 className="il-box__title">{vocab.term.paused}</h3>
          {task.status === 'injured' ? (
            <>
              <p>
                On the IL since {task.ilStartedOn ? formatDate(task.ilStartedOn) : 'recently'}.{' '}
                {task.ilMinUntil ? vocab.il.eligibleOn(formatDate(task.ilMinUntil)) : null}.
              </p>
              <button
                type="button"
                className="btn"
                disabled={!canActivate || activate.isPending}
                onClick={() => activate.mutate(task.id, { onSuccess: onClose })}
              >
                {vocab.il.activate}
              </button>
              {!canActivate ? <p className="fine">{vocab.il.minimum(IL_MIN_DAYS)}</p> : null}
            </>
          ) : (
            <>
              <p>{vocab.il.explainer}</p>
              <p className="fine">{vocab.il.minimum(IL_MIN_DAYS)}</p>
              <button type="button" className="btn" disabled={toIl.isPending} onClick={() => toIl.mutate(task.id, { onSuccess: onClose })}>
                <IconBandage width={18} height={18} /> {vocab.il.place}
              </button>
            </>
          )}
        </section>
      ) : null}

      {isLeaving(task) && task.lockedThrough ? (
        <section className="danger-zone">
          <p>
            <strong>Deleted.</strong> It stays in this week’s lineups through {weekdayLong(task.lockedThrough)} and still counts
            there, then it’s gone.
          </p>
          <button type="button" className="btn" disabled={restore.isPending} onClick={() => restore.mutate(task.id, { onSuccess: onClose })}>
            Undo delete
          </button>
        </section>
      ) : null}

      {!retired ? (
        <section className="danger-zone">
          {confirmRetire ? (
            <>
              <p>
                <strong>Delete “{task.name}”?</strong> It comes off your task list, your Default Lineups and any day you haven’t started.
                {task.lockedThrough
                  ? ` It stays in this week’s lineups through ${weekdayLong(task.lockedThrough)} and still counts there.`
                  : ''}{' '}
                Past box scores keep it.
              </p>
              <div className="actions">
                <button type="button" className="btn btn--quiet" onClick={() => setConfirmRetire(false)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={retire.isPending}
                  onClick={() => retire.mutate(task.id, { onSuccess: onClose })}
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn--quiet btn--danger-text" onClick={() => setConfirmRetire(true)}>
              Delete task…
            </button>
          )}
        </section>
      ) : null}
    </Sheet>
  );
}
