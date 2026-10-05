// Demo data for mock mode. Each scenario pins a demo clock to a weekday near the real
// date, creates the demo user's roster and rotation, then *plays* the season up to
// that moment through the same engine functions the mock API uses, so every record,
// streak and allowance is internally consistent.

import {
  addDays,
  localDateOf,
  startOfWeek,
  weekday,
  zonedTimeToInstant,
  type LocalDate,
  type Weekday,
} from '@7gs/rules';
import { MOCK_DB_VERSION, type MockDb, type ScenarioName, type StarterRow, type UserRow, type UserWorld } from './db';
import * as engine from './engine';
import { cryptoRoll, idFactory, seededRandom } from './ids';

export const DEMO_USER_ID = '01920000-0000-7000-8000-000000000001';
export const DEMO_EMAIL = 'demo@7gs.app';
export const DEMO_TEAM = 'Early Risers';

type TaskKey =
  | 'workout'
  | 'deepwork'
  | 'read'
  | 'inbox'
  | 'spanish'
  | 'tidy'
  | 'walk'
  | 'mealprep'
  | 'guitar'
  | 'coldshower'
  /** A one-off signed during the demo week (see `planTheWeek`). */
  | 'passport';

const TASKS: { key: TaskKey; name: string; points: number; notes: string | null }[] = [
  { key: 'workout', name: 'Morning workout', points: 2, notes: '30 minutes. Anything that gets the heart rate up.' },
  { key: 'deepwork', name: 'Deep work block', points: 3, notes: '90 minutes, phone in another room.' },
  { key: 'read', name: 'Read 20 pages', points: 1, notes: null },
  { key: 'inbox', name: 'Inbox zero', points: 1, notes: null },
  { key: 'spanish', name: 'Practice Spanish', points: 1, notes: 'One lesson.' },
  { key: 'tidy', name: '10-minute tidy', points: 1, notes: null },
  { key: 'walk', name: 'Evening walk', points: 1, notes: null },
  { key: 'mealprep', name: 'Meal prep', points: 2, notes: 'Lunches for three days.' },
  { key: 'guitar', name: 'Guitar practice', points: 1, notes: 'Scales, then one song.' },
  { key: 'coldshower', name: 'Cold shower', points: 1, notes: null },
];

interface StarterPlan {
  name: string;
  threshold: number;
  minTasks: number | null;
  lockTime: string | null;
  lineup: [TaskKey, boolean][];
  bench: TaskKey[];
}

const STARTERS: Record<Weekday, StarterPlan> = {
  1: {
    name: 'Fresh Start Monday',
    threshold: 5,
    minTasks: null,
    lockTime: '09:00',
    lineup: [['workout', true], ['deepwork', true], ['inbox', false], ['read', false]],
    bench: ['tidy'],
  },
  2: {
    name: 'Tune-up Tuesday',
    threshold: 3,
    minTasks: 3,
    lockTime: null,
    lineup: [['spanish', true], ['read', false], ['tidy', false], ['walk', false], ['guitar', false]],
    bench: ['mealprep'],
  },
  3: {
    name: 'Midweek Grind',
    threshold: 5,
    minTasks: null,
    lockTime: '09:00',
    lineup: [['workout', true], ['deepwork', true], ['spanish', false], ['inbox', false]],
    bench: ['walk'],
  },
  4: {
    name: 'Thursday Focus',
    threshold: 4,
    minTasks: null,
    lockTime: '10:00',
    lineup: [['deepwork', true], ['inbox', false], ['read', false], ['walk', false]],
    bench: ['tidy'],
  },
  5: {
    name: 'Friday Finisher',
    threshold: 5,
    minTasks: null,
    lockTime: '09:00',
    lineup: [['workout', true], ['deepwork', true], ['inbox', false], ['read', false], ['walk', false]],
    bench: ['spanish', 'tidy'],
  },
  6: {
    name: 'Saturday Reset',
    threshold: 4,
    minTasks: 3,
    lockTime: null,
    lineup: [['mealprep', true], ['tidy', false], ['walk', false], ['read', false], ['guitar', false]],
    bench: ['spanish'],
  },
  7: {
    name: 'Sunday Recovery',
    threshold: 3,
    minTasks: null,
    lockTime: null,
    lineup: [['mealprep', true], ['read', false], ['walk', false]],
    bench: ['tidy'],
  },
};

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function emptyWorld(user: UserRow): UserWorld {
  return {
    user,
    tasks: [],
    starters: [],
    seasons: [],
    series: [],
    games: [],
    rallyTokens: [],
    rainouts: [],
    rallyRolls: [],
    syncedThrough: null,
  };
}

