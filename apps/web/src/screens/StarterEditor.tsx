import type { StarterDto, TaskDto } from '@7gs/contracts';
import { LIMITS, starterWarnings } from '@7gs/rules';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMeQuery, usePutStarter, useStartersQuery, useTasksQuery } from '../app/queries';
import { Stepper, Switch } from '../components/Controls';
import { AddFromRoster, SlotList, Warnings, type EditorSlot } from '../components/LineupEditor';
import { EmptyState, ErrorPanel, Loading } from '../components/States';
import { formatTimeOfDay } from '../lib/format';
import { vocab } from '../vocab';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function StarterEditorScreen() {
  const { weekday } = useParams();
  const day = Number(weekday);
  const starters = useStartersQuery();
  const tasks = useTasksQuery();
  const me = useMeQuery();

  if (starters.isPending || tasks.isPending) return <Loading label="Loading the starter" />;
  if (starters.isError) return <ErrorPanel error={starters.error} onRetry={() => void starters.refetch()} />;
  if (tasks.isError) return <ErrorPanel error={tasks.error} onRetry={() => void tasks.refetch()} />;
  const starter = starters.data.find((s) => s.weekday === day);
  if (!starter) {
    return (
      <div className="screen">
        <EmptyState title="No such starter">
          <Link to="/film-room">Back to the rotation</Link>
        </EmptyState>
      </div>
    );
  }
  return <StarterForm key={starter.weekday} starter={starter} tasks={tasks.data} defaultLockTime={me.data?.defaultLockTime ?? null} />;
}

function toSlot(taskId: string, required: boolean, tasks: Map<string, TaskDto>): EditorSlot {
  const task = tasks.get(taskId);
  return { taskId, name: task?.name ?? 'Unknown task', points: task?.points ?? 1, required, status: task?.status };
}

function StarterForm({ starter, tasks, defaultLockTime }: { starter: StarterDto; tasks: TaskDto[]; defaultLockTime: string | null }) {
  const navigate = useNavigate();
  const put = usePutStarter();
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [name, setName] = useState(starter.name);
  const [threshold, setThreshold] = useState(starter.threshold);
  const [minTasks, setMinTasks] = useState<number | null>(starter.minTasks);
  const [lockTime, setLockTime] = useState<string | null>(starter.lockTime);
  const [lineup, setLineup] = useState<EditorSlot[]>(() => starter.lineup.map((s) => toSlot(s.taskId, s.required, byId)));
  const [bench, setBench] = useState<EditorSlot[]>(() => starter.bench.map((s) => toSlot(s.taskId, false, byId)));
  const nameId = useId();
  const timeId = useId();

  const used = new Set([...lineup, ...bench].map((s) => s.taskId));
  const warnings = starterWarnings(
    [
      ...lineup.map((s) => ({ taskId: s.taskId, points: s.points, role: 'lineup' as const })),
      ...bench.map((s) => ({ taskId: s.taskId, points: s.points, role: 'bench' as const })),
    ],
    threshold,
    minTasks,
  );
  const maxRuns = lineup.filter((s) => s.status !== 'injured').reduce((sum, s) => sum + s.points, 0);
  const dayName = WEEKDAY_NAMES[starter.weekday - 1] ?? '';

  const save = () =>
    put.mutate(
      {
        weekday: starter.weekday,
        body: {
          name: name.trim(),
          threshold,
          minTasks,
          lockTime,
          lineup: lineup.map((s, i) => ({ taskId: s.taskId, position: i + 1, required: s.required })),
          bench: bench.map((s, i) => ({ taskId: s.taskId, position: i + 1 })),
        },
      },
      { onSuccess: () => navigate('/film-room') },
    );

  return (
    <div className="screen screen--editor">
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            <Link to="/film-room">Rotation</Link> / {dayName}
          </p>
          <h1 className="screen__title">
            {dayName} {vocab.term.dayTemplate}
          </h1>
        </div>
      </header>

      <section className="card form">
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Name
          </label>
          <input id={nameId} className="input" value={name} maxLength={LIMITS.starterNameMax} onChange={(e) => setName(e.target.value)} />
        </div>
        <Stepper
          label={vocab.terms.threshold}
          value={threshold}
          min={1}
          max={LIMITS.thresholdMax}
          suffix={vocab.terms.runsShort}
          onChange={setThreshold}
          hint={`Your full lineup is worth ${vocab.runs(maxRuns)}.`}
        />
        <div className="field">
          <Switch label={`${vocab.terms.minTasks} (tasks done)`} checked={minTasks !== null} onChange={(on) => setMinTasks(on ? Math.max(1, lineup.length - 1) : null)} />
          {minTasks !== null ? (
            <Stepper label={vocab.terms.minTasks} value={minTasks} min={1} max={LIMITS.minTasksMax} onChange={setMinTasks} />
          ) : null}
        </div>
        <div className="field">
          <Switch label={`Set a ${vocab.terms.lockTime.toLowerCase()}`} checked={lockTime !== null} onChange={(on) => setLockTime(on ? '09:00' : null)} />
          {lockTime !== null ? (
            <>
              <label className="field__label" htmlFor={timeId}>
                {vocab.terms.lockTime}
              </label>
              <input id={timeId} className="input input--time" type="time" value={lockTime} onChange={(e) => setLockTime(e.target.value || null)} />
            </>
          ) : (
            <p className="field__hint">
              {defaultLockTime
                ? `Uses your default first pitch, ${formatTimeOfDay(defaultLockTime)}, or your first check-off if earlier.`
                : `${vocab.lock.firstPitchOnCheckoff}.`}
            </p>
          )}
        </div>
      </section>

      <Warnings warnings={warnings} />

      <section className="card">
        <SlotList
          title={vocab.terms.lineup}
          role="lineup"
          slots={lineup}
          allowRequired
          onChange={setLineup}
          onMoveRole={(slot) => {
            setLineup((l) => l.filter((s) => s.taskId !== slot.taskId));
            setBench((b) => [...b, { ...slot, required: false }]);
          }}
          moveRoleLabel={`To ${vocab.term.bench.toLowerCase()}`}
        />
        <SlotList
          title={vocab.term.bench}
          role="bench"
          slots={bench}
          allowRequired={false}
          onChange={setBench}
          onMoveRole={(slot) => {
            setBench((b) => b.filter((s) => s.taskId !== slot.taskId));
            setLineup((l) => [...l, slot]);
          }}
          moveRoleLabel={`To ${vocab.terms.lineup.toLowerCase()}`}
        />
        <details className="disclosure">
          <summary>Add from the {vocab.terms.roster.toLowerCase()}</summary>
          <AddFromRoster
            tasks={tasks}
            used={used}
            includeInjured
            onAdd={(task, role) => {
              const slot = toSlot(task.id, false, byId);
              if (role === 'lineup') setLineup((l) => [...l, slot]);
              else setBench((b) => [...b, slot]);
            }}
          />
        </details>
      </section>

      <div className="actions actions--sticky">
        <Link to="/film-room" className="btn btn--quiet">
          Cancel
        </Link>
        <button type="button" className="btn btn--primary" onClick={save} disabled={!name.trim() || put.isPending}>
          {put.isPending ? 'Saving…' : `Save ${vocab.term.dayTemplate.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
