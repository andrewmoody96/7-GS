import { Hono } from 'hono';
import type { Deps } from './deps';
import { ApiException, notFound } from './errors';
import { registerRoutes } from './http/router';
import { describeError } from './logger';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/games';
import { profileRoutes } from './routes/profile';
import { rosterRoutes } from './routes/roster';
import { seasonRoutes } from './routes/seasons';

/** The /v1 API. Same-origin behind the web app's Vite proxy, so no CORS. */
export function createApp(deps: Deps): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof ApiException) return c.json(error.toBody(), error.status);
    deps.log.error('Unhandled error', { method: c.req.method, path: c.req.path, error: describeError(error) });
    // The contract has no INTERNAL code yet; CONFLICT + reason INTERNAL keeps the
    // ApiError shape (see the contract change requests).
    const body = new ApiException(500, 'CONFLICT', 'Something went wrong on our side. Please try again.', 'INTERNAL');
    return c.json(body.toBody(), 500);
  });

  app.notFound((c) => c.json(notFound(`${c.req.method} ${c.req.path}`).toBody(), 404));

  registerRoutes(app, deps, [
    ...authRoutes(deps),
    ...profileRoutes(deps),
    ...rosterRoutes(deps),
    ...gameRoutes(deps),
    ...seasonRoutes(deps),
  ]);
  return app;
}
