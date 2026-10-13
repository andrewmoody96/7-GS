// Production hosting on one origin: the built PWA from `webRoot` next to /v1, so the
// session cookie stays first-party and no CORS is needed.

import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono, MiddlewareHandler } from 'hono';

const API_PREFIX = /^\/v1(?:\/|$)/;

/** Redirect http:// to https:// behind a TLS-terminating router (Heroku sets x-forwarded-proto). */
export function forceHttps(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header('x-forwarded-proto') === 'http') {
      const url = new URL(c.req.url);
      url.protocol = 'https:';
      url.port = '';
      return c.redirect(url.toString(), 308);
    }
    await next();
    c.header('strict-transport-security', 'max-age=31536000');
  };
}

/** Hashed build output never changes; everything else must be revalidated so updates land. */
function cacheControl(path: string): string {
  return /\/assets\/[^/]+-[\w-]{8,}\.\w+$/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache';
}

export function mountWebApp(app: Hono, root: string): void {
  const isApp = (path: string) => !API_PREFIX.test(path);
  const files = serveStatic({ root });
  const shell = serveStatic({ root, path: 'index.html' });

  // serveStatic returns its Response when it found the file (and calls next() when it
  // didn't), so cache headers only ever land on real files, never on a 404.
  const withCache = (res: Response | void, value: string) => {
    if (res instanceof Response) res.headers.set('cache-control', value);
    return res;
  };

  app.on(['GET', 'HEAD'], '*', async (c, next) => {
    if (!isApp(c.req.path)) return next();
    return withCache(await files(c, next), cacheControl(c.req.path));
  });
  // Client-side routes (/season, /film-room/…, /sign-in?token=…) get the app shell.
  app.on(['GET', 'HEAD'], '*', async (c, next) => {
    if (!isApp(c.req.path) || !(c.req.header('accept') ?? '').includes('text/html')) return next();
    return withCache(await shell(c, next), 'no-cache');
  });
}