/** What a brand-new account gets: no roster and seven empty starters. */
export function freshWorld(user: UserRow): UserWorld {
  const world = emptyWorld(user);
  world.starters = WEEKDAY_NAMES.map(
    (name, i): StarterRow => ({
      weekday: (i + 1) as Weekday,
      name: `${name} Starter`,
      threshold: 1,
      minTasks: null,
      lockTime: null,
      lineup: [],
      bench: [],
    }),
  );
  return world;
}

/** The date with weekday `target` closest to `date` (at most 3 days away). */
export function nearestWeekday(date: LocalDate, target: Weekday): LocalDate {
  let delta = target - weekday(date);
  if (delta > 3) delta -= 7;
  if (delta < -3) delta += 7;
  return addDays(date, delta);
}

interface GamePlan {
  complete: TaskKey[];
  partial?: TaskKey[];
}

interface Scripted {
  date: LocalDate;
  time: string;
  run: (now: Date) => void;
}

interface Script {
  demoToday: LocalDate;
  demoTime: string;
  signupDate: LocalDate;
  winGoal: number | null;
  /** Explicit plans by played date (and slot); other past games are played at random. */
  plans: Map<string, GamePlan>;
  /** Plans for the demo day itself, applied only up to the demo time. */
  todayPlans: Map<number, { key: TaskKey; time: string }[]>;
  actions: Scripted[];
}

export interface SeedOptions {
  realNow: Date;
  timeZone: string;
  scenario: ScenarioName;
}

class Seeder {
  readonly world: UserWorld;
  readonly env: engine.Env;
  readonly rng: () => number;
  readonly tz: string;
  clockMs: number;
  taskIds = new Map<TaskKey, string>();

  constructor(tz: string, signupDate: LocalDate, seed: number) {
    this.tz = tz;
    this.rng = seededRandom(seed);
    this.clockMs = zonedTimeToInstant(signupDate, '00:30', tz).getTime();
    this.env = { ids: idFactory(this.rng, () => this.clockMs), roll: cryptoRoll };
    const user: UserRow = {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      displayName: DEMO_TEAM,
      timezone: tz,
      startDate: signupDate,
      defaultLockTime: null,
      createdAt: new Date(this.clockMs).toISOString(),
    };
    this.world = emptyWorld(user);
    const now = new Date(this.clockMs);
    for (const t of TASKS) {
      const dto = engine.createTask(this.world, this.env, { name: t.name, notes: t.notes, points: t.points }, now);
      this.taskIds.set(t.key, dto.id);
    }
    this.world.starters = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((day) => {
      const plan = STARTERS[day];
      return {
        weekday: day,
        name: plan.name,
        threshold: plan.threshold,
        minTasks: plan.minTasks,
        lockTime: plan.lockTime,
        lineup: plan.lineup.map(([key, required], i) => ({ taskId: this.id(key), position: i + 1, required })),
        bench: plan.bench.map((key, i) => ({ taskId: this.id(key), position: i + 1 })),
      };
    });
  }

  id(key: TaskKey): string {
    const id = this.taskIds.get(key);
    if (!id) throw new Error(`Unknown task ${key}`);
    return id;
  }

