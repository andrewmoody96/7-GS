// Apply pending migrations and exit: Heroku's release phase (see the Procfile), so a
// deploy with a bad migration never reaches the web dyno. The server also migrates at
// startup, which is a no-op after this.
//
//   pnpm --filter @7gs/api migrate

import { databaseOptionsFromEnv, createDatabase } from '../src/db/client';
import { DEFAULT_DATA_DIR } from '../src/config';
import { finalTeamRename } from '../src/services/league';

const options = databaseOptionsFromEnv(process.env, process.env.PGLITE_DATA_DIR ?? DEFAULT_DATA_DIR, process.env.NODE_ENV === 'production');
const database = await createDatabase(options);
try {
  await database.migrate();
  console.log(`Migrations applied (${database.kind}).`);
  // The one and only team rename (v1.3.1); a no-op on every deploy after.
  const renamed = await finalTeamRename(database.db);
  console.log(renamed === null ? 'Team names: final rename already done.' : `Team names: final rename, ${renamed} renamed.`);
} finally {
  await database.close();
}
