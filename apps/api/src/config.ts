import { fileURLToPath } from 'node:url';
import { databaseOptionsFromEnv, type DatabaseOptions } from './db/client';
import type { AppConfig } from './deps';

export interface ServerConfig {
  port: number;
  database: DatabaseOptions;
  app: AppConfig;
  finalizerIntervalMs: number;
}

/** `apps/api/.data/pglite`: the zero-config dev database (git-ignored). */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../.data/pglite', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? 8787),
    database: databaseOptionsFromEnv(env, env.PGLITE_DATA_DIR ?? DEFAULT_DATA_DIR),
    app: {
      cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
      validateResponses: env.VALIDATE_RESPONSES ? env.VALIDATE_RESPONSES === 'true' : !production,
    },
    finalizerIntervalMs: Number(env.FINALIZER_INTERVAL_MS ?? 15 * 60_000),
  };
}
