import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { sql } from 'drizzle-orm';
import type { Deps } from './deps';
import { ApiException, notFound } from './errors';
import { registerRoutes } from './http/router';
import { forceHttps, mountWebApp } from './http/web';
import { describeError } from './logger';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/games';
import { profileRoutes } from './routes/profile';
import { rosterRoutes } from './routes/roster';
import { seasonRoutes } from './routes/seasons';
import { weekRoutes } from './routes/weeks';

/**
 * The /v1 API, plus the built web app when `config.webRoot` is set (production). Always
 * same-origin: behind the Vite proxy in development, or serving the PWA itself.
 */
export function createApp(deps: Deps): Hono {
  const app = new Hono();
  if (deps.config.forceHttps) app.use(forceHttps());
  if (deps.config.logRequests) app.use(logger((line) => deps.log.info(line)));
  app.use(secureHeaders({ strictTransportSecurity: false, crossOriginEmbedderPolicy: false }));

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
    ...weekRoutes(deps),
  ]);

  // Uptime checks: the process is up and the database answers.
  app.get('/healthz', async (c) => {
    await deps.db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  if (deps.config.webRoot) mountWebApp(app, deps.config.webRoot);
  return app;
}
