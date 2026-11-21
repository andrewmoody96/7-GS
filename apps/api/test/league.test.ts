import { addDays, generateLeague, leagueSeedFor, scheduledOpponent } from '@7gs/rules';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { leagueTeams, series } from '../src/db/schema';
import { assignLeagues } from '../src/services/league';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

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

describe('standings and titles', () => {
  async function weekOfWins(email: string) {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, userId } = await t.signIn(email, CHICAGO);
    const ids = await createTasks(t, token, [{ name: 'Gym' }]);
    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      await t.ok('putStarter', {
        token,
        params: { weekday },
        body: { name: `Day ${weekday}`, lockTime: null, lineup: [{ taskId: ids.Gym!, position: 1, required: true }], bench: [] },
      });
    }
    for (let i = 0; i < 7; i++) {
      const date = addDays('2026-10-05', i);
      t.at(date, '20:00', CHICAGO);
      const [game] = (await t.ok('getToday', { token })).games;
      await t.ok('completeEntry', { token, params: { gameId: game!.id, entryId: game!.entries[0]!.id }, body: { clientAt: t.clock.now().toISOString() } });
      t.at(addDays(date, 1), '00:30', CHICAGO);
      await t.finalize();
    }
    return { t, token, userId };
  }

  it('shows two leagues of three divisions, with the player 7–0 after a perfect week', async () => {
    const { t, token } = await weekOfWins('standings@example.com');
    t.at('2026-10-12', '09:00', CHICAGO);
    const season = (await t.ok('getCurrentSeason', { token }))!;
    const s = await t.ok('getStandings', { token, params: { seasonId: season.id } });
    expect(s).toMatchObject({ seasonNumber: 1, complete: false, titles: null });
    expect(s.leagues).toHaveLength(2);
    expect(s.leagues.filter((l) => l.yours)).toHaveLength(1);
    for (const lg of s.leagues) {
      expect(lg.rows).toHaveLength(15);
      expect(lg.divisions).toHaveLength(3);
      for (const d of lg.divisions) expect(d.rows).toHaveLength(5);
    }
    const all = s.leagues.flatMap((l) => l.rows);
    expect(all.find((r) => r.you)).toMatchObject({ wins: 7, losses: 0, colors: null });
    // Everyone has played the week: 7 games each.
    for (const r of all) expect(r.wins + r.losses).toBe(7);
    expect(season.titles).toBeNull();
  });

  it('decides titles once the season is over, and counts them in the career', async () => {
    const { t, token } = await weekOfWins('titles@example.com');
    // The rest of the season goes unplayed (losses) and settles; the player checks in weekly.
    for (let day = 7; day <= 84; day += 7) {
      t.at(addDays('2026-10-12', day), '09:00', CHICAGO);
      await t.ok('getMe', { token });
      await t.finalize();
    }
    const { seasons } = await t.ok('listSeasons', { token });
    const first = seasons.find((s) => s.number === 1)!;
    expect(first.status).not.toBe('active');
    expect(first.titles).toEqual({ division: false, league: false });
    const s = await t.ok('getStandings', { token, params: { seasonId: first.id } });
    expect(s.complete).toBe(true);
    for (const r of s.leagues.flatMap((l) => l.rows)) expect(r.wins + r.losses).toBe(84);
    expect(await t.ok('getCareer', { token })).toMatchObject({ divisionTitles: 0, leagueTitles: 0 });
  });
});
