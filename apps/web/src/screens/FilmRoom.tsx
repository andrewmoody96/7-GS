import type { AllowancesDto, StarterDto, TaskDto } from '@7gs/contracts';
import { compareDates, IL_MIN_DAYS, LIMITS, type LocalDate } from '@7gs/rules';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useActivateFromInjuredList,
  useCreateTask,
  useMeQuery,
  usePlaceOnInjuredList,
  useRetireTask,
  useStartersQuery,
  useTasksQuery,
  useUpdateTask,
} from '../app/queries';
import { Stepper } from '../components/Controls';
import { IconBandage, IconChevronRight, IconFlame, IconPlus, IconWarning } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { formatDate, formatTimeOfDay } from '../lib/format';
import { vocab } from '../vocab';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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

export function FilmRoomScreen() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'roster' ? 'roster' : 'rotation';
  const me = useMeQuery();
  return (
    <div className="screen screen--filmroom">
      <header className="screen__head">
        <div>
          <p className="screen__kicker">Front office</p>
          <h1 className="screen__title">{vocab.tabs.filmRoom}</h1>
        </div>
        <AllowanceChips allowances={me.data?.allowances} />
      </header>
      <div className="segmented" role="tablist" aria-label="Film Room sections">
        <button
          type="button"
          role="tab"
          id="tab-rotation"
          aria-controls="panel-rotation"
          aria-selected={tab === 'rotation'}
          className="segmented__item"
          onClick={() => setParams({}, { replace: true })}
        >
          Rotation
        </button>
        <button
          type="button"
          role="tab"
          id="tab-roster"
          aria-controls="panel-roster"
          aria-selected={tab === 'roster'}
          className="segmented__item"
          onClick={() => setParams({ tab: 'roster' }, { replace: true })}
        >
          {vocab.terms.roster}
        </button>
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'rotation' ? <Rotation /> : <Roster today={me.data?.today ?? null} />}
      </div>
    </div>
  );
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
        One {vocab.term.dayTemplate.toLowerCase()} per weekday. Edits apply to every game whose lineup isn’t built yet; lineups are
        built at the start of each game day.
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
    <Link to={`/film-room/starters/${starter.weekday}`} className="starter-card">
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

// ── Roster ───────────────────────────────────────────────────────────────────

function Roster({ today }: { today: LocalDate | null }) {
  const tasks = useTasksQuery();
  const [selected, setSelected] = useState<TaskDto | null>(null);
  if (tasks.isPending) return <Loading label="Loading the roster" />;
  if (tasks.isError) return <ErrorPanel error={tasks.error} onRetry={() => void tasks.refetch()} />;
  const all = tasks.data;
  const active = all.filter((t) => t.status === 'active');
  const injured = all.filter((t) => t.status === 'injured');
  const retired = all.filter((t) => t.status === 'retired');
  const current = selected ? (all.find((t) => t.id === selected.id) ?? selected) : null;

  return (
    <section aria-label={vocab.terms.roster}>
      <AddTaskForm />
      {all.length === 0 ? (
        <EmptyState title="No one on the roster yet">
          <p>Add the habits you want to win with. Every task is worth 1 run unless you say otherwise.</p>
        </EmptyState>
      ) : null}
      {active.length > 0 ? (
        <TaskGroup title={`Active · ${active.length}`} tasks={active} onSelect={setSelected} />
      ) : null}
      {injured.length > 0 ? (
        <TaskGroup title={`${vocab.term.paused} · ${injured.length}`} tasks={injured} onSelect={setSelected} />
      ) : null}
      {retired.length > 0 ? (
        <details className="disclosure">
          <summary>Retired · {retired.length}</summary>
          <TaskGroup title="" tasks={retired} onSelect={setSelected} />
        </details>
      ) : null}
      <IlExplainer />
      {current ? <TaskSheet task={current} today={today} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function IlExplainer() {
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

function TaskGroup({ title, tasks, onSelect }: { title: string; tasks: TaskDto[]; onSelect: (t: TaskDto) => void }) {
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

function AddTaskForm() {
  const create = useCreateTask();
  const [name, setName] = useState('');
  const [points, setPoints] = useState(1);
  const inputId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), points },
      {
        onSuccess: () => {
          setName('');
          setPoints(1);
        },
      },
    );
  };
  return (
    <form className="card addtask" onSubmit={submit}>
      <label htmlFor={inputId} className="field__label">
        Sign a free agent
      </label>
      <div className="addtask__row">
        <input
          id={inputId}
          className="input"
          value={name}
          maxLength={LIMITS.taskNameMax}
          placeholder="e.g. Stretch for 10 minutes"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!name.trim() || create.isPending}>
          <IconPlus /> Add
        </button>
      </div>
      <Stepper label="Worth" value={points} min={1} max={LIMITS.pointsMax} suffix={points === 1 ? 'run' : 'runs'} onChange={setPoints} />
    </form>
  );
}

function TaskSheet({ task, today, onClose }: { task: TaskDto; today: LocalDate | null; onClose: () => void }) {
  const update = useUpdateTask();
  const retire = useRetireTask();
  const toIl = usePlaceOnInjuredList();
  const activate = useActivateFromInjuredList();
  const [name, setName] = useState(task.name);
  const [points, setPoints] = useState(task.points);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [confirmRetire, setConfirmRetire] = useState(false);
  const nameId = useId();
  const notesId = useId();

  useEffect(() => {
    setName(task.name);
    setPoints(task.points);
    setNotes(task.notes ?? '');
  }, [task.id, task.name, task.points, task.notes]);

  const dirty = name.trim() !== task.name || points !== task.points || (notes || null) !== task.notes;
  const canActivate = task.ilMinUntil === null || today === null || compareDates(today, task.ilMinUntil) >= 0;
  const retired = task.status === 'retired';

  return (
    <Sheet
      open
      onClose={onClose}
      kicker={vocab.taskStatus[task.status]}
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
                { taskId: task.id, body: { name: name.trim(), points, notes: notes.trim() ? notes : null } },
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
          hint="Runs already scored keep the value they had at first pitch."
        />
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

      {!retired ? (
        <section className="danger-zone">
          {confirmRetire ? (
            <>
              <p>Retire {task.name}? It leaves future lineups; past box scores keep it.</p>
              <div className="actions">
                <button type="button" className="btn btn--quiet" onClick={() => setConfirmRetire(false)}>
                  Keep
                </button>
                <button type="button" className="btn btn--danger" onClick={() => retire.mutate(task.id, { onSuccess: onClose })}>
                  Retire
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn--quiet btn--danger-text" onClick={() => setConfirmRetire(true)}>
              Retire task…
            </button>
          )}
        </section>
      ) : null}
    </Sheet>
  );
}
