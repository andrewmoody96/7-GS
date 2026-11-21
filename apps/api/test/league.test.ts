import { generateLeague, leagueSeedFor, scheduledOpponent } from '@7gs/rules';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { leagueTeams, series } from '../src/db/schema';
import { assignLeagues } from '../src/services/league';
import { CHICAGO, TestApp, useTestDb } from './helpers';

const env = useTestDb();

describe('leagues', () => {
  it('draws a player’s 29-team league once and schedules every series from it', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, userId } = await t.signIn('league@example.com', CHICAGO);
    // Reaching into October's second week creates more series.
    t.at('2026-10-09', '09:00', CHICAGO);
    await t.ok('getToday', { token });

    const league = await env.db.select().from(leagueTeams).where(eq(leagueTeams.userId, userId));
    expect(league).toHaveLength(29);
    expect(league.map((r) => r.name).sort()).toEqual(generateLeague(leagueSeedFor(userId)).map((x) => x.name).sort());

    const rows = await env.db.select().from(series).where(eq(series.userId, userId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const { slot } = scheduledOpponent(leagueSeedFor(userId), 1, row.number);
      expect(row.opponentName).toBe(league.find((l) => l.slot === slot)!.name);
    }
  });

  it('gives an account from before leagues one, renaming its opponents, once', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, userId } = await t.signIn('old-timer@example.com', CHICAGO);
    t.at('2026-10-06', '09:00', CHICAGO);
    await t.ok('getToday', { token });
    // As it was before leagues: no league, and opponents with the old names.
    await env.db.delete(leagueTeams).where(eq(leagueTeams.userId, userId));
    await env.db.update(series).set({ opponentName: 'Snooze City Alarms' }).where(eq(series.userId, userId));

    expect(await assignLeagues(env.db)).toBe(1);
    const rows = await env.db.select().from(series).where(eq(series.userId, userId));
    expect(rows.every((r) => r.opponentName !== 'Snooze City Alarms')).toBe(true);
    const league = generateLeague(leagueSeedFor(userId));
    for (const row of rows) expect(row.opponentName).toBe(league[scheduledOpponent(leagueSeedFor(userId), 1, row.number).slot]!.name);

    // Already done: nothing more to do.
    expect(await assignLeagues(env.db)).toBe(0);
  });
});
