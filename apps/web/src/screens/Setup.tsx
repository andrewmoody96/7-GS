// New-account setup, after picking a sport and a look: name the team, add tasks, lay out
// the week, and choose when to start. Every step saves as it goes and can be skipped;
// all of it stays editable later (Team → Settings, + Add task, Management → Default Lineups).
//
// The step lives in the address (/setup?step=…), so a reload or a sport switch keeps it.

import type { StarterDto, StarterPutDto, TaskDto } from '@7gs/contracts';
import { LIMITS, lineupThreshold, weekday, type LocalDate } from '@7gs/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../app/context';
import { errorMessage } from '../app/errors';
import { invalidateGameDay, qk, useMeQuery, useSetAvatar, useStartersQuery, useStartHeadStart, useTasksQuery, useUpdateMe } from '../app/queries';
import { TeamBadge } from '../components/Badges';
import { Stepper } from '../components/Controls';
import { EmptyState, Loading } from '../components/States';
import { squarePhoto } from '../lib/avatar';
import { formatMonthDay, weekdayLong } from '../lib/format';
import { vocab } from '../vocab';

const STEPS = ['team', 'tasks', 'week', 'start'] as const;
type Step = (typeof STEPS)[number];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Where a new account goes after the sport and look. */
export const SETUP_PATH = '/setup';

/** Ideas to start from, one tap each. */
const SUGGESTIONS: { name: string; points: number }[] = [
  { name: 'Workout', points: 2 },
  { name: 'Read 20 pages', points: 1 },
  { name: 'Drink 8 glasses of water', points: 1 },
  { name: 'Walk 30 minutes', points: 1 },
  { name: 'Inbox zero', points: 1 },
  { name: 'Meditate', points: 1 },
  { name: 'Tidy up 10 minutes', points: 1 },
  { name: 'Deep work block', points: 3 },
];

export function SetupScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get('step');
  const step: Step = (STEPS as readonly string[]).includes(raw ?? '') ? (raw as Step) : 'team';
  const index = STEPS.indexOf(step);
  const go = (next: Step) => setParams({ step: next }, { replace: true });
  const next = () => (index + 1 < STEPS.length ? go(STEPS[index + 1]!) : finish());
  const back = index > 0 ? () => go(STEPS[index - 1]!) : null;
  const updateMe = useUpdateMe();
  const me = useMeQuery();
  // Done (or skipped): remembered on the account so it shows once, then home, where the
  // How it works guide opens for a first visit.
  const finish = () => {
    if (me.data && !me.data.setupDone) updateMe.mutate({ setupDone: true });
    navigate('/', { replace: true, state: { guide: true } });
  };

  return (
    <div className="screen setup">
      <header className="screen__head">
        <div>
          <p className="screen__kicker">
            Set up · Step {index + 1} of {STEPS.length}
          </p>
          <h1 className="screen__title">
            {step === 'team' ? 'Your team' : step === 'tasks' ? 'Your tasks' : step === 'week' ? 'Your week' : 'When to start'}
          </h1>
        </div>
      </header>
      <ol className="setup__dots" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />
        ))}
      </ol>
      {step === 'team' ? (
        <TeamStep onNext={next} />
      ) : step === 'tasks' ? (
        <TasksStep onNext={next} onBack={back} />
      ) : step === 'week' ? (
        <WeekStep onNext={next} onBack={back} />
      ) : (
        <StartStep onDone={finish} onBack={back} />
      )}
      <button type="button" className="btn btn--quiet setup__skip" onClick={finish}>
        I’ll finish this later
      </button>
    </div>
  );
}

function StepActions({ onBack, children }: { onBack: (() => void) | null; children: React.ReactNode }) {
  return (
    <div className="actions setup__actions">
      {onBack ? (
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          Back
        </button>
      ) : null}
      {children}
    </div>
  );
}

// ── 1. Team ──────────────────────────────────────────────────────────────────

