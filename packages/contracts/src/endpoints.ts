// The /v1 endpoint registry. The API registers routes from it and the web client
// generates typed calls from it, so a path or shape can only change in one place.

import type { z } from 'zod';
import * as S from './schemas';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointDef {
  method: HttpMethod;
  path: `/v1/${string}`;
  body?: z.ZodType;
  response: z.ZodType;
  /** Defaults to true. */
  auth?: boolean;
}

function endpoint<const E extends EndpointDef>(def: E): E {
  return def;
}

export const endpoints = {
  // Auth
  requestMagicLink: endpoint({
    method: 'POST',
    path: '/v1/auth/magic-link',
    body: S.MagicLinkRequest,
    response: S.MagicLinkResponse,
    auth: false,
  }),
  verifyMagicLink: endpoint({
    method: 'POST',
    path: '/v1/auth/verify',
    body: S.VerifyRequest,
    response: S.Session,
    auth: false,
  }),
  logout: endpoint({ method: 'POST', path: '/v1/auth/logout', response: S.Ok }),

  // Profile & calendar
  getMe: endpoint({ method: 'GET', path: '/v1/me', response: S.Me }),
  updateMe: endpoint({ method: 'PATCH', path: '/v1/me', body: S.MePatch, response: S.Me }),
  getCalendar: endpoint({ method: 'GET', path: '/v1/calendar', response: S.Calendar }),

  // Roster
  listTasks: endpoint({ method: 'GET', path: '/v1/tasks', response: S.TaskList }),
  createTask: endpoint({ method: 'POST', path: '/v1/tasks', body: S.TaskCreate, response: S.Task }),
  updateTask: endpoint({ method: 'PATCH', path: '/v1/tasks/:taskId', body: S.TaskUpdate, response: S.Task }),
  retireTask: endpoint({ method: 'DELETE', path: '/v1/tasks/:taskId', response: S.Task }),
  placeOnInjuredList: endpoint({
    method: 'POST',
    path: '/v1/tasks/:taskId/injured-list',
    response: S.InjuredListResponse,
  }),
  activateFromInjuredList: endpoint({
    method: 'DELETE',
    path: '/v1/tasks/:taskId/injured-list',
    response: S.InjuredListResponse,
  }),

  // Starters
  listStarters: endpoint({ method: 'GET', path: '/v1/starters', response: S.StarterList }),
  putStarter: endpoint({ method: 'PUT', path: '/v1/starters/:weekday', body: S.StarterPut, response: S.Starter }),

  // Games
  getToday: endpoint({ method: 'GET', path: '/v1/today', response: S.Today }),
  getGame: endpoint({ method: 'GET', path: '/v1/games/:gameId', response: S.Game }),
  patchLineup: endpoint({ method: 'PATCH', path: '/v1/games/:gameId/lineup', body: S.LineupPatch, response: S.Game }),
  lockGame: endpoint({ method: 'POST', path: '/v1/games/:gameId/lock', response: S.Game }),
  completeEntry: endpoint({
    method: 'POST',
    path: '/v1/games/:gameId/entries/:entryId/complete',
    body: S.CompleteEntry,
    response: S.Game,
  }),
  uncompleteEntry: endpoint({
    method: 'DELETE',
    path: '/v1/games/:gameId/entries/:entryId/complete',
    response: S.Game,
  }),
  patchEntry: endpoint({
    method: 'PATCH',
    path: '/v1/games/:gameId/entries/:entryId',
    body: S.EntryPatch,
    response: S.Game,
  }),
  addPinchHitter: endpoint({
    method: 'POST',
    path: '/v1/games/:gameId/pinch-hitters',
    body: S.PinchHitter,
    response: S.Game,
  }),
  addToBench: endpoint({
    method: 'POST',
    path: '/v1/games/:gameId/bench',
    body: S.AddToBench,
    response: S.Game,
  }),
  substitute: endpoint({
    method: 'POST',
    path: '/v1/games/:gameId/substitutions',
    body: S.Substitution,
    response: S.Game,
  }),

  // Rainouts
  getRainoutQuote: endpoint({ method: 'GET', path: '/v1/games/:gameId/rainout', response: S.RainoutQuote }),
  callRainout: endpoint({
    method: 'POST',
    path: '/v1/games/:gameId/rainout',
    body: S.RainoutRequest,
    response: S.Series,
  }),

  // Suspended games (emergencies; uses a Rainout allowance)
  getSuspensionQuote: endpoint({ method: 'GET', path: '/v1/games/:gameId/suspension', response: S.SuspensionQuote }),
  suspendGame: endpoint({
    method: 'POST',
    path: '/v1/games/:gameId/suspension',
    body: S.SuspendRequest,
    response: S.Series,
  }),

  // Weekly lineup card
  listWeeks: endpoint({ method: 'GET', path: '/v1/weeks', response: S.WeekList }),
  getWeek: endpoint({ method: 'GET', path: '/v1/weeks/:startDate', response: S.Week }),

  // Rally Cap (POST requires an Idempotency-Key header)
  getRallyQuote: endpoint({ method: 'GET', path: '/v1/games/:gameId/rally', response: S.RallyQuote }),
  rollRally: endpoint({ method: 'POST', path: '/v1/games/:gameId/rally', response: S.RallyResult }),

  // Series & seasons
  getCurrentSeries: endpoint({ method: 'GET', path: '/v1/series/current', response: S.Series.nullable() }),
  getSeries: endpoint({ method: 'GET', path: '/v1/series/:seriesId', response: S.Series }),
  getCurrentSeason: endpoint({ method: 'GET', path: '/v1/seasons/current', response: S.Season.nullable() }),
  getSeason: endpoint({ method: 'GET', path: '/v1/seasons/:seasonId', response: S.Season }),
  updateSeason: endpoint({ method: 'PATCH', path: '/v1/seasons/:seasonId', body: S.SeasonPatch, response: S.Season }),
} as const;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type PathParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

export type PathParams<N extends EndpointName> = Record<PathParamNames<Endpoints[N]['path']>, string | number>;

export type RequestBody<N extends EndpointName> = Endpoints[N] extends { body: infer B extends z.ZodType }
  ? z.input<B>
  : undefined;

export type ResponseBody<N extends EndpointName> = z.output<Endpoints[N]['response']>;

/** Fill `:params` in an endpoint path. Throws if one is missing. */
export function buildPath(path: string, params: Record<string, string | number> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path param "${name}" for ${path}`);
    return encodeURIComponent(String(value));
  });
}
