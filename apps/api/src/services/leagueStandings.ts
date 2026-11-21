// Standings and titles (rules seasonStandings, GAME_DESIGN §8): the player's real games
// against their league's season, with the other 29 teams' games simulated from the season's
// strengths. No playoffs: first in the division or the league when the season ends is the
// title.

import type { StandingsDto, StandingsRowDto } from '@7gs/contracts';
import {
  diffDays,
  DIVISION_NAMES,
  CONFERENCE_ABBREVIATIONS,
  CONFERENCE_NAMES,
  leagueSeedFor,
  scoreline,
  seasonStandings,
  SERIES_PER_SEASON,
  YOU,
  type SeasonStandings,
  type StandingsGame,
  type StandingsRow,
} from '@7gs/rules';
import { and, between, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, series, users, type SeasonRow, type UserRow } from '../db/schema';
import { ensureLeague, type LeagueTeamRow } from './league';

const SEASON_DAYS = SERIES_PER_SEASON * 7;

/** The player's final games in a season's 12 series, as standings count them. */
async function standingsGames(tx: Db, seasonId: string): Promise<StandingsGame[]> {
  const rows = await tx
    .select({
      seriesNumber: series.number,
      gameNumber: games.gameNumber,
      result: games.result,
      runs: games.runs,
      threshold: games.threshold,
    })
    .from(games)
    .innerJoin(series, eq(series.id, games.seriesId))
    .where(and(eq(series.seasonId, seasonId), eq(games.status, 'final'), between(series.number, 1, SERIES_PER_SEASON)));
  return rows.map((g) => {
    const result = g.result === 'W' || g.result === 'L' ? g.result : null;
    const line = scoreline({ result, runs: g.runs, threshold: g.threshold ?? 1 });
    return { seriesNumber: g.seriesNumber, gameNumber: g.gameNumber, result, margin: line.us - line.them };
  });
}

/** How many of the season's 84 days have gone final for this player. */
function daysSettled(user: Pick<UserRow, 'finalizedThrough'>, season: SeasonRow): number {
  return Math.max(0, Math.min(SEASON_DAYS, diffDays(user.finalizedThrough, season.startDate) + 1));
}

export async function computeStandings(tx: Db, user: Pick<UserRow, 'id' | 'finalizedThrough'>, season: SeasonRow): Promise<SeasonStandings> {
  return seasonStandings(leagueSeedFor(user.id), season.number, await standingsGames(tx, season.id), daysSettled(user, season));
}

/** A finished season's titles (null while it's still being played). */
export async function seasonTitles(tx: Db, season: SeasonRow): Promise<{ division: boolean; conference: boolean; league: boolean } | null> {
  if (season.status !== 'offseason' && season.status !== 'complete') return null;
  const [user] = await tx.select().from(users).where(eq(users.id, season.userId));
  if (!user) return null;
  return (await computeStandings(tx, user, season)).titles;
}

export async function standingsView(tx: Db, user: UserRow, season: SeasonRow): Promise<StandingsDto> {
  const league = await ensureLeague(tx, user);
  const s = await computeStandings(tx, user, season);
  const row = (r: StandingsRow): StandingsRowDto => {
    const team: LeagueTeamRow | undefined = league.find((t) => t.slot === r.team);
    const played = r.wins + r.losses;
    return {
      you: r.team === YOU,
      name: r.team === YOU ? user.displayName : (team?.name ?? 'Opponent'),
      colors: r.team === YOU || !team ? null : team.colors,
      wins: r.wins,
      losses: r.losses,
      winPct: played === 0 ? 0 : Math.round((r.wins / played) * 1000) / 1000,
      gamesBack: r.gamesBack,
      divWins: r.divWins,
      divLosses: r.divLosses,
      conferenceWins: r.conferenceWins,
      conferenceLosses: r.conferenceLosses,
      runDiff: r.runDiff,
    };
  };
  const myConference = s.alignment.conferenceOf(YOU);
  const myDivision = s.alignment.divisionOf(YOU);
  return {
    seasonId: season.id,
    seasonNumber: season.number,
    complete: s.complete,
    titles: s.titles,
    conferences: [0, 1].map((lg) => ({
      name: CONFERENCE_NAMES[lg]!,
      abbreviation: CONFERENCE_ABBREVIATIONS[lg]!,
      yours: lg === myConference,
      rows: s.conferences[lg]!.map(row),
      divisions: [0, 1, 2].map((d) => {
        const index = lg * 3 + d;
        return { name: DIVISION_NAMES[d]!, yours: index === myDivision, rows: s.divisions[index]!.map(row) };
      }),
    })),
    league: s.league.map(row),
  };
}