function TeamStep({ onNext }: { onNext: () => void }) {
  const me = useMeQuery();
  const updateMe = useUpdateMe();
  const setAvatar = useSetAvatar();
  const [name, setName] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const nameId = useId();
  const photoId = useId();
  useEffect(() => {
    if (me.data) setName((n) => n || me.data.displayName);
  }, [me.data]);
  if (!me.data) return <Loading label="Loading your team" />;
  const save = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === me.data.displayName) onNext();
    else updateMe.mutate({ displayName: trimmed }, { onSuccess: onNext });
  };
  return (
    <form className="card form" onSubmit={save}>
      <p className="lede">Every team needs a name. Yours shows on the scoreboard every day.</p>
      <label className="field__label" htmlFor={nameId}>
        Team name
      </label>
      <input
        id={nameId}
        className="input"
        value={name}
        maxLength={40}
        placeholder="e.g. Cornland Cornbears"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="field teamphoto">
        <span className="field__label">Team photo (optional)</span>
        <div className="teamphoto__row">
          <TeamBadge name={name.trim() || me.data.displayName} size={64} />
          <label htmlFor={photoId} className={`btn${preparing || setAvatar.isPending ? ' is-disabled' : ''}`}>
            {preparing || setAvatar.isPending ? 'Saving…' : me.data.avatar ? 'Change photo' : 'Choose photo'}
          </label>
          <input
            id={photoId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setPreparing(true);
              setPhotoError(null);
              try {
                setAvatar.mutate(await squarePhoto(file));
              } catch (error) {
                setPhotoError(error instanceof Error ? error.message : 'That photo couldn’t be used.');
              } finally {
                setPreparing(false);
              }
            }}
          />
        </div>
        {photoError ? <p className="notice notice--error">{photoError}</p> : null}
      </div>
      {updateMe.isError ? <p className="notice notice--error">{errorMessage(updateMe.error)}</p> : null}
      <StepActions onBack={null}>
        <button type="submit" className="btn btn--primary" disabled={!name.trim() || updateMe.isPending}>
          Next
        </button>
      </StepActions>
    </form>
  );
}

// ── 2. Tasks ─────────────────────────────────────────────────────────────────

