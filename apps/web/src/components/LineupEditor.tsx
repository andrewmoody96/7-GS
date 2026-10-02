import type { GameDto, TaskDto } from '@7gs/contracts';
import { LIMITS, starterWarnings } from '@7gs/rules';
import { useMemo, useState } from 'react';
import { benchOf, lineupOf } from '../lib/game';
import { vocab } from '../vocab';
import { Stepper, Switch } from './Controls';
import { IconDown, IconPlus, IconUp, IconWarning, IconX } from './icons';

export interface EditorSlot {
  taskId: string;
  name: string;
  points: number;
  required: boolean;
  /** Roster status, so starters can flag tasks sitting on the IL. */
  status?: TaskDto['status'];
}

export interface EditorState {
  lineup: EditorSlot[];
  bench: EditorSlot[];
  threshold: number;
  minTasks: number | null;
}

export function editorStateFromGame(game: GameDto): EditorState {
  const slot = (e: GameDto['entries'][number]): EditorSlot => ({
    taskId: e.taskId,
    name: e.taskName,
    points: e.points,
    required: e.required,
  });
  return {
    lineup: lineupOf(game).map(slot),
    bench: benchOf(game).map(slot),
    threshold: game.threshold,
    minTasks: game.minTasks,
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

interface SlotListProps {
  title: string;
  slots: EditorSlot[];
  role: 'lineup' | 'bench';
  onChange: (slots: EditorSlot[]) => void;
  onMoveRole?: (slot: EditorSlot) => void;
  moveRoleLabel?: string;
  allowRequired: boolean;
}

/** An ordered list with ≥44px reorder buttons (no drag needed, works with a keyboard). */
export function SlotList({ title, slots, role, onChange, onMoveRole, moveRoleLabel, allowRequired }: SlotListProps) {
  return (
    <div className="slots">
      <h3 className="slots__title">
        {title} <span className="slots__count">{slots.length}</span>
      </h3>
      {slots.length === 0 ? <p className="empty-line">Nothing here yet.</p> : null}
      <ol className="slots__list">
        {slots.map((slot, i) => (
          <li key={slot.taskId} className="slot">
            <span className="slot__order" aria-hidden="true">
              {role === 'lineup' ? i + 1 : 'B'}
            </span>
            <div className="slot__body">
              <p className="slot__name">{slot.name}</p>
              <p className="slot__meta">
                <span className="pill pill--runs">{vocab.runs(slot.points)}</span>
                {slot.status === 'injured' ? (
                  <span className="pill pill--il" title="Sits out until activated">
                    {vocab.terms.pausedShort}
                  </span>
                ) : null}
              </p>
              {allowRequired ? (
                <Switch
                  className="slot__must"
                  label={vocab.term.required}
                  checked={slot.required}
                  onChange={(required) => onChange(slots.map((s, j) => (j === i ? { ...s, required } : s)))}
                />
              ) : null}
            </div>
            <div className="slot__actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => onChange(move(slots, i, i - 1))}
                disabled={i === 0}
                aria-label={`Move ${slot.name} up`}
              >
                <IconUp />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onChange(move(slots, i, i + 1))}
                disabled={i === slots.length - 1}
                aria-label={`Move ${slot.name} down`}
              >
                <IconDown />
              </button>
              {onMoveRole ? (
                <button type="button" className="btn btn--small btn--quiet" onClick={() => onMoveRole(slot)}>
                  {moveRoleLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                onClick={() => onChange(slots.filter((_, j) => j !== i))}
                aria-label={`Remove ${slot.name}`}
              >
                <IconX />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface AddFromRosterProps {
  tasks: TaskDto[];
  used: Set<string>;
  onAdd: (task: TaskDto, role: 'lineup' | 'bench') => void;
  /** Starters may include tasks on the IL (they sit out until activated); games can't. */
  includeInjured?: boolean;
}

export function AddFromRoster({ tasks, used, onAdd, includeInjured }: AddFromRosterProps) {
  const available = tasks.filter(
    (t) => !used.has(t.id) && (t.status === 'active' || (includeInjured && t.status === 'injured')),
  );
  if (available.length === 0) return <p className="empty-line">Every active task is already in.</p>;
  return (
    <ul className="addlist">
      {available.map((task) => (
        <li key={task.id} className="addlist__item">
          <span className="addlist__name">
            {task.name}
            {task.status === 'injured' ? <span className="pill pill--il">{vocab.terms.pausedShort}</span> : null}
            <span className="pill pill--runs">{vocab.runs(task.points)}</span>
          </span>
          <span className="addlist__actions">
            <button type="button" className="btn btn--small" onClick={() => onAdd(task, 'lineup')}>
              <IconPlus width={16} height={16} /> {vocab.terms.lineup}
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => onAdd(task, 'bench')}>
              <IconPlus width={16} height={16} /> {vocab.term.bench}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Warnings({ warnings }: { warnings: readonly (keyof typeof vocab.starterWarning)[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="warnings" aria-label="Warnings">
      {warnings.map((w) => (
        <li key={w} className="warning">
          <IconWarning width={18} height={18} />
          <span>{vocab.starterWarning[w]}</span>
        </li>
      ))}
    </ul>
  );
}

interface LineupEditorProps {
  game: GameDto;
  tasks: TaskDto[];
  saving: boolean;
  onSave: (state: EditorState) => void;
  onCancel: () => void;
}

/** Pre-first-pitch editing: order, add/remove, must-hits, threshold and minimum. */
export function LineupEditor({ game, tasks, saving, onSave, onCancel }: LineupEditorProps) {
  const [state, setState] = useState<EditorState>(() => editorStateFromGame(game));
  const used = useMemo(() => new Set([...state.lineup, ...state.bench].map((s) => s.taskId)), [state]);
  const warnings = starterWarnings(
    [
      ...state.lineup.map((s) => ({ taskId: s.taskId, points: s.points, role: 'lineup' as const })),
      ...state.bench.map((s) => ({ taskId: s.taskId, points: s.points, role: 'bench' as const })),
    ],
    state.threshold,
    state.minTasks,
  );

  return (
    <section className="card editor" aria-label="Edit lineup">
      <header className="card__head">
        <h2 className="card__title">Edit lineup</h2>
        <p className="card__sub">Locks at first pitch.</p>
      </header>

      <div className="editor__rules">
        <Stepper
          label={vocab.terms.threshold}
          value={state.threshold}
          min={1}
          max={LIMITS.thresholdMax}
          suffix={vocab.terms.runsShort}
          onChange={(threshold) => setState((s) => ({ ...s, threshold }))}
        />
        <div className="field">
          <Switch
            label={vocab.terms.minTasks}
            checked={state.minTasks !== null}
            onChange={(on) => setState((s) => ({ ...s, minTasks: on ? Math.max(1, s.lineup.length) : null }))}
          />
          {state.minTasks !== null ? (
            <Stepper
              label={`${vocab.terms.minTasks} (tasks done)`}
              value={state.minTasks}
              min={1}
              max={LIMITS.minTasksMax}
              onChange={(minTasks) => setState((s) => ({ ...s, minTasks }))}
            />
          ) : null}
        </div>
      </div>

      <Warnings warnings={warnings} />

      <SlotList
        title={vocab.terms.lineup}
        role="lineup"
        slots={state.lineup}
        allowRequired
        onChange={(lineup) => setState((s) => ({ ...s, lineup }))}
        onMoveRole={(slot) =>
          setState((s) => ({
            ...s,
            lineup: s.lineup.filter((x) => x.taskId !== slot.taskId),
            bench: [...s.bench, { ...slot, required: false }],
          }))
        }
        moveRoleLabel={`To ${vocab.term.bench.toLowerCase()}`}
      />
      <SlotList
        title={vocab.term.bench}
        role="bench"
        slots={state.bench}
        allowRequired={false}
        onChange={(bench) => setState((s) => ({ ...s, bench }))}
        onMoveRole={(slot) =>
          setState((s) => ({
            ...s,
            bench: s.bench.filter((x) => x.taskId !== slot.taskId),
            lineup: [...s.lineup, slot],
          }))
        }
        moveRoleLabel={`To ${vocab.terms.lineup.toLowerCase()}`}
      />

      <details className="disclosure">
        <summary>Add from the {vocab.terms.roster.toLowerCase()}</summary>
        <AddFromRoster
          tasks={tasks}
          used={used}
          onAdd={(task, role) =>
            setState((s) => {
              const slot = { taskId: task.id, name: task.name, points: task.points, required: false };
              return role === 'lineup' ? { ...s, lineup: [...s.lineup, slot] } : { ...s, bench: [...s.bench, slot] };
            })
          }
        />
      </details>

      <div className="actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={() => onSave(state)} disabled={saving}>
          {saving ? 'Saving…' : 'Save lineup'}
        </button>
      </div>
    </section>
  );
}
