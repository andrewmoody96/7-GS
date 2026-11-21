import { opponentTown } from '@7gs/rules';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { series } from '../src/db/schema';
import { CHICAGO, TestApp, useTestDb } from './helpers';

const env = useTestDb();

async function account(email: string) {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token, userId } = await t.signIn(email, CHICAGO);
  // A few weeks in: several series created.
  for (const date of ['2026-10-09', '2026-10-16', '2026-10-23']) {
    t.at(date, '09:00', CHICAGO);
    await t.ok('getToday', { token });
  }
  return { t, token, userId };
}

describe('opponents', () => {
  it('names new opponents after small towns, never the same town twice', async () => {
    const { userId } = await account('towns@example.com');
    const rows = await env.db.select().from(series).where(eq(series.userId, userId));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const towns = rows.map((r) => opponentTown(r.opponentName));
    expect(towns.every((t) => t !== null)).toBe(true);
    expect(new Set(towns).size).toBe(towns.length);
  });
});
