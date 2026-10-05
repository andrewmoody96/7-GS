// Demo data for the frontend: user demo@7gs.local with 8 recurring tasks and 2 one-offs,
// 7 starters, last week's complete series and this week's games so far, all produced by
// replaying each day through the real API (in-process) with a simulated clock, then
// running the finalizer after each midnight. This week's card is opened (every lineup
// built) with a one-off pinch hitter today and another later in the week; from Friday,
// next week's card is opened too. Prints a session token to use as a Bearer token.
//
//   pnpm --filter @7gs/api seed:demo            # PGlite in apps/api/.data (stop `dev` first)
//   DATABASE_URL=postgres://… pnpm --filter @7gs/api seed:demo
//   SEED_TZ=Asia/Tokyo pnpm --filter @7gs/api seed:demo

import { connect } from 'node:net';
import {
  ApiError,
  buildPath,
  endpoints,
  type EndpointName,
  type GameDto,
  type RequestBody,
  type ResponseBody,
} from '@7gs/contracts';
import {
  addDays,
  compareDates,
  hashSeed,
  isValidTimeZone,
  localDateOf,
  startOfLocalDay,
  startOfWeek,
  weekday,
  zonedTimeToInstant,
  type LocalDate,
} from '@7gs/rules';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { ManualClock, systemClock } from '../src/clock';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { loginTokens, users } from '../src/db/schema';
import { cryptoDice, type Deps } from '../src/deps';
import { silentLogger } from '../src/logger';
import { createSession } from '../src/services/auth';
import { runFinalizer } from '../src/services/finalizer';

const EMAIL = 'demo@7gs.local';
const TZ = process.env.SEED_TZ ?? 'America/Chicago';
if (!isValidTimeZone(TZ)) throw new Error(`Unknown time zone: ${TZ}`);

const TASKS = [
  { name: 'Morning workout', points: 2 },
  { name: 'Read 20 pages', points: 1 },
  { name: 'Inbox zero', points: 1 },
  { name: 'Walk the dog', points: 1 },
  { name: 'Meditate', points: 1 },
  { name: 'Cook dinner', points: 2 },
  { name: 'Practice guitar', points: 1 },
  { name: 'Stretch', points: 1 },
  { name: 'Buy birthday gift', points: 1, kind: 'one_off' },
  { name: 'Renew passport', points: 2, kind: 'one_off' },
] as const;
type TaskName = (typeof TASKS)[number]['name'];

interface StarterPlan {
  name: string;
  threshold: number;
  minTasks: number | null;
  lockTime: string | null;
  lineup: [TaskName, boolean][];
  bench: TaskName[];
}

const STARTERS: Record<number, StarterPlan> = {
  1: {
    name: 'Gym Day',
    threshold: 4,
    minTasks: null,
    lockTime: '09:00',
    lineup: [['Morning workout', true], ['Read 20 pages', false], ['Inbox zero', false], ['Walk the dog', false]],
    bench: ['Stretch'],
  },
  2: {
    name: 'Deep Work',
    threshold: 3,
    minTasks: null,
    lockTime: null,
    lineup: [['Inbox zero', true], ['Read 20 pages', false], ['Meditate', false], ['Walk the dog', false]],
    bench: ['Stretch'],
  },
  3: {
    name: 'Midweek Grind',
    threshold: 4,
    minTasks: 2,
    lockTime: null,
    lineup: [['Morning workout', true], ['Cook dinner', false], ['Walk the dog', false]],
    bench: ['Practice guitar'],
  },
  4: {
    name: 'Creative Day',
    threshold: 2,
    minTasks: null,
    lockTime: null,
    lineup: [['Practice guitar', true], ['Read 20 pages', false], ['Meditate', false]],
    bench: ['Stretch'],
  },
  5: {
    name: 'Finish Strong',
    threshold: 4,
    minTasks: null,
    lockTime: null,
    lineup: [['Inbox zero', true], ['Morning workout', false], ['Cook dinner', false]],
    bench: ['Walk the dog'],
  },
  6: {
    name: 'Weekend Warrior',
    threshold: 3,
    minTasks: null,
    lockTime: null,
    lineup: [['Walk the dog', true], ['Cook dinner', false], ['Practice guitar', false], ['Stretch', false]],
    bench: [],
  },
  7: {
    name: 'Rest & Reset',
    threshold: 2,
    minTasks: 2,
    lockTime: null,
    lineup: [['Meditate', true], ['Read 20 pages', false], ['Stretch', false]],
    bench: ['Walk the dog'],
  },
};

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

