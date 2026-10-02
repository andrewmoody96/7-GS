// Test harness: one in-memory PGlite per test file (truncated between tests), a manual
// clock, and an API client that parses every response with its contracts schema.

import {
  ApiError,
  buildPath,
  endpoints,
  type ApiErrorDto,
  type EndpointName,
  type PathParams,
  type ResponseBody,
} from '@7gs/contracts';
import { addDays, zonedTimeToInstant, type LocalDate } from '@7gs/rules';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { createApp } from '../src/app';
import { ManualClock } from '../src/clock';
import { createDatabase, truncateAll, type DatabaseHandle, type Db } from '../src/db/client';
import type { Deps } from '../src/deps';
import { MemoryLogger } from '../src/logger';
import { runFinalizer } from '../src/services/finalizer';

export const CHICAGO = 'America/Chicago';
export const TOKYO = 'Asia/Tokyo';

/** The instant the wall clock in `tz` reads `time` on `date`. */
export function local(date: LocalDate, time: string, tz: string): Date {
  return zonedTimeToInstant(date, time, tz);
}

export function useTestDb(): { readonly db: Db } {
  let handle: DatabaseHandle | undefined;
  beforeAll(async () => {
    handle = await createDatabase({ kind: 'memory' });
    await handle.migrate();
  });
  afterAll(async () => {
    await handle?.close();
  });
  beforeEach(async () => {
    if (handle) await truncateAll(handle.db);
  });
  return {
    get db() {
      if (!handle) throw new Error('Test database not ready');
      return handle.db;
    },
  };
}

type Params<N extends EndpointName> = keyof PathParams<N> extends never ? { params?: undefined } : { params: PathParams<N> };

export type CallOptions<N extends EndpointName> = Params<N> & {
  body?: unknown;
  /** Session token sent as a Bearer token. */
  token?: string;
  /** Raw Cookie header instead of a Bearer token. */
  cookie?: string;
  headers?: Record<string, string>;
  rawBody?: string;
};

export type CallResult<N extends EndpointName> =
  | { ok: true; status: number; data: ResponseBody<N>; headers: Headers }
  | { ok: false; status: number; error: ApiErrorDto['error']; headers: Headers };

export interface SignedIn {
  token: string;
  userId: string;
  setCookie: string;
}

export class TestApp {
  readonly clock: ManualClock;
  readonly log = new MemoryLogger();
  readonly rolls: number[] = [];
  readonly deps: Deps;
  readonly app: ReturnType<typeof createApp>;

  constructor(
    readonly db: Db,
    start: Date | string,
  ) {
    this.clock = new ManualClock(start);
    this.deps = {
      db,
      clock: this.clock,
      log: this.log,
      config: { cookieSecure: false, validateResponses: true },
      mailer: null,
      rollDice: () => {
        const roll = this.rolls.shift();
        if (roll === undefined) throw new Error('Test did not queue a dice roll');
        return roll;
      },
    };
    this.app = createApp(this.deps);
  }

  /** Call an endpoint by registry name; the response is parsed with its schema. */
  async call<N extends EndpointName>(name: N, options: CallOptions<N> = {} as CallOptions<N>): Promise<CallResult<N>> {
    const def = endpoints[name];
    const path = buildPath(def.path, (options.params ?? {}) as Record<string, string | number>);
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.cookie = options.cookie;
    let body: string | undefined = options.rawBody;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['content-type'] = 'application/json';
    }
    const res = await this.app.request(path, { method: def.method, headers, body });
    const json: unknown = await res.json();
    if (res.ok) {
      const parsed = def.response.safeParse(json);
      if (!parsed.success) {
        throw new Error(`${name} response failed its contract: ${JSON.stringify(parsed.error.issues)}\n${JSON.stringify(json)}`);
      }
      return { ok: true, status: res.status, data: parsed.data as ResponseBody<N>, headers: res.headers };
    }
    const parsed = ApiError.safeParse(json);
    if (!parsed.success) throw new Error(`${name} error body is not an ApiError: ${JSON.stringify(json)}`);
    return { ok: false, status: res.status, error: parsed.data.error, headers: res.headers };
  }

  /** Call and expect success. */
  async ok<N extends EndpointName>(name: N, options: CallOptions<N> = {} as CallOptions<N>): Promise<ResponseBody<N>> {
    const result = await this.call(name, options);
    if (!result.ok) throw new Error(`${name} failed with ${result.status}: ${JSON.stringify(result.error)}`);
    return result.data;
  }

  /** Call and expect an ApiError with the given status. */
  async fails<N extends EndpointName>(
    name: N,
    options: CallOptions<N>,
    status: number,
  ): Promise<ApiErrorDto['error']> {
    const result = await this.call(name, options);
    if (result.ok) throw new Error(`${name} unexpectedly succeeded: ${JSON.stringify(result.data)}`);
    expect(result.status).toBe(status);
    return result.error;
  }

  async signIn(email: string, timezone: string): Promise<SignedIn & { isNewUser: boolean }> {
    const link = await this.ok('requestMagicLink', { body: { email } });
    if (!link.devToken) throw new Error('No devToken returned');
    const result = await this.call('verifyMagicLink', { body: { token: link.devToken, timezone } });
    if (!result.ok) throw new Error(`verify failed: ${JSON.stringify(result.error)}`);
    const setCookie = result.headers.get('set-cookie') ?? '';
    const token = /7gs_session=([^;]+)/.exec(setCookie)?.[1];
    if (!token) throw new Error('No session cookie set');
    return { token, userId: result.data.me.id, setCookie, isNewUser: result.data.isNewUser };
  }

  finalize() {
    return runFinalizer(this.deps, this.clock.now());
  }

  /** Move the clock to a wall-clock time in `tz`. */
  at(date: LocalDate, time: string, tz: string): void {
    this.clock.set(local(date, time, tz));
  }
}

/** Create a few tasks and return their ids by name. */
export async function createTasks(
  t: TestApp,
  token: string,
  tasks: { name: string; points?: number }[],
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const task of tasks) {
    const created = await t.ok('createTask', { token, body: task });
    ids[task.name] = created.id;
  }
  return ids;
}

/** Every row of every table, for idempotency checks. */
export async function snapshotDb(db: Db): Promise<Record<string, unknown[]>> {
  const tables = [
    'users',
    'sessions',
    'login_tokens',
    'seasons',
    'series',
    'task_definitions',
    'day_templates',
    'day_template_tasks',
    'games',
    'lineup_entries',
    'rally_tokens',
    'rally_rolls',
    'rainout_allowances',
  ];
  const out: Record<string, unknown[]> = {};
  for (const table of tables) {
    const result = await db.execute(sql.raw(`SELECT * FROM "${table}" ORDER BY 1, 2`));
    out[table] = (result as unknown as { rows: unknown[] }).rows;
  }
  return out;
}

export { addDays };
