// Routes are registered from the contracts `endpoints` registry: method, path, body
// schema, response schema and auth flag all come from there, so a path or shape can't
// drift between web and API. Handlers only see validated input.

import { endpoints, type EndpointDef, type EndpointName, type Endpoints } from '@7gs/contracts';
import type { Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { Deps } from '../deps';
import { notFound, validationFailed, zodIssues } from '../errors';
import { isUuid } from '../ids';
import { authenticate, type AuthContext } from './session';

type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

type BodyOf<N extends EndpointName> = Endpoints[N] extends { body: infer B extends z.ZodType } ? z.output<B> : undefined;
type AuthOf<N extends EndpointName> = Endpoints[N] extends { auth: false } ? null : AuthContext;
export type ResultOf<N extends EndpointName> = z.input<Endpoints[N]['response']>;

export interface HandlerArgs<N extends EndpointName> {
  c: Context;
  params: Record<ParamNames<Endpoints[N]['path']>, string>;
  body: BodyOf<N>;
  auth: AuthOf<N>;
  /** Read once per request from the injected clock. */
  now: Date;
}

export interface Route<N extends EndpointName> {
  name: N;
  status: ContentfulStatusCode;
  handler: (args: HandlerArgs<N>) => Promise<ResultOf<N>> | ResultOf<N>;
}

export type AnyRoute = { [N in EndpointName]: Route<N> }[EndpointName];

export function route<N extends EndpointName>(
  name: N,
  handler: Route<N>['handler'],
  options: { status?: ContentfulStatusCode } = {},
): Route<N> {
  return { name, handler, status: options.status ?? 200 };
}

/** Path params that name a resource id; anything that isn't a UUID can't exist. */
const ID_PARAMS: Record<string, string> = {
  gameId: 'Game',
  entryId: 'Lineup entry',
  taskId: 'Task',
  seriesId: 'Series',
  seasonId: 'Season',
};

async function parseBody(c: Context, schema: z.ZodType): Promise<unknown> {
  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text);
    } catch {
      throw validationFailed([{ path: '', message: 'The request body must be valid JSON.' }]);
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationFailed(zodIssues(parsed.error));
  return parsed.data;
}

function paramCount(path: string): number {
  return path.split('/').filter((s) => s.startsWith(':')).length;
}

/**
 * Register every endpoint in the registry. Throws at startup if one has no handler or
 * a handler names an unknown endpoint.
 */
export function registerRoutes(app: Hono, deps: Deps, routes: readonly AnyRoute[]): void {
  const byName = new Map<string, AnyRoute>(routes.map((r) => [r.name, r]));
  const missing = Object.keys(endpoints).filter((name) => !byName.has(name));
  if (missing.length > 0) throw new Error(`No handler for endpoints: ${missing.join(', ')}`);
  if (byName.size !== routes.length) throw new Error('An endpoint has more than one handler');

  // Static paths first, so /v1/series/current wins over /v1/series/:seriesId.
  const ordered = [...routes].sort((a, b) => paramCount(endpoints[a.name].path) - paramCount(endpoints[b.name].path));

  for (const r of ordered) {
    const def: EndpointDef = endpoints[r.name];
    app.on(def.method, def.path, async (c) => {
      const now = deps.clock.now();
      const auth = def.auth === false ? null : await authenticate(c, deps, now);
      const params = c.req.param() as Record<string, string>;
      for (const [key, value] of Object.entries(params)) {
        const resource = ID_PARAMS[key];
        if (resource && !isUuid(value)) throw notFound(resource);
      }
      const body = def.body ? await parseBody(c, def.body) : undefined;
      const handler = r.handler as (args: HandlerArgs<EndpointName>) => Promise<unknown> | unknown;
      const result = await handler({ c, params, body, auth, now } as HandlerArgs<EndpointName>);
      if (deps.config.validateResponses) {
        const parsed = def.response.safeParse(result);
        if (!parsed.success) {
          deps.log.error('Response does not match its contract', { endpoint: r.name, issues: zodIssues(parsed.error) });
          throw new Error(`Response for ${r.name} does not match its contract`);
        }
      }
      return c.json(result as never, r.status);
    });
  }
}
