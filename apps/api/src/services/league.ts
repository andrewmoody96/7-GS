// Each player's league (rules generateLeague, GAME_DESIGN §8): 29 teams drawn once and kept
// in league_teams. Every season they're dealt into two leagues of three divisions, and a
// series' opponent comes from the season's schedule (rules scheduledOpponent): 4 division
// rivals, 5 from the rest of the league, 3 from the other league.

import { generateLeague, hashSeed, leagueSeedFor, replacementTeamName, scheduledOpponent, teamNameNeedsReplacing } from '@7gs/rules';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { leagueTeams, seasons, series, users, type UserRow } from '../db/schema';

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
 * The player's league, drawn the first time it's needed. Drawing it also renames the
 * opponents of every series they already have (all of them, played or not) to their
 * league's schedule, so the whole history reads as one league.
 */
export async function ensureLeague(tx: Db, user: Pick<UserRow, 'id'>): Promise<LeagueTeamRow[]> {
  const existing = await loadLeague(tx, user.id);
  if (existing.length > 0) return existing;

  const drawn = generateLeague(leagueSeedFor(user.id));
  await tx
    .insert(leagueTeams)
    .values(drawn.map((t) => ({ userId: user.id, slot: t.slot, name: t.name, colors: [...t.colors], seed: t.seed })))
    .onConflictDoNothing();
  const league = await loadLeague(tx, user.id);

  const rows = await tx
    .select({ id: series.id, number: series.number, seasonNumber: seasons.number })
    .from(series)
    .innerJoin(seasons, eq(seasons.id, series.seasonId))
    .where(eq(series.userId, user.id));
  for (const row of rows) {
    const team = opponentFor(league, user.id, row.seasonNumber, row.number);
    await tx
      .update(series)
      .set({ opponentName: team.name, opponentColors: [...team.colors], opponentSeed: team.seed })
      .where(eq(series.id, row.id));
  }
  return league;
}

async function loadLeague(tx: Db, userId: string): Promise<LeagueTeamRow[]> {
  const rows = await tx.select().from(leagueTeams).where(eq(leagueTeams.userId, userId)).orderBy(asc(leagueTeams.slot));
  return rows.map((r) => ({ slot: r.slot, name: r.name, colors: [r.colors[0]!, r.colors[1]!], seed: r.seed }));
}

/**
 * Give every account without a league one (renaming their opponents). Run on each deploy
 * (scripts/migrate.ts) and at startup; a no-op once everyone has a league.
 */
export async function assignLeagues(db: Db): Promise<number> {
  const missing = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(leagueTeams, and(eq(leagueTeams.userId, users.id), eq(leagueTeams.slot, 0)))
    .where(isNull(leagueTeams.userId));
  for (const user of missing) await db.transaction((tx) => ensureLeague(tx, user));
  return missing.length;
}

/**
 * Rename league teams whose names are too long (over rules TEAM_NAME_MAX) or use a retired
 * nickname, keeping their place and colors, and rename them in every series they played.
 * Run on each deploy and at startup; nothing to do once every name fits.
 */
export async function shortenTeamNames(db: Db): Promise<number> {
  const rows = await db.select().from(leagueTeams).orderBy(asc(leagueTeams.userId), asc(leagueTeams.slot));
  const byUser = new Map<string, typeof rows>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  let renamed = 0;
  for (const [userId, teams] of byUser) {
    if (!teams.some((t) => teamNameNeedsReplacing(t.name))) continue;
    await db.transaction(async (tx) => {
      const names = teams.map((t) => t.name);
      for (const [i, team] of teams.entries()) {
        if (!teamNameNeedsReplacing(team.name)) continue;
        const others = names.filter((_, j) => j !== i);
        const name = replacementTeamName(others, hashSeed(`${userId}:rename:${team.slot}`));
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
    });
  }
  return renamed;
}
