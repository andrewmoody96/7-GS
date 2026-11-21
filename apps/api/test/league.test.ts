import { addDays, generateLeague, leagueSeedFor, scheduledOpponent, TEAM_NAME_MAX } from '@7gs/rules';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { leagueTeams, series } from '../src/db/schema';
import { finalTeamRename } from '../src/services/league';
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

  it('shows two conferences of three divisions, with the player 7–0 after a perfect week', async () => {
    const { t, token } = await weekOfWins('standings@example.com');
    t.at('2026-10-12', '09:00', CHICAGO);
    const season = (await t.ok('getCurrentSeason', { token }))!;
    const s = await t.ok('getStandings', { token, params: { seasonId: season.id } });
    expect(s).toMatchObject({ seasonNumber: 1, complete: false, titles: null });
    expect(s.conferences).toHaveLength(2);
    expect(s.conferences.filter((l) => l.yours)).toHaveLength(1);
    for (const lg of s.conferences) {
      expect(lg.rows).toHaveLength(15);
      expect(lg.divisions).toHaveLength(3);
      for (const d of lg.divisions) expect(d.rows).toHaveLength(5);
    }
    const all = s.conferences.flatMap((l) => l.rows);
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
    expect(first.titles).toEqual({ division: false, conference: false });
    const s = await t.ok('getStandings', { token, params: { seasonId: first.id } });
    expect(s.complete).toBe(true);
    for (const r of s.conferences.flatMap((l) => l.rows)) expect(r.wins + r.losses).toBe(84);
    expect(await t.ok('getCareer', { token })).toMatchObject({ divisionTitles: 0, conferenceTitles: 0 });
  });
});

describe('names never change', () => {
  it('keeps every series’ opponent as it was named, even when the league is drawn later', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, userId } = await t.signIn('permanent@example.com', CHICAGO);
    t.at('2026-10-06', '09:00', CHICAGO);
    await t.ok('getToday', { token });
    // A series named under an older scheme, and no league yet (as an account from before).
    await env.db.delete(leagueTeams).where(eq(leagueTeams.userId, userId));
    await env.db.update(series).set({ opponentName: 'Snooze City Alarms' }).where(eq(series.userId, userId));
    const before = (await env.db.select().from(series).where(eq(series.userId, userId))).map((r) => r.id);

    // Weeks go by: new series, and the league gets drawn.
    for (const date of ['2026-10-13', '2026-10-20']) {
      t.at(date, '09:00', CHICAGO);
      await t.ok('getToday', { token });
    }
    expect(await env.db.select().from(leagueTeams).where(eq(leagueTeams.userId, userId))).toHaveLength(29);
    const rows = await env.db.select().from(series).where(eq(series.userId, userId));
    for (const r of rows.filter((x) => before.includes(x.id))) expect(r.opponentName).toBe('Snooze City Alarms');
    // Newer series come from the league.
    expect(rows.filter((x) => !before.includes(x.id)).every((r) => r.opponentName !== 'Snooze City Alarms')).toBe(true);
  });
});

describe('the final rename', () => {
  it('renames teams that break the new rules, past series included, exactly once ever', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token, userId } = await t.signIn('final-rename@example.com', CHICAGO);
    t.at('2026-10-16', '09:00', CHICAGO);
    await t.ok('getToday', { token });
    const [played] = await env.db.select().from(series).where(eq(series.userId, userId)).limit(1);
    const [team] = await env.db.select().from(leagueTeams).where(and(eq(leagueTeams.userId, userId), eq(leagueTeams.name, played!.opponentName)));
    // A name from before the new rules: too long, retired nickname.
    await env.db.update(leagueTeams).set({ name: 'Joplin Johnny-Come-Latelies' }).where(and(eq(leagueTeams.userId, userId), eq(leagueTeams.slot, team!.slot)));
    await env.db.update(series).set({ opponentName: 'Joplin Johnny-Come-Latelies' }).where(eq(series.id, played!.id));

    expect(await finalTeamRename(env.db)).toBe(1);
    const [renamed] = await env.db.select().from(leagueTeams).where(and(eq(leagueTeams.userId, userId), eq(leagueTeams.slot, team!.slot)));
    expect(renamed!.name.length).toBeLessThanOrEqual(TEAM_NAME_MAX);
    expect(renamed!.colors).toEqual(team!.colors);
    const [after] = await env.db.select().from(series).where(eq(series.id, played!.id));
    expect(after!.opponentName).toBe(renamed!.name);
    expect(new Set((await env.db.select().from(leagueTeams).where(eq(leagueTeams.userId, userId))).map((r) => r.name)).size).toBe(29);

    // Never again: a name that breaks the rules later is left as it is.
    await env.db.update(leagueTeams).set({ name: 'Oxford One-More-Episodes' }).where(and(eq(leagueTeams.userId, userId), eq(leagueTeams.slot, team!.slot)));
    expect(await finalTeamRename(env.db)).toBeNull();
    const [kept] = await env.db.select().from(leagueTeams).where(and(eq(leagueTeams.userId, userId), eq(leagueTeams.slot, team!.slot)));
    expect(kept!.name).toBe('Oxford One-More-Episodes');
  });
});
