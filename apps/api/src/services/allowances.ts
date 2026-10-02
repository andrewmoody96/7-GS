// Rally Cap tokens and Rainout allowances (GAME_DESIGN §6–7, DATA_MODEL §4.7).
//
// Monthly grants are keyed by month, so last month's simply stop counting ("expire")
// when the month changes. They are granted on the first game day of each month (the
// 1st, unless it falls in Spring Training or Review Week), because nothing is granted
// for dates outside the season.

import type { AllowancesDto } from '@7gs/contracts';
import { addDays, monthKey, RAINOUT, RALLY, type LocalDate } from '@7gs/rules';
import { and, asc, count, eq, gte, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { rainoutAllowances, rallyTokens, type SeasonRow, type SeriesRow, type UserRow } from '../db/schema';
import { uuidv7 } from '../ids';

export async function ensureMonthlyAllowances(tx: Db, user: UserRow, date: LocalDate, now: Date): Promise<void> {
  const month = monthKey(date);
  const [granted] = await tx
    .select({ n: count() })
    .from(rainoutAllowances)
    .where(and(eq(rainoutAllowances.userId, user.id), eq(rainoutAllowances.source, 'monthly'), eq(rainoutAllowances.month, month)));
  const [tokens] = await tx
    .select({ n: count() })
    .from(rallyTokens)
    .where(and(eq(rallyTokens.userId, user.id), eq(rallyTokens.source, 'monthly'), eq(rallyTokens.month, month)));
  if ((granted?.n ?? 0) >= RAINOUT.perMonth && (tokens?.n ?? 0) >= RALLY.tokensPerMonth) return;

  await tx
    .insert(rallyTokens)
    .values({ id: uuidv7(), userId: user.id, source: 'monthly', month, createdAt: now })
    .onConflictDoNothing();
  await tx
    .insert(rainoutAllowances)
    .values(
      Array.from({ length: RAINOUT.perMonth }, (_, i) => ({
        id: uuidv7(),
        userId: user.id,
        source: 'monthly' as const,
        month,
        seq: i + 1,
        createdAt: now,
      })),
    )
    .onConflictDoNothing();
}

/** Unused rally tokens for `month`. */
export async function availableRallyTokens(tx: Db, userId: string, month: string) {
  return tx
    .select()
    .from(rallyTokens)
    .where(and(eq(rallyTokens.userId, userId), eq(rallyTokens.month, month), isNull(rallyTokens.usedGameId)))
    .orderBy(asc(rallyTokens.source), asc(rallyTokens.createdAt));
}

/** Unused rainouts usable on `today`: this month's monthly ones, then an unexpired Iron Man bonus. */
export async function availableRainouts(tx: Db, userId: string, today: LocalDate) {
  const monthly = await tx
    .select()
    .from(rainoutAllowances)
    .where(
      and(
        eq(rainoutAllowances.userId, userId),
        eq(rainoutAllowances.source, 'monthly'),
        eq(rainoutAllowances.month, monthKey(today)),
        isNull(rainoutAllowances.usedGameId),
      ),
    )
    .orderBy(asc(rainoutAllowances.seq));
  const ironMan = await tx
    .select()
    .from(rainoutAllowances)
    .where(
      and(
        eq(rainoutAllowances.userId, userId),
        eq(rainoutAllowances.source, 'iron_man'),
        isNull(rainoutAllowances.usedGameId),
        gte(rainoutAllowances.expiresOn, today),
      ),
    )
    .orderBy(asc(rainoutAllowances.expiresOn));
  return { monthly, ironMan, all: [...monthly, ...ironMan] };
}

export async function allowancesView(tx: Db, userId: string, today: LocalDate): Promise<AllowancesDto> {
  const month = monthKey(today);
  const tokens = await availableRallyTokens(tx, userId, month);
  const rainouts = await availableRainouts(tx, userId, today);
  return {
    month,
    rallyTokens: tokens.length,
    rainouts: rainouts.all.length,
    ironManBonusHeld: rainouts.ironMan.length > 0,
  };
}

/**
 * Iron Man bonus Rainout (GAME_DESIGN §7): at most one earned per calendar month, at most
 * one held at a time, valid until the season's last game day. Keyed by series, so
 * closing a series twice never grants twice.
 */
export async function grantIronManRainout(
  tx: Db,
  user: UserRow,
  seriesRow: SeriesRow,
  season: SeasonRow,
  now: Date,
): Promise<boolean> {
  const seriesEnd = addDays(seriesRow.startDate, 6);
  const earnedMonth = monthKey(seriesEnd);
  const held = await tx
    .select({ id: rainoutAllowances.id, seriesId: rainoutAllowances.seriesId, earnedMonth: rainoutAllowances.earnedMonth })
    .from(rainoutAllowances)
    .where(and(eq(rainoutAllowances.userId, user.id), eq(rainoutAllowances.source, 'iron_man')));
  if (held.some((a) => a.seriesId === seriesRow.id || a.earnedMonth === earnedMonth)) return false;

  const stillHeld = await tx
    .select({ n: count() })
    .from(rainoutAllowances)
    .where(
      and(
        eq(rainoutAllowances.userId, user.id),
        eq(rainoutAllowances.source, 'iron_man'),
        isNull(rainoutAllowances.usedGameId),
        gte(rainoutAllowances.expiresOn, seriesEnd),
      ),
    );
  if ((stillHeld[0]?.n ?? 0) > 0) return false;

  const inserted = await tx
    .insert(rainoutAllowances)
    .values({
      id: uuidv7(),
      userId: user.id,
      source: 'iron_man',
      expiresOn: season.playEndDate,
      earnedMonth,
      seriesId: seriesRow.id,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: rainoutAllowances.id });
  return inserted.length > 0;
}

/**
 * Series bonus Rally token (GAME_DESIGN §6): a series won without using a Rally Cap
 * earns a 2nd token for the month the series ended in (at most one per month, never
 * more than 2 held).
 */
export async function grantSeriesBonusToken(tx: Db, user: UserRow, seriesRow: SeriesRow, now: Date): Promise<boolean> {
  const month = monthKey(addDays(seriesRow.startDate, 6));
  const held = await availableRallyTokens(tx, user.id, month);
  if (held.length >= RALLY.maxHeld) return false;
  const inserted = await tx
    .insert(rallyTokens)
    .values({ id: uuidv7(), userId: user.id, source: 'series_bonus', month, seriesId: seriesRow.id, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: rallyTokens.id });
  return inserted.length > 0;
}
