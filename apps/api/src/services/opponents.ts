// Opponent names (rules generateOpponent, GAME_DESIGN §8): a real small town and a nickname
// for putting things off. No town comes round twice until every town has been played.

import { generateOpponent, hashSeed, opponentTown, type Opponent } from '@7gs/rules';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { seasons, series, users } from '../db/schema';

/** The opponent for a new series: towns this player has already faced are skipped. */
export async function nextOpponent(tx: Db, userId: string, seasonNumber: number, seriesNumber: number): Promise<Opponent> {
  const played = await tx.select({ name: series.opponentName }).from(series).where(eq(series.userId, userId));
  return generateOpponent(
    hashSeed(`${userId}:${seasonNumber}:${seriesNumber}`),
    played.map((p) => p.name),
  );
}

/**
 * Rename every opponent still carrying an old name (from before the small towns), oldest
 * series first, so a player's whole history reads the new way and no town repeats. Run on
 * each deploy (scripts/migrate.ts) and at startup; nothing to do once every name is new.
 */
export async function renameOldOpponents(db: Db): Promise<number> {
  const rows = await db
    .select({
      id: series.id,
      userId: series.userId,
      name: series.opponentName,
      number: series.number,
      seasonNumber: seasons.number,
    })
    .from(series)
    .innerJoin(seasons, eq(seasons.id, series.seasonId))
    .innerJoin(users, eq(users.id, series.userId))
    .orderBy(asc(series.userId), asc(series.startDate));
  const byUser = new Map<string, typeof rows>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  let renamed = 0;
  for (const [userId, list] of byUser) {
    if (list.every((r) => opponentTown(r.name) !== null)) continue;
    await db.transaction(async (tx) => {
      const played = list.filter((r) => opponentTown(r.name) !== null).map((r) => r.name);
      for (const row of list) {
        if (opponentTown(row.name) !== null) continue;
        const opponent = generateOpponent(hashSeed(`${userId}:${row.seasonNumber}:${row.number}`), played);
        played.push(opponent.name);
        await tx
          .update(series)
          .set({ opponentName: opponent.name, opponentColors: [...opponent.colors], opponentSeed: opponent.seed })
          .where(eq(series.id, row.id));
        renamed++;
      }
    });
  }
  return renamed;
}
