// Server entry: database (+ migrations), the Hono app on :8787, and the finalizer
// every 15 minutes.

import { serve } from '@hono/node-server';
import { createApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { cryptoDice, type Deps } from './deps';
import { consoleLogger } from './logger';
import { runFinalizer } from './services/finalizer';

const config = loadConfig();
const log = consoleLogger;

const database = await createDatabase(config.database);
await database.migrate();
log.info('Database ready', {
  kind: database.kind,
  ...(config.database.kind === 'pglite' ? { dataDir: config.database.dataDir } : {}),
});

const deps: Deps = {
  db: database.db,
  clock: systemClock,
  log,
  config: config.app,
  mailer: null,
  rollDice: cryptoDice,
};

let finalizing: Promise<void> | null = null;
function finalize(): Promise<void> {
  // Never overlap runs.
  finalizing ??= runFinalizer(deps, systemClock.now())
    .then((report) => {
      if (report.datesSettled > 0 || report.failures > 0) log.info('Finalizer run', { ...report });
    })
    .catch((error: unknown) => log.error('Finalizer crashed', { error: String(error) }))
    .finally(() => {
      finalizing = null;
    });
  return finalizing;
}

await finalize();
const timer = setInterval(() => void finalize(), config.finalizerIntervalMs);

const server = serve({ fetch: createApp(deps).fetch, port: config.port }, (info) => {
  log.info(`7-Game Series API listening on http://localhost:${info.port}`);
});

async function shutdown(signal: string): Promise<void> {
  log.info(`Shutting down (${signal})`);
  clearInterval(timer);
  server.close();
  await finalizing;
  await database.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