/** Deterministic "did they do it" so re-running the seed gives the same week. */
function done(date: LocalDate, task: string, required: boolean): boolean {
  return hashSeed(`${date}:${task}`) % 100 < (required ? 85 : 70);
}

const config = loadConfig();
if (config.database.kind === 'pglite' && (await portInUse(config.port))) {
  console.error(
    `Something is listening on :${config.port}. Stop the dev server first: PGlite (${config.database.dataDir}) is single-process.`,
  );
  process.exit(1);
}

const database = await createDatabase(config.database);
await database.migrate();
const { db } = database;

// SEED_NOW (an ISO instant) replays as if it were then, e.g. a Friday to see next week's card.
const realNow = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : systemClock.now();
if (Number.isNaN(realNow.getTime())) throw new Error(`Invalid SEED_NOW: ${process.env.SEED_NOW}`);
const today = localDateOf(realNow, TZ);
// Sign up on the Monday a week before this one: last week's series is complete and
// this week's games run up to today (no Spring Training).
const signup = addDays(startOfWeek(today), -7);
const clock = new ManualClock(zonedTimeToInstant(signup, '07:00', TZ));

await db.delete(users).where(eq(users.email, EMAIL));
await db.delete(loginTokens).where(eq(loginTokens.email, EMAIL));

const deps: Deps = {
  db,
  clock,
  log: silentLogger,
  config: { cookieSecure: false, validateResponses: true },
  mailer: null,
  rollDice: cryptoDice,
};
const app = createApp(deps);
let bearer = '';

async function call<N extends EndpointName>(
  name: N,
  params: Record<string, string | number> = {},
  body?: RequestBody<N>,
): Promise<ResponseBody<N>> {
  const def = endpoints[name];
  const res = await app.request(buildPath(def.path, params), {
    method: def.method,
    headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`${name} failed: ${JSON.stringify(ApiError.safeParse(json).data ?? json)}`);
  return def.response.parse(json) as ResponseBody<N>;
}

// Sign in through the real magic-link flow.
const link = await call('requestMagicLink', {}, { email: EMAIL });
const verify = await app.request('/v1/auth/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: link.devToken, timezone: TZ }),
});
bearer = /7gs_session=([^;]+)/.exec(verify.headers.get('set-cookie') ?? '')?.[1] ?? '';
if (!bearer) throw new Error('Sign-in failed');
await call('updateMe', {}, { displayName: 'Demo Dingers' });

const ids = {} as Record<TaskName, string>;
for (const task of TASKS) ids[task.name] = (await call('createTask', {}, task)).id;
for (const [weekday, plan] of Object.entries(STARTERS)) {
  await call('putStarter', { weekday }, {
    name: plan.name,
    threshold: plan.threshold,
    minTasks: plan.minTasks,
    lockTime: plan.lockTime,
    lineup: plan.lineup.map(([task, required], i) => ({ taskId: ids[task], position: i + 1, required })),
    bench: plan.bench.map((task, i) => ({ taskId: ids[task], position: i + 1 })),
  });
}

