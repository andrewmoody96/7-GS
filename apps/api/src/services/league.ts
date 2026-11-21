// Each player's league (rules generateLeague, GAME_DESIGN §8): 29 teams drawn once and kept
// in league_teams. Every season they're dealt into two conferences of three divisions, and
// a series' opponent comes from the season's schedule (rules scheduledOpponent): 4 division
// rivals, 5 from the rest of the conference, 3 from the other conference.

import { generateLeague, leagueSeedFor, scheduledOpponent } from '@7gs/rules';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { leagueTeams, type UserRow } from '../db/schema';

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
 * with (series.opponent_*), whatever happens to the league or the name lists later.
 * Nothing here, or anywhere, rewrites them.
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
