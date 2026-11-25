// New-account setup, after picking a sport and a look: name the team, add tasks, lay out
// the week, and choose when to start. Every step saves as it goes and can be skipped;
// all of it stays editable later (Team → Settings, + Add task, Management → Default Lineups).
//
// The step lives in the address (/setup?step=…), so a reload or a sport switch keeps it.

import type { StarterDto, TaskDto } from '@7gs/contracts';
import { addDays, LIMITS, localDateOf, type LocalDate } from '@7gs/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../app/context';
import { errorMessage } from '../app/errors';
import { qk, useCurrentSeasonQuery, useMeQuery, useSaveWeekPlan, useUpdateSeasonGoal, useSetAvatar, useStartersQuery, useStartHeadStart, useTasksQuery, useUpdateMe } from '../app/queries';
import { TeamBadge } from '../components/Badges';
import { PhotoCropSheet } from '../components/PhotoCropSheet';
import { Stepper } from '../components/Controls';
import { initialPlan, WeekPlanGrid, weekPlanBodies } from '../components/WeekPlanGrid';
import { EmptyState, Loading } from '../components/States';
import { formatMonthDay, weekdayLong } from '../lib/format';
import { vocab } from '../vocab';
import { seasonTotals } from './Season';

const STEPS = ['team', 'tasks', 'week', 'goal', 'start'] as const;
type Step = (typeof STEPS)[number];

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
            {step === 'team'
              ? 'Your team'
              : step === 'tasks'
                ? 'Your tasks'
                : step === 'week'
                  ? 'Your week'
                  : step === 'goal'
                    ? `Your ${vocab.terms.winGoal.toLowerCase()}`
                    : 'When to start'}
          </h1>
        </div>
      </header>
      {step === 'team' ? <ReturningNote /> : null}
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
      ) : step === 'goal' ? (
        <GoalStep onNext={next} onBack={back} />
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
  // The chosen file goes through the crop step before it's uploaded.
  const [cropping, setCropping] = useState<File | null>(null);
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
          <label htmlFor={photoId} className={`btn${setAvatar.isPending ? ' is-disabled' : ''}`}>
            {setAvatar.isPending ? 'Saving…' : me.data.avatar ? 'Change photo' : 'Choose photo'}
          </label>
          <input
            id={photoId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              setPhotoError(null);
              if (file) setCropping(file);
            }}
          />
        </div>
        <PhotoCropSheet
          file={cropping}
          onCancel={() => setCropping(null)}
          onDone={(image) => {
            setCropping(null);
            setAvatar.mutate(image, { onError: (error) => setPhotoError(errorMessage(error)) });
          }}
        />
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
          <Stepper label="Worth" value={points} min={1} max={LIMITS.taskPointsMax} suffix={vocab.runs(points).replace(/^\d+ /, '')} onChange={setPoints} hint={vocab.taskMaxHint} />
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
  return <WeekPlanner tasks={mine} allTasks={tasks.data ?? []} starters={starters.data ?? []} onNext={onNext} onBack={onBack} />;
}

function WeekPlanner({
  tasks,
  allTasks,
  starters,
  onNext,
  onBack,
}: {
  tasks: TaskDto[];
  allTasks: TaskDto[];
  starters: StarterDto[];
  onNext: () => void;
  onBack: (() => void) | null;
}) {
  const me = useMeQuery();
  // A task just added (here, or in the last day) starts on every day. An older one that's in
  // no default lineup was likely left off on purpose, so it stays off until it's tapped on.
  const [plan, setPlan] = useState(() =>
    initialPlan(tasks, starters, {
      fillEmpty: (t) => !me.data || localDateOf(new Date(t.createdAt), me.data.timezone) >= addDays(me.data.today, -1),
    }),
  );
  const save = useSaveWeekPlan({ quiet: true });
  const submit = () =>
    save.mutate(
      {
        bodies: weekPlanBodies(plan, tasks, starters),
        today: (me.data?.today as LocalDate | undefined) ?? null,
        activeIds: new Set(allTasks.filter((t) => t.status === 'active').map((t) => t.id)),
      },
      { onSuccess: onNext },
    );

  return (
    <>
      <section className="card">
        <p className="lede">
          Tap the days each task belongs on, and tap again for a <strong>{vocab.term.required}</strong>: a task a day can’t be won
          without. Every week starts from this plan.
        </p>
        <WeekPlanGrid tasks={tasks} allTasks={allTasks} starters={starters} plan={plan} onChange={setPlan} label="Your default week" />
        {save.isError ? <p className="notice notice--error">{errorMessage(save.error)}</p> : null}
      </section>
      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save my week'}
        </button>
      </StepActions>
    </>
  );
}

// ── 4. Goal ──────────────────────────────────────────────────────────────────

function GoalStep({ onNext, onBack }: { onNext: () => void; onBack: (() => void) | null }) {
  const me = useMeQuery();
  const season = useCurrentSeasonQuery();
  const update = useUpdateSeasonGoal();
  const s = season.data ?? null;
  const totals = s ? seasonTotals(me.data, s) : null;
  // A reasonable default, as on the Team page: a bit better than winning 4 of every 7.
  const suggested = totals ? Math.round(totals.total * 0.6) : 1;
  const [goal, setGoal] = useState<number | null>(null);
  if (season.isPending || !me.data) return <Loading label="Loading your season" />;
  const phase = me.data.position.phase;
  // The same rule as the Team page: set before the season starts (or during a Head Start).
  const open = s !== null && totals !== null && (totals.headStart || (s.status === 'upcoming' && phase !== 'season'));
  const value = goal ?? s?.winGoal ?? suggested;
  const save = () => {
    if (!open || !s || value === s.winGoal) onNext();
    else update.mutate({ seasonId: s.id, winGoal: value }, { onSuccess: onNext });
  };
  return (
    <>
      <section className="card">
        {open && totals ? (
          <>
            <p className="lede">
              How many wins are you going for this {vocab.term.season.toLowerCase()}? There are {totals.total} games. Winning 4 of
              every 7 is a winning record; {suggested} is a good stretch.
            </p>
            <Stepper label={`${vocab.terms.winGoal} (wins)`} value={value} min={1} max={totals.total} onChange={setGoal} />
            <p className="field__hint">It locks once the season starts.</p>
          </>
        ) : (
          <p className="lede">
            {s?.winGoal !== null && s?.winGoal !== undefined
              ? `Your goal this ${vocab.term.season.toLowerCase()} is ${s.winGoal} wins. `
              : ''}
            Goals lock once a {vocab.term.season.toLowerCase()} starts, so you’ll set the next one in the {vocab.term.offseason}{' '}
            before it begins.
          </p>
        )}
        {update.isError ? <p className="notice notice--error">{errorMessage(update.error)}</p> : null}
      </section>
      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" disabled={update.isPending} onClick={save}>
          {update.isPending ? 'Saving…' : open ? 'Set my goal' : 'Next'}
        </button>
      </StepActions>
    </>
  );
}

/** For an account that already has a team: what this run-through is for. */
function ReturningNote() {
  const tasks = useTasksQuery();
  if (!tasks.data || tasks.data.length === 0) return null;
  return (
    <p className="notice">
      A quick check-in: your team, tasks, week and {vocab.terms.winGoal.toLowerCase()}, all filled in with what you have. Change
      anything, or just tap through.
    </p>
  );
}

// ── 5. Start ─────────────────────────────────────────────────────────────────

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
