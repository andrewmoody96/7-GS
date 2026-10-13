// Server entry: database (+ migrations), the Hono app on $PORT (8787 in development;
// in production it also serves the built web app), and the finalizer every 15 minutes.

import { serve } from '@hono/node-server';
import { createApp } from './app';
import { systemClock } from './clock';
import { ConfigError, loadConfig } from './config';
import { createDatabase } from './db/client';
import { cryptoDice, type Deps } from './deps';
import { consoleLogger } from './logger';
import { createMailer } from './mailer';
import { runFinalizer } from './services/finalizer';

const log = consoleLogger;
let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  log.error(error.message);
  process.exit(1);
}

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
  mailer: config.email ? createMailer(config.email) : null,
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

if (config.production && !deps.mailer) {
  log.warn('ALLOW_DEV_LOGIN is on: anyone can sign in as any email. Set up RESEND_API_KEY or POSTMARK_API_TOKEN.');
}

const server = serve({ fetch: createApp(deps).fetch, port: config.port }, (info) => {
  log.info(`7-Game Series listening on port ${info.port}`, {
    web: config.app.webRoot ? 'served' : 'not served (dev: run the Vite server)',
    email: config.email?.provider ?? 'none (devToken)',
  });
});

// Catch up on anything that settled while the server was down (or an Eco dyno slept),
// then keep settling every interval. Requests are safe meanwhile: games lock per row.
void finalize();
const timer = setInterval(() => void finalize(), config.finalizerIntervalMs);

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