async function playGame(game: GameDto, date: LocalDate, until: Date): Promise<number> {
  let checked = 0;
  let minute = 0;
  for (const entry of game.entries.filter((e) => e.role === 'lineup')) {
    minute += 50 + (hashSeed(entry.id) % 70);
    const at = new Date(zonedTimeToInstant(date, '08:00', TZ).getTime() + minute * 60_000);
    if (at.getTime() > until.getTime()) break;
    if (!done(date, entry.taskName, entry.required)) {
      if (entry.required && hashSeed(`${date}:partial`) % 2 === 0) {
        clock.set(at);
        await call('patchEntry', { gameId: game.id, entryId: entry.id }, { partial: true });
      }
      continue;
    }
    clock.set(at);
    await call('completeEntry', { gameId: game.id, entryId: entry.id }, { clientAt: at.toISOString() });
    checked++;
  }
  return checked;
}

// Replay every past day: open the app in the morning, check things off, settle at 12:30 a.m.
for (let date = signup; compareDates(date, today) < 0; date = addDays(date, 1)) {
  clock.set(zonedTimeToInstant(date, '07:30', TZ));
  const { games } = await call('getToday');
  for (const game of games) await playGame(game, date, zonedTimeToInstant(date, '23:30', TZ));
  // Settle at 12:30 a.m. — unless that is still in the future (seeding just after
  // midnight), in which case yesterday stays live, as it would in production.
  const settleAt = zonedTimeToInstant(addDays(date, 1), '00:30', TZ);
  clock.set(settleAt.getTime() < realNow.getTime() ? settleAt : realNow);
  await runFinalizer(deps, clock.now());
}

// Today: whatever has been done so far.
clock.set(realNow);
await runFinalizer(deps, realNow);
const todayView = await call('getToday');
let checkedToday = 0;
for (const game of todayView.games) {
  const firstPitch = new Date(Math.max(startOfLocalDay(today, TZ).getTime(), realNow.getTime() - 3 * 3_600_000));
  for (const entry of game.entries.filter((e) => e.role === 'lineup').slice(0, 2)) {
    if (!done(today, entry.taskName, entry.required)) continue;
    await call('completeEntry', { gameId: game.id, entryId: entry.id }, { clientAt: firstPitch.toISOString() });
    checkedToday++;
  }
}

// This week's card: building it lets the frontend plan every day. A one-off pinch hitter
// today raises today's runs to win; another one-off is planned later in the week.
const currentMonday = startOfWeek(today);
const card = await call('getWeek', { startDate: currentMonday });
const pinchHitters: string[] = [];
const todayGame = card.games.find((g) => g.playedDate === today && g.status !== 'final');
if (todayGame) {
  await call('addPinchHitter', { gameId: todayGame.id }, { taskId: ids['Buy birthday gift'] });
  pinchHitters.push(`Buy birthday gift (${today})`);
}
const laterGame = card.games.find((g) => g.playedDate > today && g.status !== 'final');
if (laterGame) {
  await call('addPinchHitter', { gameId: laterGame.id }, { taskId: ids['Renew passport'] });
  pinchHitters.push(`Renew passport (${laterGame.playedDate})`);
}
// Next week's card opens on Friday.
const nextMonday = addDays(currentMonday, 7);
const openedNext = weekday(today) >= 5;
if (openedNext) await call('getWeek', { startDate: nextMonday });

const [user] = await db.select().from(users).where(eq(users.email, EMAIL));
if (!user) throw new Error('Demo user missing');
const token = await createSession(db, user.id, realNow);
const series = await call('getCurrentSeries');
const season = await call('getCurrentSeason');
await database.close();

console.log(`
Seeded ${EMAIL} (${TZ}), signed up ${signup}.
  Season ${season?.number}: ${season?.wins}–${season?.losses}; this series ${series?.wins}–${series?.losses} vs ${series?.opponent.name}
  Today (${today}): ${todayView.games.length} game(s), ${checkedToday} task(s) checked off so far.
  Week card ${currentMonday} built; pinch hitters: ${pinchHitters.join(', ') || 'none'}.
  Next week's card (${nextMonday}): ${openedNext ? 'opened' : 'opens on Friday'}.

Session token (Bearer):
  ${token}

  curl -H "Authorization: Bearer ${token}" http://localhost:${config.port}/v1/today
In the browser, sign in with ${EMAIL} through the magic link (the dev token is returned and logged).
`);