  at(date: LocalDate, time: string): Date {
    const d = zonedTimeToInstant(date, time, this.tz);
    this.clockMs = d.getTime();
    engine.sync(this.world, this.env, d);
    return d;
  }

  gamesOn(date: LocalDate) {
    return this.world.games.filter((g) => g.playedDate === date).sort((a, b) => a.slot - b.slot);
  }

  randomPlan(gameId: string): GamePlan {
    const game = engine.findGame(this.world, gameId);
    const complete: TaskKey[] = [];
    const partial: TaskKey[] = [];
    for (const entry of game.entries.filter((e) => e.role === 'lineup')) {
      const key = this.keyOf(entry.taskId);
      // Tuned so a simulated season lands around a .620 team.
      if (this.rng() < (entry.required ? 0.8 : 0.55)) complete.push(key);
      else if (entry.required && this.rng() < 0.5) partial.push(key);
    }
    return { complete, partial };
  }

  keyOf(taskId: string): TaskKey {
    for (const [key, id] of this.taskIds) if (id === taskId) return key;
    throw new Error(`Unknown task id ${taskId}`);
  }

  play(date: LocalDate, gameId: string, plan: GamePlan, startHour: number): void {
    const game = engine.findGame(this.world, gameId);
    plan.complete.forEach((key, i) => {
      const entry = game.entries.find((e) => e.taskId === this.id(key) && e.role === 'lineup');
      if (!entry) return;
      const minutes = startHour * 60 + i * 55;
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      const now = this.at(date, time);
      engine.completeEntry(this.world, game.id, entry.id, now, now);
    });
    for (const key of plan.partial ?? []) {
      const entry = game.entries.find((e) => e.taskId === this.id(key) && e.role === 'lineup');
      if (!entry || entry.completedClientAt) continue;
      const now = this.at(date, '21:30');
      engine.setPartial(this.world, game.id, entry.id, true, now);
    }
  }

  /** Plays every day from signup through the demo moment and returns that moment. */
  run(script: Script): Date {
    for (let d = script.signupDate; d <= script.demoToday; d = addDays(d, 1)) {
      this.at(d, '00:45');
      if (d === script.signupDate && script.winGoal !== null) {
        const season = this.world.seasons.find((s) => s.number === 1);
        if (season) season.winGoal = script.winGoal;
      }
      const actions = script.actions.filter((a) => a.date === d).sort((a, b) => (a.time < b.time ? -1 : 1));
      // Games are played from 11:00, so earlier actions happen before them and later ones after.
      const morning = actions.filter((a) => a.time < GAMES_START);
      const evening = actions.filter((a) => a.time >= GAMES_START);

      if (d === script.demoToday) {
        for (const action of actions.filter((a) => a.time < script.demoTime)) action.run(this.at(d, action.time));
        for (const game of this.gamesOn(d)) {
          for (const step of script.todayPlans.get(game.slot) ?? []) {
            if (step.time >= script.demoTime) continue;
            const entry = game.entries.find((e) => e.taskId === this.id(step.key) && e.role === 'lineup');
            if (!entry) continue;
            const now = this.at(d, step.time);
            engine.completeEntry(this.world, game.id, entry.id, now, now);
          }
        }
        return this.at(d, script.demoTime);
      }

      for (const action of morning) action.run(this.at(d, action.time));
      for (const game of this.gamesOn(d)) {
        const plan = script.plans.get(`${d}#${game.slot}`) ?? this.randomPlan(game.id);
        this.play(d, game.id, plan, game.slot === 1 ? 11 : 15);
      }
      for (const action of evening) action.run(this.at(d, action.time));
    }
    throw new Error('Demo day was never reached');
  }
}

const GAMES_START = '11:00';

function weekPlan(weekStart: LocalDate, days: Partial<Record<number, GamePlan>>): [string, GamePlan][] {
  return Object.entries(days).map(([offset, plan]) => [`${addDays(weekStart, Number(offset))}#1`, plan as GamePlan]);
}

