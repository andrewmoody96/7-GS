// Bringing a user's state up to `now` on the request path, and GET /v1/today.

import type { TodayDto } from '@7gs/contracts';
import { calendarPosition, localDateOf } from '@7gs/rules';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users, type GameRow, type UserRow } from '../db/schema';
import { unauthorized } from '../errors';
import { findSeriesByStart } from './calendar';
import { catchUpUser, hasDueDate, prepareDay, syncAccount } from './finalizer';
import { gameViews, seriesView } from './views';

/** Today's game(s), created and built lazily, with scheduled locks applied. */
export function ensureToday(tx: Db, user: UserRow, now: Date): Promise<GameRow[]> {
  return prepareDay(tx, user, localDateOf(now, user.timezone), now);
}

export interface SyncOptions {
  /**
   * `games` (default): also create today's games and build their lineups. `account`:
   * only seasons and allowances — used by profile reads, so a brand-new user's first
   * game isn't snapshotted from empty starters before onboarding has filled them in.
   */
  scope?: 'games' | 'account';
}

/**
 * Run `fn` in a transaction for a signed-in user after settling any date that is due
 * (the interval finalizer does the same; this keeps the API correct between runs) and
 * preparing today.
 */
export async function inUserTx<T>(
  db: Db,
  signedIn: UserRow,
  now: Date,
  fn: (tx: Db, user: UserRow) => Promise<T>,
  options: SyncOptions = {},
): Promise<T> {
  if (hasDueDate(signedIn, now)) await catchUpUser(db, signedIn.id, now);
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, signedIn.id));
    if (!user) throw unauthorized();
    if (options.scope === 'account') await syncAccount(tx, user, localDateOf(now, user.timezone), now);
    else await ensureToday(tx, user, now);
    return fn(tx, user);
  });
}

export async function todayView(tx: Db, user: UserRow, now: Date): Promise<TodayDto> {
  const today = localDateOf(now, user.timezone);
  const position = calendarPosition(user.startDate, today);
  const rows = await ensureToday(tx, user, now);
  const seriesRow = position.phase === 'season' ? await findSeriesByStart(tx, user.id, position.seriesStart) : undefined;
  return {
    date: today,
    position,
    games: await gameViews(tx, user, rows, now),
    series: seriesRow ? await seriesView(tx, user, seriesRow, now) : null,
  };
}
