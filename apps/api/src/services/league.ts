// Each player's league (rules generateLeague, GAME_DESIGN §8): 29 teams drawn once and kept
// in league_teams. Every season they're dealt into two conferences of three divisions, and
// a series' opponent comes from the season's schedule (rules scheduledOpponent): 4 division
// rivals, 5 from the rest of the conference, 3 from the other conference.

import { generateLeague, hashSeed, leagueSeedFor, replacementTeamName, scheduledOpponent, teamNameNeedsReplacing } from '@7gs/rules';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appSettings, leagueTeams, series, type UserRow } from '../db/schema';

export interface LeagueTeamRow {
  slot: number;
  name: string;
  colors: [string, string];
  seed: number;
}

/** The team a series is against, from the player's league. */
export function opponentFor(league: LeagueTeamRow[], userId: string, seasonNumber: number, seriesNumber: number): LeagueTeamRow {
  const { slot } = scheduledOpponent(leagueSeedFor(userId), seasonNumber, seriesNumber);
  const team = league.find((t) => t.slot === slot);
  if (!team) throw new Error(`League team ${slot} missing for ${userId}`);
  return team;
}

/**
 * The player's league, drawn the first time it's needed and never changed after.
 *
 * Names are permanent: a series keeps the opponent name, colors and seed it was created
 * with (series.opponent_*), whatever happens to the league or the name lists later. The
 * single exception is finalTeamRename below, which runs once ever.
 */
export async function ensureLeague(tx: Db, user: Pick<UserRow, 'id'>): Promise<LeagueTeamRow[]> {
  const existing = await loadLeague(tx, user.id);
  if (existing.length > 0) return existing;

  const drawn = generateLeague(leagueSeedFor(user.id));
  await tx
    .insert(leagueTeams)
    .values(drawn.map((t) => ({ userId: user.id, slot: t.slot, name: t.name, colors: [...t.colors], seed: t.seed })))
    .onConflictDoNothing();
  return loadLeague(tx, user.id);
}

async function loadLeague(tx: Db, userId: string): Promise<LeagueTeamRow[]> {
  const rows = await tx.select().from(leagueTeams).where(eq(leagueTeams.userId, userId)).orderBy(asc(leagueTeams.slot));
  return rows.map((r) => ({ slot: r.slot, name: r.name, colors: [r.colors[0]!, r.colors[1]!], seed: r.seed }));
}

const FINAL_RENAME = 'team-names-final-rename';

/**
 * The one and only rename (v1.3.1, by request): league teams whose names break today's
 * rules (over TEAM_NAME_MAX, or a retired nickname) get new ones, in the league and in every
 * series against them, past ones included. It records that it ran and never runs again;
 * after it, names are permanent (GAME_DESIGN §8). Returns how many teams it renamed, or
 * null if it had already run.
 */
export async function finalTeamRename(db: Db): Promise<number | null> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(appSettings)
      .values({ key: FINAL_RENAME, value: new Date().toISOString() })
      .onConflictDoNothing()
      .returning({ key: appSettings.key });
    if (claimed.length === 0) return null;

    const rows = await tx.select().from(leagueTeams).orderBy(asc(leagueTeams.userId), asc(leagueTeams.slot));
    const byUser = new Map<string, typeof rows>();
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    let renamed = 0;
    for (const [userId, teams] of byUser) {
      const names = teams.map((t) => t.name);
      for (const [i, team] of teams.entries()) {
        if (!teamNameNeedsReplacing(team.name)) continue;
        const name = replacementTeamName(
          names.filter((_, j) => j !== i),
          hashSeed(`${userId}:rename:${team.slot}`),
        );
        names[i] = name;
        await tx
          .update(leagueTeams)
          .set({ name })
          .where(and(eq(leagueTeams.userId, userId), eq(leagueTeams.slot, team.slot)));
        await tx
          .update(series)
          .set({ opponentName: name })
          .where(and(eq(series.userId, userId), eq(series.opponentName, team.name)));
        renamed++;
      }
    }
    return renamed;
  });
}
