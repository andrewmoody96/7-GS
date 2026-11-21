// The week on one grid: a row per task, a box per weekday. Each box cycles off → in the
// lineup → must-hit → off, and the bottom line shows each day's runs to win as you go.
// Used by guided setup and Management → Default Lineups.
//
// It edits only which tasks each weekday starts with and which are must-hits. Saving
// (weekPlanBodies) keeps everything else on a day: its name, lock time, bench, the order of
// tasks already there, and lineup tasks the grid doesn't show (one on the IL, say).

import type { StarterDto, StarterPutDto, TaskDto } from '@7gs/contracts';
import { lineupThreshold } from '@7gs/rules';
import { vocab } from '../vocab';

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface Plan {
  days: Set<number>;
  /** Days it's a must-hit (a subset of `days`). */
  mustDays: Set<number>;
}

export type WeekPlan = Map<string, Plan>;

type CellState = 'off' | 'on' | 'must';

/**
 * From the saved default lineups. A task in none of them (lineup or bench) starts on every
 * day when `fillEmpty` says so for it, otherwise on none.
 */
export function initialPlan(
  tasks: TaskDto[],
  starters: StarterDto[],
  { fillEmpty }: { fillEmpty: boolean | ((task: TaskDto) => boolean) },
): WeekPlan {
  const plan: WeekPlan = new Map();
  for (const t of tasks) {
    const days = new Set<number>();
    const mustDays = new Set<number>();
    for (const s of starters) {
      const slot = s.lineup.find((l) => l.taskId === t.id);
      if (slot) {
        days.add(s.weekday);
        if (slot.required) mustDays.add(s.weekday);
      }
    }
    const benched = starters.some((s) => s.bench.some((b) => b.taskId === t.id));
    const fill = days.size === 0 && !benched && (typeof fillEmpty === 'function' ? fillEmpty(t) : fillEmpty);
    plan.set(t.id, { days: fill ? new Set([1, 2, 3, 4, 5, 6, 7]) : days, mustDays });
  }
  return plan;
}

export function samePlan(a: WeekPlan, b: WeekPlan): boolean {
  if (a.size !== b.size) return false;
  for (const [id, p] of a) {
    const q = b.get(id);
    if (!q || !sameSet(p.days, q.days) || !sameSet(p.mustDays, q.mustDays)) return false;
  }
  return true;
}

const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));

const cellState = (p: Plan | undefined, day: number): CellState =>
  !p?.days.has(day) ? 'off' : p.mustDays.has(day) ? 'must' : 'on';

/**
 * Each weekday's lineup under `plan`. Tasks already there keep their order; new ones go
 * after. A task not on the grid stays as it was.
 */
export function planLineups(plan: WeekPlan, gridTasks: TaskDto[], starters: StarterDto[]): Map<number, StarterDto['lineup']> {
  const onGrid = new Set(gridTasks.map((t) => t.id));
  const out = new Map<number, StarterDto['lineup']>();
  for (let day = 1; day <= 7; day++) {
    const before = starters.find((s) => s.weekday === day)?.lineup ?? [];
    const slots: { taskId: string; required: boolean }[] = [];
    for (const slot of before) {
      if (!onGrid.has(slot.taskId)) slots.push({ taskId: slot.taskId, required: slot.required });
      else if (plan.get(slot.taskId)?.days.has(day)) slots.push({ taskId: slot.taskId, required: plan.get(slot.taskId)!.mustDays.has(day) });
    }
    for (const t of gridTasks) {
      const p = plan.get(t.id);
      if (p?.days.has(day) && !slots.some((s) => s.taskId === t.id)) slots.push({ taskId: t.id, required: p.mustDays.has(day) });
    }
    out.set(
      day,
      slots.map((s, i) => ({ ...s, position: i + 1 })),
    );
  }
  return out;
}

/** The days whose lineup the plan changes, as the bodies to save them with. */
export function weekPlanBodies(plan: WeekPlan, gridTasks: TaskDto[], starters: StarterDto[]): Map<number, StarterPutDto> {
  const bodies = new Map<number, StarterPutDto>();
  for (const [day, lineup] of planLineups(plan, gridTasks, starters)) {
    const existing = starters.find((s) => s.weekday === day);
    if (existing && sameLineup(existing.lineup, lineup)) continue;
    bodies.set(day, {
      name: existing?.name ?? `${WEEK_DAYS[day - 1]} lineup`,
      lockTime: existing?.lockTime ?? null,
      lineup,
      // A task moved into the lineup leaves the bench.
      bench: (existing?.bench ?? []).filter((b) => !lineup.some((l) => l.taskId === b.taskId)),
    });
  }
  return bodies;
}

const sameLineup = (a: StarterDto['lineup'], b: StarterDto['lineup']) =>
  a.length === b.length && a.every((x, i) => x.taskId === b[i]?.taskId && x.required === b[i]?.required);

const STATE_LABEL: Record<CellState, () => string> = {
  off: () => 'off',
  on: () => `in the ${vocab.terms.lineup.toLowerCase()}`,
  must: () => vocab.term.required.toLowerCase(),
};

