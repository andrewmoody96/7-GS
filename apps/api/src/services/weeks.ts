// The weekly lineup card (GAME_DESIGN §4a). A series is planned as a week: anything goes
// until the week's first pitch (rules.weekLockedAt), then lineups only grow.

import { lineupEditPolicy, weekLockedAt, type LineupEditPolicy } from '@7gs/rules';
import { asc, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, type GameRow, type UserRow } from '../db/schema';
import { gameTimeZone, isDayOver } from './lineups';

/**
 * rules.weekLockedAt over a series' games. Each game is checked in its own zone (the
 * travel rule); an unbuilt game has no lock time yet, so only a recorded lock counts.
 */
export function weekLockOf(rows: readonly GameRow[], user: UserRow, now: Date): Date | null {
  let earliest: Date | null = null;
  for (const g of rows) {
    const lock = weekLockedAt(
      [{ playedDate: g.playedDate, lockedAt: g.lockedAt, lockTime: g.lineupBuiltAt ? g.lockTime : null }],
      gameTimeZone(g, user),
      now,
    );
    if (lock && (earliest === null || lock.getTime() < earliest.getTime())) earliest = lock;
  }
  return earliest;
}

/** Week lock per series id. */
export async function weekLocks(tx: Db, user: UserRow, seriesIds: readonly string[], now: Date): Promise<Map<string, Date | null>> {
  const ids = [...new Set(seriesIds)];
  if (ids.length === 0) return new Map();
  const rows = await tx.select().from(games).where(inArray(games.seriesId, ids)).orderBy(asc(games.gameNumber));
  return new Map(ids.map((id) => [id, weekLockOf(rows.filter((g) => g.seriesId === id), user, now)]));
}

export function editPolicyOf(game: GameRow, user: UserRow, weekLock: Date | null, now: Date): LineupEditPolicy {
  return lineupEditPolicy({
    weekLocked: weekLock !== null,
    gameFinal: game.status === 'final',
    dayOver: isDayOver(game, user, now),
  });
}
