// Database factory: in-memory PGlite for tests, PGlite on disk as the zero-config dev
// default, and postgres.js when DATABASE_URL is set. Migrations from `apps/api/drizzle`
// are applied by `migrate()` (at startup and in tests).

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;

/**
 * Driver-independent database handle. A transaction (`Tx`) is also a `Db`, so services
 * take a `Db` and work the same inside or outside a transaction.
 *
 * PGlite runs one statement at a time and queues everything behind an open
 * transaction, so code inside `db.transaction(tx => …)` must only ever use `tx`.
 */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export type DatabaseOptions =
  | { kind: 'memory' }
  | { kind: 'pglite'; dataDir: string }
  | { kind: 'postgres'; url: string };

export interface DatabaseHandle {
  db: Db;
  kind: DatabaseOptions['kind'];
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export async function createDatabase(options: DatabaseOptions): Promise<DatabaseHandle> {
  if (options.kind === 'postgres') {
    const client = postgres(options.url, { max: 10, onnotice: () => {} });
    const db = drizzlePostgres({ client, schema });
    return {
      db,
      kind: 'postgres',
      migrate: () => migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => client.end({ timeout: 5 }),
    };
  }

  if (options.kind === 'pglite') mkdirSync(options.dataDir, { recursive: true });
  const client = options.kind === 'pglite' ? new PGlite(options.dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite({ client, schema });
  return {
    db,
    kind: options.kind,
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}

/** Pick the database from the environment: DATABASE_URL, else PGlite in `dataDir`. */
export function databaseOptionsFromEnv(env: NodeJS.ProcessEnv, dataDir: string): DatabaseOptions {
  const url = env.DATABASE_URL?.trim();
  return url ? { kind: 'postgres', url } : { kind: 'pglite', dataDir };
}

const ALL_TABLES = [
  'rally_rolls',
  'rally_tokens',
  'rainout_allowances',
  'lineup_entries',
  'games',
  'series',
  'seasons',
  'day_template_tasks',
  'day_templates',
  'task_definitions',
  'sessions',
  'login_tokens',
  'users',
] as const;

/** Empty every table (tests share one database per file). */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`));
}