function TasksStep({ onNext, onBack }: { onNext: () => void; onBack: (() => void) | null }) {
  const api = useApi();
  const qc = useQueryClient();
  const tasks = useTasksQuery();
  const [name, setName] = useState('');
  const [points, setPoints] = useState(1);
  const nameId = useId();
  const mine = (tasks.data ?? []).filter((t) => t.status === 'active' && t.kind === 'recurring');
  const add = useMutation({
    mutationFn: (task: { name: string; points: number }) => api.call('createTask', { body: { ...task, kind: 'recurring' } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tasks }),
  });
  const remove = useMutation({
    mutationFn: (taskId: string) => api.call('retireTask', { params: { taskId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tasks }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || add.isPending) return;
    add.mutate({ name: trimmed, points }, { onSuccess: () => (setName(''), setPoints(1)) });
  };
  const taken = new Set(mine.map((t) => t.name.toLowerCase()));
  return (
    <>
      <section className="card form">
        <p className="lede">
          Add the habits and to-dos you want to get done most weeks. Each is worth {vocab.runs(1)} unless it’s a bigger job.
        </p>
        <form className="setup__add" onSubmit={submit}>
          <label className="field__label" htmlFor={nameId}>
            Task
          </label>
          <input
            id={nameId}
            className="input"
            value={name}
            maxLength={LIMITS.taskNameMax}
            placeholder="e.g. Call Mom"
            onChange={(e) => setName(e.target.value)}
          />
          <Stepper label="Worth" value={points} min={1} max={5} suffix={vocab.runs(points).replace(/^\d+ /, '')} onChange={setPoints} />
          <button type="submit" className="btn btn--primary" disabled={!name.trim() || add.isPending}>
            Add task
          </button>
        </form>
        <p className="field__label">Or tap an idea</p>
        <div className="setup__ideas">
          {SUGGESTIONS.filter((s) => !taken.has(s.name.toLowerCase())).map((s) => (
            <button key={s.name} type="button" className="ideachip" disabled={add.isPending} onClick={() => add.mutate(s)}>
              + {s.name}
            </button>
          ))}
        </div>
        {add.isError ? <p className="notice notice--error">{errorMessage(add.error)}</p> : null}
      </section>
      <section className="card" aria-labelledby="setup-tasklist">
        <header className="card__head">
          <h2 id="setup-tasklist" className="card__title">
            Your tasks · {mine.length}
          </h2>
          <p className="card__sub">One-time to-dos? Add those any time with + {vocab.tabs.addTask}.</p>
        </header>
        {mine.length === 0 ? (
          <p className="muted">Nothing yet. Three to six is a good start.</p>
        ) : (
          <ul className="setup__tasks">
            {mine.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.name}</strong> <span className="muted">· {vocab.runs(t.points)}</span>
                </span>
                <button type="button" className="btn btn--quiet btn--small" disabled={remove.isPending} onClick={() => remove.mutate(t.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" onClick={onNext}>
          {mine.length === 0 ? 'Skip for now' : 'Next: plan the week'}
        </button>
      </StepActions>
    </>
  );
}

// ── 3. Week ──────────────────────────────────────────────────────────────────

interface Plan {
  days: Set<number>;
  /** Days it's a must-hit (a subset of `days`), so a mixed plan from before survives. */
  mustDays: Set<number>;
}

/** From the saved default lineups; a task not in any yet starts on every day. */
function initialPlan(tasks: TaskDto[], starters: StarterDto[]): Map<string, Plan> {
  const plan = new Map<string, Plan>();
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
    plan.set(t.id, { days: days.size > 0 ? days : new Set([1, 2, 3, 4, 5, 6, 7]), mustDays });
  }
  return plan;
}

const sameLineup = (a: StarterDto['lineup'], b: StarterDto['lineup']) =>
  a.length === b.length && a.every((x, i) => x.taskId === b[i]?.taskId && x.required === b[i]?.required);

function WeekStep({ onNext, onBack }: { onNext: () => void; onBack: (() => void) | null }) {
  const tasks = useTasksQuery();
  const starters = useStartersQuery();
  const mine = useMemo(() => (tasks.data ?? []).filter((t) => t.status === 'active' && t.kind === 'recurring'), [tasks.data]);
  if (tasks.isPending || starters.isPending) return <Loading label="Loading your week" />;
  if (mine.length === 0) {
    return (
      <>
        <EmptyState title="No tasks yet">
          <p>Add a few tasks first, or skip this: you can plan your week any time in Team → Management → Default Lineups.</p>
        </EmptyState>
        <StepActions onBack={onBack}>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            Skip for now
          </button>
        </StepActions>
      </>
    );
  }
  return <WeekGrid tasks={mine} starters={starters.data ?? []} onNext={onNext} onBack={onBack} />;
}

function WeekGrid({
  tasks,
  starters,
  onNext,
  onBack,
}: {
  tasks: TaskDto[];
  starters: StarterDto[];
  onNext: () => void;
  onBack: (() => void) | null;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const me = useMeQuery();
  const [plan, setPlan] = useState(() => initialPlan(tasks, starters));
  const update = (taskId: string, change: (p: Plan) => Plan) =>
    setPlan((prev) => new Map(prev).set(taskId, change(prev.get(taskId) ?? { days: new Set(), mustDays: new Set() })));
  const toggleDay = (taskId: string, day: number) =>
    update(taskId, (p) => {
      const days = new Set(p.days);
      const mustDays = new Set(p.mustDays);
      if (days.has(day)) {
        days.delete(day);
        mustDays.delete(day);
      } else {
        days.add(day);
        // A day added to a must-hit everywhere is a must-hit there too.
        if (p.mustDays.size > 0 && p.mustDays.size === p.days.size) mustDays.add(day);
      }
      return { days, mustDays };
    });
  /** All its days a must-hit, or none. */
  const setMust = (taskId: string, on: boolean) => update(taskId, (p) => ({ ...p, mustDays: on ? new Set(p.days) : new Set() }));
  const isMust = (p: Plan, day: number) => p.mustDays.has(day);

  const lineupFor = (day: number) => tasks.filter((t) => plan.get(t.id)?.days.has(day));
  const save = useMutation({
    mutationFn: async () => {
      const today = me.data?.today as LocalDate | undefined;
      const bodies = new Map<number, StarterPutDto>();
      for (let day = 1; day <= 7; day++) {
        const existing = starters.find((s) => s.weekday === day);
        // Keep the saved order for tasks already there; new ones go after.
        const before = existing?.lineup ?? [];
        const chosen = lineupFor(day).sort((x, y) => {
          const ix = before.findIndex((l) => l.taskId === x.id);
          const iy = before.findIndex((l) => l.taskId === y.id);
          return (ix === -1 ? 999 : ix) - (iy === -1 ? 999 : iy);
        });
        const lineup = chosen.map((t, i) => ({ taskId: t.id, position: i + 1, required: isMust(plan.get(t.id)!, day) }));
        const body = {
          name: existing?.name ?? `${DAYS[day - 1]} lineup`,
          lockTime: existing?.lockTime ?? null,
          lineup,
          bench: (existing?.bench ?? []).filter((b) => !lineup.some((l) => l.taskId === b.taskId)),
        };
        // Only days that changed are saved, so an existing plan isn't touched for nothing.
        if (existing && sameLineup(before, lineup)) continue;
        bodies.set(day, body);
        await api.call('putStarter', { params: { weekday: day }, body });
      }
      // A week already opened copied its days before this; plan those too, if not started.
      if (today && bodies.size > 0) {
        const { weeks } = await api.call('listWeeks');
        for (const w of weeks) {
          const week = await api.call('getWeek', { params: { startDate: w.startDate } });
          for (const g of week.games) {
            if (g.editPolicy !== 'free' || g.playedDate < today || g.status === 'final') continue;
            const body = bodies.get(weekday(g.scheduledDate));
            if (!body) continue;
            await api.call('patchLineup', {
              params: { gameId: g.id },
              body: {
                entries: [
                  ...body.lineup.map((l) => ({ ...l, role: 'lineup' as const })),
                  ...body.bench.map((b) => ({ ...b, required: false, role: 'bench' as const })),
                ],
              },
            });
          }
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.starters });
      invalidateGameDay(qc);
      onNext();
    },
  });

  return (
    <>
      <section className="card">
        <p className="lede">
          Tap the days each task belongs on. Turn on <strong>{vocab.term.required}</strong> for the ones a day can’t be won without.
          Every week starts from this plan.
        </p>
        <div className="weekgrid" role="table" aria-label="Your default week">
          <div className="weekgrid__row weekgrid__row--head" role="row">
            {DAYS.map((d) => (
              <span key={d} role="columnheader" className="weekgrid__day">
                {d.slice(0, 2)}
              </span>
            ))}
          </div>
          {tasks.map((t) => {
            const p = plan.get(t.id)!;
            return (
              <div key={t.id} className="weekgrid__row" role="row">
                <span role="rowheader" className="weekgrid__task">
                  <strong>{t.name}</strong>
                  <label className="weekgrid__must">
                    <input
                      type="checkbox"
                      checked={p.mustDays.size > 0 && p.mustDays.size === p.days.size}
                      ref={(el) => {
                        // Some days but not all: a must-hit plan from before, shown as mixed.
                        if (el) el.indeterminate = p.mustDays.size > 0 && p.mustDays.size < p.days.size;
                      }}
                      onChange={(e) => setMust(t.id, e.target.checked)}
                    />
                    {vocab.term.required}
                    {p.mustDays.size > 0 && p.mustDays.size < p.days.size ? <span className="muted"> (some days)</span> : null}
                  </label>
                </span>
                {DAYS.map((d, i) => (
                  <label
                    key={d}
                    role="cell"
                    className={`weekgrid__cell${p.days.has(i + 1) ? ' is-on' : ''}${isMust(p, i + 1) ? ' is-must' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={p.days.has(i + 1)}
                      aria-label={`${t.name} on ${d}`}
                      onChange={() => toggleDay(t.id, i + 1)}
                    />
                    <span aria-hidden="true">{p.days.has(i + 1) ? '✓' : ''}</span>
                  </label>
                ))}
              </div>
            );
          })}
          <div className="weekgrid__row weekgrid__row--foot" role="row">
            <span role="rowheader" className="weekgrid__task">
              {vocab.terms.threshold}
            </span>
            {DAYS.map((d, i) => {
              const lineup = lineupFor(i + 1);
              return (
                <span key={d} role="cell" className={`weekgrid__day${lineup.length === 0 ? ' is-empty' : ''}`}>
                  {lineup.length === 0 ? '–' : lineupThreshold(lineup.map((t) => ({ points: t.points, required: isMust(plan.get(t.id)!, i + 1) })))}
                </span>
              );
            })}
          </div>
        </div>
        <p className="field__hint">
          {vocab.terms.threshold} is worked out for you: {vocab.term.required.toLowerCase()}s plus half the rest. An empty day (–)
          can’t be won, so give every day at least one task.
        </p>
        {save.isError ? <p className="notice notice--error">{errorMessage(save.error)}</p> : null}
      </section>
      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save my week'}
        </button>
      </StepActions>
    </>
  );
}

// ── 4. Start ─────────────────────────────────────────────────────────────────

function StartStep({ onDone, onBack }: { onDone: () => void; onBack: (() => void) | null }) {
  const me = useMeQuery();
  const headStart = useStartHeadStart();
  const [choice, setChoice] = useState<'monday' | 'today'>('monday');
  if (!me.data) return <Loading label="Loading" />;
  const pos = me.data.position;
  if (pos.phase !== 'preseason') {
    return (
      <>
        <section className="card">
          <p className="lede">Your season is already under way, so today’s game counts. Good luck!</p>
        </section>
        <StepActions onBack={onBack}>
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Let’s play
          </button>
        </StepActions>
      </>
    );
  }
  const openingDay = `${weekdayLong(pos.openingDay)}, ${formatMonthDay(pos.openingDay)}`;
  const start = () => {
    if (choice === 'today') headStart.mutate(undefined, { onSuccess: onDone });
    else onDone();
  };
  return (
    <>
      <section className="card">
        <p className="lede">Seasons start on a Monday. Until then it’s {vocab.term.preseason}: practice, nothing counts.</p>
        <div className="choices" role="radiogroup" aria-label="When to start">
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'monday'}
            className={`choice${choice === 'monday' ? ' is-selected' : ''}`}
            onClick={() => setChoice('monday')}
          >
            <strong>Start on {openingDay}</strong>
            <small>Warm up until then. Your first week starts fresh.</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'today'}
            className={`choice${choice === 'today' ? ' is-selected' : ''}`}
            onClick={() => setChoice('today')}
          >
            <strong>{vocab.headStart.name}: start today</strong>
            <small>The days left this week count toward your record. Can’t be undone.</small>
          </button>
        </div>
        {headStart.isError ? <p className="notice notice--error">{errorMessage(headStart.error)}</p> : null}
      </section>
      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" disabled={headStart.isPending} onClick={start}>
          {headStart.isPending ? 'Starting…' : 'Let’s play'}
        </button>
      </StepActions>
    </>
  );
}
