import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seasons, users } from '../src/db/schema';
import { CHICAGO, TestApp, useTestDb } from './helpers';

const env = useTestDb();

/** The data step of 0003: the UPDATE that re-cuts existing seasons as quarters. */
function quarterlyUpdate(): string {
  const file = fileURLToPath(new URL('../drizzle/0003_quarterly_head_start.sql', import.meta.url));
  const statement = readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .find((s) => s.includes('UPDATE "seasons"'));
  if (!statement) throw new Error('0003 has no seasons UPDATE');
  return statement;
}

describe('migration 0003: existing seasons become quarterly', () => {
  it('shortens a 25-series season in place and keeps its record', async () => {
    // Signed up Friday 2026-10-02; Opening Day Monday 2026-10-05.
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { userId } = await t.signIn('old@example.com', CHICAGO);
    const season1 = and(eq(seasons.userId, userId), eq(seasons.number, 1));
    // Put the row back the way the old calendar wrote it, mid-season, with an old-size goal.
    await env.db
      .update(seasons)
      .set({ playEndDate: '2027-03-28', offseasonEndDate: '2027-04-04', status: 'active', winGoal: 120, wins: 3, losses: 1 })
      .where(season1);
    await env.db.insert(seasons).values({
      id: '00000000-0000-7000-8000-000000000002',
      userId,
      number: 2,
      startDate: '2027-04-05',
      playEndDate: '2027-09-26',
      offseasonEndDate: '2027-10-03',
      status: 'upcoming',
      winGoal: null,
      createdAt: new Date('2026-10-02T15:00:00Z'),
    });

    await env.db.execute(sql.raw(quarterlyUpdate()));

    const [s1] = await env.db.select().from(seasons).where(season1);
    expect(s1).toMatchObject({
      startDate: '2026-10-05',
      playEndDate: '2026-12-27',
      offseasonEndDate: '2027-01-03',
      status: 'active',
      winGoal: 84,
      wins: 3,
      losses: 1,
    });
    const [s2] = await env.db
      .select()
      .from(seasons)
      .where(and(eq(seasons.userId, userId), eq(seasons.number, 2)));
    expect(s2).toMatchObject({ startDate: '2027-01-04', playEndDate: '2027-03-28', offseasonEndDate: '2027-04-04', winGoal: null });
  });

  it('leaves a Monday sign-up on its own Opening Day', async () => {
    const t = new TestApp(env.db, '2026-10-05T15:00:00Z');
    const { userId } = await t.signIn('monday@example.com', CHICAGO);
    await env.db.execute(sql.raw(quarterlyUpdate()));
    const [s1] = await env.db
      .select()
      .from(seasons)
      .where(and(eq(seasons.userId, userId), eq(seasons.number, 1)));
    // No goal set stays no goal.
    expect(s1).toMatchObject({ startDate: '2026-10-05', playEndDate: '2026-12-27', winGoal: null });
  });
});

/** The data step of 0019: record seasons that already started on their own as chosen starts. */
function seasonStartsBackfill(): string {
  const file = fileURLToPath(new URL('../drizzle/0019_season_starts.sql', import.meta.url));
  const statement = readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .find((s) => s.includes('UPDATE "users"'));
  if (!statement) throw new Error('0019 has no users UPDATE');
  return statement;
}

describe('migration 0019: seasons start when the player chooses', () => {
  it('keeps a season that already started where it is, and leaves an upcoming one to the player', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const started = await t.signIn('started@example.com', CHICAGO);
    const waiting = await t.signIn('waiting@example.com', CHICAGO);
    // Before 1.4: one player's Season 2 began on its own; the other's is still upcoming.
    const season2 = (userId: string, status: 'active' | 'upcoming') => ({
      id: crypto.randomUUID(),
      userId,
      number: 2,
      startDate: '2027-01-04',
      playEndDate: '2027-03-28',
      offseasonEndDate: '2027-04-04',
      status,
      createdAt: new Date(),
    });
    await env.db.insert(seasons).values([season2(started.userId, 'active'), season2(waiting.userId, 'upcoming')]);

    await env.db.execute(sql.raw(seasonStartsBackfill()));

    const starts = async (userId: string) =>
      (await env.db.select({ seasonStarts: users.seasonStarts }).from(users).where(eq(users.id, userId)))[0]!.seasonStarts;
    expect(await starts(started.userId)).toEqual([{ openingDay: '2027-01-04', headStartFrom: null }]);
    expect(await starts(waiting.userId)).toEqual([]);
  });
});