interface ScenarioDates {
  demoToday: LocalDate;
  signupDate: LocalDate;
  /** Monday of the demo week. */
  weekStart: LocalDate;
}

/** Where each scenario's demo clock lands, relative to the real date. */
export function scenarioDates(scenario: ScenarioName, realToday: LocalDate): ScenarioDates {
  const target: Record<ScenarioName, Weekday> = { midseason: 5, rally: 5, doubleheader: 6, preseason: 4, offseason: 3 };
  const demoToday = nearestWeekday(realToday, target[scenario]);
  const weekStart = startOfWeek(demoToday);
  switch (scenario) {
    case 'preseason':
      // Signed up on Tuesday; Opening Day is next Monday.
      return { demoToday, weekStart, signupDate: addDays(demoToday, -2) };
    case 'offseason':
      // Review Week right after a full 25-series season.
      return { demoToday, weekStart, signupDate: addDays(weekStart, -25 * 7 - 2) };
    default:
      // Week 10 of Season 1, after two days of Spring Training.
      return { demoToday, weekStart, signupDate: addDays(weekStart, -9 * 7 - 2) };
  }
}

function buildScript(seeder: Seeder, scenario: ScenarioName, dates: ScenarioDates): Script {
  const { demoToday, weekStart, signupDate } = dates;
  const world = seeder.world;
  const gameScheduledOn = (date: LocalDate) => {
    const game = world.games.find((g) => g.scheduledDate === date);
    if (!game) throw new Error(`No game scheduled on ${date}`);
    return game;
  };

  const rainoutWednesday: Scripted = {
    date: addDays(weekStart, 1),
    time: '21:30',
    run: (now) => {
      engine.callRainout(world, gameScheduledOn(addDays(weekStart, 2)).id, addDays(weekStart, 5), now);
    },
  };
  const guitarToIl = (date: LocalDate): Scripted => ({
    date,
    time: '08:00',
    run: (now) => {
      engine.placeOnInjuredList(world, seeder.id('guitar'), now);
    },
  });
  const retireColdShower = (date: LocalDate): Scripted => ({
    date,
    time: '20:00',
    run: (now) => {
      engine.retireTask(world, seeder.id('coldshower'), now);
    },
  });
  // Sunday night game planning: open the demo week's card and put a one-off on Thursday
  // as a must-hit. Missed Thursday, it carries over to Friday as a pinch hitter.
  const planTheWeek: Scripted = {
    date: addDays(weekStart, -1),
    time: '20:00',
    run: (now) => {
      const passport = engine.createTask(world, seeder.env, { name: 'Renew passport', notes: 'Photos are in the desk drawer.', points: 1, kind: 'one_off' }, now);
      seeder.taskIds.set('passport', passport.id);
      engine.getWeek(world, seeder.env, weekStart, now);
      const thursday = gameScheduledOn(addDays(weekStart, 3));
      const entries = thursday.entries.map((e) => ({ taskId: e.taskId, position: e.position, required: e.required, role: e.role as 'lineup' | 'bench' }));
      const lineupCount = entries.filter((e) => e.role === 'lineup').length;
      entries.push({ taskId: passport.id, position: lineupCount + 1, required: true, role: 'lineup' });
      engine.patchLineup(world, seeder.env, thursday.id, { entries }, now);
    },
  };
  // After the week locked: promote Saturday's bench bat to a must-hit (runs to win 4 → 5).
  const pinchHitSaturday: Scripted = {
    date: addDays(weekStart, 3),
    time: '20:00',
    run: (now) => {
      engine.pinchHitter(world, seeder.env, gameScheduledOn(addDays(weekStart, 5)).id, seeder.id('spanish'), now);
    },
  };
  const rallyThursday = (roll: number): Scripted => ({
    date: addDays(weekStart, 4),
    time: '08:00',
    run: (now) => {
      engine.rollRally(world, seeder.env, gameScheduledOn(addDays(weekStart, 3)).id, null, now, roll);
    },
  });
  const base = { demoToday, signupDate, plans: new Map<string, GamePlan>(), todayPlans: new Map<number, { key: TaskKey; time: string }[]>() };

  switch (scenario) {
    case 'midseason':
    case 'doubleheader': {
      // Mon W · Tue L (forfeit, warning track) · Wed rained out → Sat doubleheader ·
      // Thu L, overturned by a Rally Cap Friday morning · Fri live (or W on Saturday).
      const plans = new Map<string, GamePlan>(
        weekPlan(weekStart, {
          0: { complete: ['workout', 'deepwork', 'read'] },
          1: { complete: ['read', 'tidy', 'walk'], partial: ['spanish'] },
          3: { complete: ['deepwork'] },
          ...(scenario === 'doubleheader' ? { 4: { complete: ['workout', 'deepwork', 'inbox', 'read', 'walk', 'passport'] } } : {}),
        }),
      );
      const todayPlans = new Map<number, { key: TaskKey; time: string }[]>(
        scenario === 'midseason'
          ? [[1, [{ key: 'workout', time: '12:30' }, { key: 'inbox', time: '14:05' }]]]
          : [[2, [{ key: 'workout', time: '10:15' }]]],
      );
      return {
        ...base,
        demoTime: scenario === 'midseason' ? '18:40' : '11:20',
        winGoal: 110,
        plans,
        todayPlans,
        actions: [
          retireColdShower(addDays(signupDate, 20)),
          planTheWeek,
          rainoutWednesday,
          guitarToIl(addDays(weekStart, 2)),
          pinchHitSaturday,
          rallyThursday(7),
        ],
      };
    }
    case 'rally': {
      // A four-game win streak, then Thursday's forfeit: Friday morning, the Rally Cap
      // window is open with a full odds breakdown (31 − 5 − 5 + 4 = 25%).
      const prevWeek = addDays(weekStart, -7);
      const plans = new Map<string, GamePlan>([
        ...weekPlan(prevWeek, {
          4: { complete: ['inbox'] },
          5: { complete: ['mealprep', 'tidy', 'walk', 'read', 'guitar'] },
          6: { complete: ['mealprep', 'read', 'walk'] },
        }),
        ...weekPlan(weekStart, {
          0: { complete: ['workout', 'deepwork', 'read'] },
          1: { complete: ['spanish', 'read', 'tidy'] },
          3: { complete: ['inbox', 'read'], partial: ['deepwork'] },
        }),
      ]);
      return {
        ...base,
        demoTime: '08:15',
        winGoal: 110,
        plans,
        actions: [retireColdShower(addDays(signupDate, 20)), rainoutWednesday, guitarToIl(addDays(weekStart, 2))],
      };
    }
    case 'preseason':
      return {
        ...base,
        demoTime: '19:00',
        winGoal: null,
        actions: [guitarToIl(addDays(signupDate, 1)), retireColdShower(addDays(signupDate, 1))],
      };
    case 'offseason':
      return { ...base, demoTime: '19:00', winGoal: 110, actions: [retireColdShower(addDays(signupDate, 30))] };
  }
}

const SCENARIO_SEEDS: Record<ScenarioName, number> = {
  midseason: 20261002,
  rally: 20261002,
  doubleheader: 20261002,
  preseason: 7,
  offseason: 175,
};

/** Builds a fresh mock database for `scenario`, with the demo clock pinned for it. */
export function seedDemo({ realNow, timeZone, scenario }: SeedOptions): MockDb {
  const dates = scenarioDates(scenario, localDateOf(realNow, timeZone));
  const seeder = new Seeder(timeZone, dates.signupDate, SCENARIO_SEEDS[scenario]);
  const demoNow = seeder.run(buildScript(seeder, scenario, dates));
  return {
    version: MOCK_DB_VERSION,
    scenario,
    clockOffsetMs: demoNow.getTime() - realNow.getTime(),
    sessionUserId: DEMO_USER_ID,
    magicLinks: [],
    worlds: [seeder.world],
  };
}