const NEXT: Record<CellState, CellState> = { off: 'on', on: 'must', must: 'off' };

export function WeekPlanGrid({
  tasks,
  allTasks,
  starters,
  plan,
  onChange,
  label,
}: {
  /** The rows. */
  tasks: TaskDto[];
  /** Every task, for the points of lineup tasks not on the grid. */
  allTasks: TaskDto[];
  starters: StarterDto[];
  plan: WeekPlan;
  onChange: (plan: WeekPlan) => void;
  label: string;
}) {
  const update = (taskId: string, change: (p: Plan) => Plan) =>
    onChange(new Map(plan).set(taskId, change(plan.get(taskId) ?? { days: new Set(), mustDays: new Set() })));

  const cycle = (taskId: string, day: number) =>
    update(taskId, (p) => {
      const days = new Set(p.days);
      const mustDays = new Set(p.mustDays);
      const next = NEXT[cellState(p, day)];
      if (next === 'off') {
        days.delete(day);
        mustDays.delete(day);
      } else {
        days.add(day);
        if (next === 'must') mustDays.add(day);
        // Turned on for a task that's a must-hit on every other day: a must-hit here too.
        else if (p.mustDays.size > 0 && p.mustDays.size === p.days.size) mustDays.add(day);
      }
      return { days, mustDays };
    });
  /** All its days a must-hit, or none. */
  const setMust = (taskId: string, on: boolean) => update(taskId, (p) => ({ ...p, mustDays: on ? new Set(p.days) : new Set() }));

  const points = new Map(allTasks.map((t) => [t.id, t.points]));
  const lineups = planLineups(plan, tasks, starters);

  return (
    <>
      <p className="weekgrid__legend" aria-hidden="true">
        <span className="weekgrid__cell weekgrid__cell--key" /> off
        <span className="weekgrid__cell weekgrid__cell--key is-on">✓</span> {vocab.terms.lineup.toLowerCase()}
        <span className="weekgrid__cell weekgrid__cell--key is-must">✓</span> {vocab.term.required.toLowerCase()}
      </p>
      <div className="weekgrid" role="table" aria-label={label}>
        <div className="weekgrid__row weekgrid__row--head" role="row">
          {WEEK_DAYS.map((d) => (
            <span key={d} role="columnheader" className="weekgrid__day">
              {d.slice(0, 2)}
            </span>
          ))}
        </div>
        {tasks.map((t) => {
          const p = plan.get(t.id) ?? { days: new Set<number>(), mustDays: new Set<number>() };
          const mixed = p.mustDays.size > 0 && p.mustDays.size < p.days.size;
          return (
            <div key={t.id} className="weekgrid__row" role="row">
              <span role="rowheader" className="weekgrid__task">
                <strong>{t.name}</strong>
                <label className="weekgrid__must">
                  <input
                    type="checkbox"
                    checked={p.mustDays.size > 0 && p.mustDays.size === p.days.size}
                    disabled={p.days.size === 0}
                    ref={(el) => {
                      // A must-hit on some days but not all: shown as mixed.
                      if (el) el.indeterminate = mixed;
                    }}
                    onChange={(e) => setMust(t.id, e.target.checked)}
                  />
                  {vocab.term.required}
                  {mixed ? <span className="muted"> (some days)</span> : null}
                </label>
              </span>
              {WEEK_DAYS.map((d, i) => {
                const state = cellState(p, i + 1);
                return (
                  <span key={d} role="cell" className="weekgrid__slot">
                    <button
                      type="button"
                      className={`weekgrid__cell${state === 'off' ? '' : ' is-on'}${state === 'must' ? ' is-must' : ''}`}
                      aria-label={`${t.name} on ${d}: ${STATE_LABEL[state]()}`}
                      onClick={() => cycle(t.id, i + 1)}
                    >
                      <span aria-hidden="true">{state === 'off' ? '' : '✓'}</span>
                    </button>
                  </span>
                );
              })}
            </div>
          );
        })}
        <div className="weekgrid__row weekgrid__row--foot" role="row">
          <span role="rowheader" className="weekgrid__task">
            {vocab.terms.threshold}
          </span>
          {WEEK_DAYS.map((d, i) => {
            const lineup = lineups.get(i + 1) ?? [];
            return (
              <span key={d} role="cell" className={`weekgrid__day${lineup.length === 0 ? ' is-empty' : ''}`}>
                {lineup.length === 0 ? '–' : lineupThreshold(lineup.map((s) => ({ points: points.get(s.taskId) ?? 1, required: s.required })))}
              </span>
            );
          })}
        </div>
      </div>
      <p className="field__hint">
        Tap a box to cycle it: off, {vocab.terms.lineup.toLowerCase()}, {vocab.term.required.toLowerCase()}. {vocab.terms.threshold}{' '}
        is worked out for you: {vocab.term.required.toLowerCase()}s plus half the rest. An empty day (–) can’t be won, so give every
        day at least one task.
      </p>
    </>
  );
}
