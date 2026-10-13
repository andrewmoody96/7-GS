import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { databaseOptionsFromEnv, type DatabaseOptions } from './db/client';
import type { AppConfig } from './deps';
import type { EmailConfig } from './mailer';

export interface ServerConfig {
  port: number;
  production: boolean;
  database: DatabaseOptions;
  app: AppConfig;
  /** Where magic links are sent from; null hands links back as `devToken` (development). */
  email: EmailConfig | null;
  finalizerIntervalMs: number;
}

/** `apps/api/.data/pglite`: the zero-config dev database (git-ignored). */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../.data/pglite', import.meta.url));
/** `apps/web/dist`: the PWA build, served by the API in production (one origin, one dyno). */
export const DEFAULT_WEB_ROOT = fileURLToPath(new URL('../../web/dist', import.meta.url));

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`The server is not configured for production:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

function flag(value: string | undefined, fallback: boolean): boolean {
  return value === undefined || value === '' ? fallback : value === 'true' || value === '1';
}

function emailFromEnv(env: NodeJS.ProcessEnv, problems: string[]): EmailConfig | null {
  const from = env.EMAIL_FROM?.trim();
  const resend = env.RESEND_API_KEY?.trim();
  const postmark = env.POSTMARK_API_TOKEN?.trim();
  if (!resend && !postmark) return null;
  if (!from) {
    problems.push('EMAIL_FROM is required to send sign-in links (e.g. "7-Game Series <play@yourdomain.com>").');
    return null;
  }
  return resend ? { provider: 'resend', apiKey: resend, from } : { provider: 'postmark', apiKey: postmark!, from };
}

/**
 * Read the environment. Development needs nothing; production (NODE_ENV=production)
 * refuses to start rather than run with a throwaway database or open sign-in.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const problems: string[] = [];

  const hasDatabaseUrl = Boolean(env.DATABASE_URL?.trim());
  if (production && !hasDatabaseUrl && !env.PGLITE_DATA_DIR) {
    problems.push('DATABASE_URL is not set (on Heroku: heroku addons:create heroku-postgresql:essential-0).');
  }

  const email = emailFromEnv(env, problems);
  const allowDevLogin = flag(env.ALLOW_DEV_LOGIN, !production);
  if (production && !email && !allowDevLogin) {
    problems.push(
      'No email provider: set RESEND_API_KEY or POSTMARK_API_TOKEN, plus EMAIL_FROM. ' +
        '(ALLOW_DEV_LOGIN=true skips email for a private trial: anyone could then sign in as any address.)',
    );
  }

  const appUrl = env.APP_URL?.trim().replace(/\/+$/, '') || null;
  if (appUrl && !/^https?:\/\/[^/]+$/.test(appUrl)) {
    problems.push(`APP_URL must be an origin like https://my-app.herokuapp.com (got "${appUrl}").`);
  }
  if (production && email && !appUrl) {
    problems.push('APP_URL is required to build the links in sign-in emails (e.g. https://my-app.herokuapp.com).');
  }

  const webRoot = env.WEB_ROOT?.trim() || DEFAULT_WEB_ROOT;
  const serveWeb = flag(env.SERVE_WEB, production);
  if (serveWeb && !existsSync(`${webRoot}/index.html`)) {
    problems.push(`SERVE_WEB is on but ${webRoot}/index.html is missing: build the web app first (pnpm run build).`);
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    port: Number(env.PORT ?? 8787),
    production,
    database: databaseOptionsFromEnv(env, env.PGLITE_DATA_DIR ?? DEFAULT_DATA_DIR, production),
    app: {
      cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
      validateResponses: env.VALIDATE_RESPONSES ? env.VALIDATE_RESPONSES === 'true' : !production,
      logRequests: env.LOG_REQUESTS ? env.LOG_REQUESTS === 'true' : true,
      appUrl,
      webRoot: serveWeb ? webRoot : null,
      forceHttps: flag(env.FORCE_HTTPS, production),
      allowDevLogin,
      limitMagicLinks: flag(env.LIMIT_MAGIC_LINKS, production),
    },
    email,
    finalizerIntervalMs: Number(env.FINALIZER_INTERVAL_MS ?? 15 * 60_000),
  };
}
