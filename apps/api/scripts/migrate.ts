// Apply pending migrations and exit: Heroku's release phase (see the Procfile), so a
// deploy with a bad migration never reaches the web dyno. The server also migrates at
// startup, which is a no-op after this.
//
//   pnpm --filter @7gs/api migrate

import { databaseOptionsFromEnv, createDatabase } from '../src/db/client';
import { DEFAULT_DATA_DIR } from '../src/config';

const options = databaseOptionsFromEnv(process.env, process.env.PGLITE_DATA_DIR ?? DEFAULT_DATA_DIR, process.env.NODE_ENV === 'production');
const database = await createDatabase(options);
try {
  await database.migrate();
  console.log(`Migrations applied (${database.kind}).`);
} finally {
  await database.close();
}
