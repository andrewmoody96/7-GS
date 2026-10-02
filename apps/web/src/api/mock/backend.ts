// In-browser fake of the /v1 API. It implements every endpoint in the contracts
// registry (the handler table below is type-checked against it), validates request
// bodies with the same Zod schemas the API uses, and persists to localStorage.

import {
  endpoints,
  type EndpointName,
  type LineupPatchDto,
  type MePatchDto,
  type ResponseBody,
  type StarterPutDto,
} from '@7gs/contracts';
import { localDateOf, type Weekday } from '@7gs/rules';
import { ApiError, type RawCallOptions } from '../client';
import { loadDb, saveDb, type MockDb, type ScenarioName, type UserWorld } from './db';
import * as engine from './engine';
import { cryptoRandom, cryptoRoll, idFactory } from './ids';
import { DEMO_EMAIL, freshWorld, seedDemo } from './seed';

export interface MockBackendOptions {
  /** Defaults to window.localStorage when available; pass null for memory only. */
  storage?: Storage | null;
  /** The device clock. Tests inject a fixed one. */
  realNow?: () => number;
  /** Artificial network delay so optimistic UI is visible in the demo. */
  latencyMs?: number;
  timeZone?: string;
  /** Scenario to seed when nothing is stored yet. */
  scenario?: ScenarioName;
  /** Ignore anything stored and start from a fresh seed. */
  fresh?: boolean;
}

interface Ctx {
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  now: Date;
  world: () => UserWorld;
}

type HandlerTable = { [N in EndpointName]: (ctx: Ctx) => ResponseBody<N> };

function defaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class MockBackend {
  private db: MockDb;
  private readonly storage: Storage | null;
  private readonly realNow: () => number;
  readonly latencyMs: number;
  readonly timeZone: string;
  private readonly env: engine.Env;

  constructor(options: MockBackendOptions = {}) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.realNow = options.realNow ?? (() => Date.now());
    this.latencyMs = options.latencyMs ?? 0;
    this.timeZone = options.timeZone ?? deviceTimeZone();
    this.env = { ids: idFactory(cryptoRandom, () => this.now().getTime()), roll: cryptoRoll };
    const stored = options.fresh ? null : loadDb(this.storage);
    this.db = stored ?? this.seed(options.scenario ?? 'midseason');
    this.persist();
  }

  private seed(scenario: ScenarioName): MockDb {
    return seedDemo({ realNow: new Date(this.realNow()), timeZone: this.timeZone, scenario });
  }

  private persist(): void {
    saveDb(this.storage, this.db);
  }

  /** The demo clock: the device clock shifted to the scenario's pinned moment. */
  now(): Date {
    return new Date(this.realNow() + this.db.clockOffsetMs);
  }

  get scenario(): ScenarioName {
    return this.db.scenario;
  }

  get signedIn(): boolean {
    return this.db.sessionUserId !== null;
  }

  /** Re-seeds the demo with `scenario` and signs back in as the demo user. */
  reset(scenario: ScenarioName = this.db.scenario): void {
    this.db = this.seed(scenario);
    this.persist();
  }

  /** Moves the demo clock forward, e.g. a day at a time to watch games go final. */
  advance(ms: number): void {
    this.db.clockOffsetMs += ms;
    this.persist();
  }

  async handle(name: EndpointName, options: RawCallOptions = {}): Promise<unknown> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const def = endpoints[name];
    const now = this.now();

    let body: unknown = undefined;
    if ('body' in def && def.body) {
      const parsed = def.body.safeParse(options.body);
      if (!parsed.success) {
        throw new ApiError(400, 'VALIDATION_FAILED', 'The request body is invalid.', {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      body = parsed.data;
    }

    const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const params = Object.fromEntries(Object.entries(options.params ?? {}).map(([k, v]) => [k, String(v)]));
    let world: UserWorld | null = null;
    const ctx: Ctx = {
      params,
      body,
      headers,
      now,
      world: () => {
        if (world) return world;
        const found = this.db.worlds.find((w) => w.user.id === this.db.sessionUserId);
        if (!found) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
        engine.sync(found, this.env, now);
        world = found;
        return found;
      },
    };
    const requiresAuth = !('auth' in def && def.auth === false);
    if (requiresAuth) ctx.world();

    try {
      const result = (this.handlers[name] as (ctx: Ctx) => unknown)(ctx);
      // A JSON round trip, like the network, so callers never hold references to mock state.
      return JSON.parse(JSON.stringify(result ?? null)) as unknown;
    } finally {
      this.persist();
    }
  }

  private readonly handlers: HandlerTable = {
    // ── Auth ──
    requestMagicLink: ({ body, now }) => {
      const { email } = body as { email: string };
      const token = randomHex(24);
      this.db.magicLinks = this.db.magicLinks.filter((l) => new Date(l.expiresAt) > now).slice(-20);
      this.db.magicLinks.push({
        token,
        email: email.toLowerCase(),
        expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        usedAt: null,
      });
      return { sent: true, devToken: token };
    },
    verifyMagicLink: ({ body, now }) => {
      const { token, timezone } = body as { token: string; timezone: string };
      const link = this.db.magicLinks.find((l) => l.token === token);
      if (!link || link.usedAt || new Date(link.expiresAt) <= now) {
        throw new ApiError(401, 'UNAUTHORIZED', 'That sign-in link is invalid or has expired.');
      }
      link.usedAt = now.toISOString();
      let world = this.db.worlds.find((w) => w.user.email === link.email);
      const isNewUser = !world;
      if (!world) {
        const local = link.email.split('@')[0] ?? 'Home';
        world = freshWorld({
          id: this.env.ids(),
          email: link.email,
          displayName: `${local.charAt(0).toUpperCase()}${local.slice(1)}`.slice(0, 40) || 'Home Team',
          timezone,
          startDate: localDateOf(now, timezone),
          defaultLockTime: null,
          createdAt: now.toISOString(),
        });
        this.db.worlds.push(world);
      }
      this.db.sessionUserId = world.user.id;
      engine.sync(world, this.env, now);
      return { me: engine.toMeDto(world, now), isNewUser };
    },
    logout: () => {
      this.db.sessionUserId = null;
      return { ok: true };
    },

    // ── Profile & calendar ──
    getMe: ({ world, now }) => engine.toMeDto(world(), now),
    updateMe: ({ world, body, now }) => {
      const w = world();
      const patch = body as MePatchDto;
      if (patch.displayName !== undefined) w.user.displayName = patch.displayName;
      if (patch.timezone !== undefined) w.user.timezone = patch.timezone;
      if (patch.defaultLockTime !== undefined) w.user.defaultLockTime = patch.defaultLockTime;
      return engine.toMeDto(w, now);
    },
    getCalendar: ({ world, now }) => engine.toCalendarDto(world(), now),

    // ── Roster ──
    listTasks: ({ world }) => {
      const w = world();
      return { tasks: w.tasks.map((t) => engine.toTaskDto(w, t)) };
    },
    createTask: ({ world, body, now }) =>
      engine.createTask(world(), this.env, body as { name: string; notes?: string | null; points: number }, now),
    updateTask: ({ world, params, body, now }) =>
      engine.updateTask(world(), params.taskId ?? '', body as { name?: string; notes?: string | null; points?: number }, now),
    retireTask: ({ world, params, now }) => engine.retireTask(world(), params.taskId ?? '', now),
    placeOnInjuredList: ({ world, params, now }) => ({ task: engine.placeOnInjuredList(world(), params.taskId ?? '', now) }),
    activateFromInjuredList: ({ world, params, now }) => ({
      task: engine.activateFromInjuredList(world(), params.taskId ?? '', now),
    }),

    // ── Starters ──
    listStarters: ({ world }) => {
      const w = world();
      return { starters: [...w.starters].sort((a, b) => a.weekday - b.weekday).map((s) => engine.toStarterDto(w, s)) };
    },
    putStarter: ({ world, params, body }) => {
      const day = Number(params.weekday);
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        throw new ApiError(400, 'VALIDATION_FAILED', 'Weekday must be 1 (Monday) to 7 (Sunday).');
      }
      return engine.putStarter(world(), day as Weekday, body as StarterPutDto);
    },

    // ── Games ──
    getToday: ({ world, now }) => engine.toTodayDto(world(), now),
    getGame: ({ world, params }) => {
      const w = world();
      return engine.toGameDto(w, engine.findGame(w, params.gameId ?? ''));
    },
    patchLineup: ({ world, params, body, now }) =>
      engine.patchLineup(world(), this.env, params.gameId ?? '', body as LineupPatchDto, now),
    lockGame: ({ world, params, now }) => engine.lockGame(world(), params.gameId ?? '', now),
    completeEntry: ({ world, params, body, now }) =>
      engine.completeEntry(world(), params.gameId ?? '', params.entryId ?? '', new Date((body as { clientAt: string }).clientAt), now),
    uncompleteEntry: ({ world, params, now }) => engine.uncompleteEntry(world(), params.gameId ?? '', params.entryId ?? '', now),
    patchEntry: ({ world, params, body, now }) =>
      engine.setPartial(world(), params.gameId ?? '', params.entryId ?? '', (body as { partial: boolean }).partial, now),
    substitute: ({ world, params, body, now }) => {
      const { outEntryId, inEntryId } = body as { outEntryId: string; inEntryId: string };
      return engine.substitute(world(), params.gameId ?? '', outEntryId, inEntryId, now);
    },

    // ── Rainouts ──
    getRainoutQuote: ({ world, params, now }) => engine.rainoutQuote(world(), params.gameId ?? '', now),
    callRainout: ({ world, params, body, now }) =>
      engine.callRainout(world(), params.gameId ?? '', (body as { makeupDate: string }).makeupDate, now),

    // ── Rally Cap ──
    getRallyQuote: ({ world, params, now }) => engine.rallyQuote(world(), params.gameId ?? '', now),
    rollRally: ({ world, params, headers, now }) => {
      const key = headers['idempotency-key'];
      if (!key) throw new ApiError(400, 'VALIDATION_FAILED', 'Rolling requires an Idempotency-Key header.');
      const w = world();
      const roll = engine.rollRally(w, this.env, params.gameId ?? '', key, now);
      return { roll: engine.toRallyRollDto(roll), game: engine.toGameDto(w, engine.findGame(w, roll.gameId)) };
    },

    // ── Series & seasons ──
    getCurrentSeries: ({ world, now }) => {
      const w = world();
      const series = engine.currentSeriesRow(w, now);
      return series ? engine.toSeriesDto(w, series) : null;
    },
    getSeries: ({ world, params }) => engine.seriesDtoById(world(), params.seriesId ?? ''),
    getCurrentSeason: ({ world, now }) => {
      const w = world();
      const season = engine.currentSeasonRow(w, now);
      return season ? engine.toSeasonDto(w, season, now) : null;
    },
    getSeason: ({ world, params, now }) => {
      const w = world();
      return engine.toSeasonDto(w, engine.seasonById(w, params.seasonId ?? ''), now);
    },
    updateSeason: ({ world, params, body, now }) =>
      engine.updateSeasonGoal(world(), params.seasonId ?? '', (body as { winGoal: number }).winGoal, now),
  };
}

export { DEMO_EMAIL };
