// Apply pending migrations and exit: Heroku's release phase (see the Procfile), so a
// deploy with a bad migration never reaches the web dyno. The server also migrates at
// startup, which is a no-op after this.
//
//   pnpm --filter @7gs/api migrate

import { databaseOptionsFromEnv, createDatabase } from '../src/db/client';
import { DEFAULT_DATA_DIR } from '../src/config';
import { assignLeagues, shortenTeamNames } from '../src/services/league';
import { renameOldOpponents } from '../src/services/opponents';

const options = databaseOptionsFromEnv(process.env, process.env.PGLITE_DATA_DIR ?? DEFAULT_DATA_DIR, process.env.NODE_ENV === 'production');
const database = await createDatabase(options);
try {
  await database.migrate();
  console.log(`Migrations applied (${database.kind}).`);
  // Opponents from before the small-town names get new ones, once.
  const renamed = await renameOldOpponents(database.db);
  console.log(`Opponents renamed: ${renamed}.`);
  // Each account's league of 29 teams; renames its opponents to them, once.
  const leagues = await assignLeagues(database.db);
  console.log(`Leagues assigned: ${leagues}.`);
  // League team names that are too long get shorter ones, once.
  const shortened = await shortenTeamNames(database.db);
  console.log(`Team names shortened: ${shortened}.`);
} finally {
  await database.close();
}
