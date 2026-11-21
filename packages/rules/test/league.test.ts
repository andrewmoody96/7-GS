import { describe, expect, it } from 'vitest';
import {
  CONFERENCE_ABBREVIATIONS,
  CONFERENCE_NAMES,
  generateLeague,
  LEAGUE_SIZE,
  leagueSeedFor,
  scheduledOpponent,
  seasonAlignment,
  seasonSchedule,
  seasonStandings,
  replacementTeamName,
  SERIES_PER_SEASON,
  TEAM_NAME_MAX,
  teamNameNeedsReplacing,
  YOU,
  type StandingsGame,
} from '../src';

const seeds = ['user-a', 'user-b', 'user-c', 'user-d'].map(leagueSeedFor);

describe('a player’s league', () => {
  it('has 29 teams: different towns, nicknames and colors, same first letter', () => {
    for (const seed of seeds) {
      const league = generateLeague(seed);
      expect(league).toHaveLength(LEAGUE_SIZE);
      expect(new Set(league.map((t) => t.city)).size).toBe(LEAGUE_SIZE);
      expect(new Set(league.map((t) => t.mascot)).size).toBe(LEAGUE_SIZE);
      expect(new Set(league.map((t) => t.colors.join())).size).toBe(LEAGUE_SIZE);
      for (const t of league) expect(t.mascot[0]).toBe(t.city[0]);
      expect(generateLeague(seed)).toEqual(league);
    }
  });

  it('deals two conferences of three five-team divisions, again every season', () => {
    const seed = seeds[0]!;
    const a = seasonAlignment(seed, 1);
    expect(a.divisions).toHaveLength(6);
    expect(a.divisions.flat().sort((x, y) => x - y)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    for (const d of a.divisions) expect(d).toHaveLength(5);
    const mine = (n: number) => [...seasonAlignment(seed, n).divisions[seasonAlignment(seed, n).divisionOf(YOU)]!].sort().join();
    expect(new Set([1, 2, 3, 4].map(mine)).size).toBeGreaterThan(1);
  });
});

describe('the schedule', () => {
  it('is 4 division rivals, 5 from the rest of the league and 3 from the other, all different', () => {
    for (const seed of seeds) {
      for (let season = 1; season <= 8; season++) {
        const a = seasonAlignment(seed, season);
        const list = seasonSchedule(seed, season);
        expect(list).toHaveLength(SERIES_PER_SEASON);
        expect(new Set(list.map((x) => x.slot)).size).toBe(SERIES_PER_SEASON);
        const tier = (t: string) => list.filter((x) => x.tier === t).map((x) => x.slot);
        expect(tier('division').sort()).toEqual(a.divisions[a.divisionOf(YOU)]!.filter((t) => t !== YOU).sort());
        for (const t of tier('regular')) {
          expect(a.conferenceOf(t)).toBe(a.conferenceOf(YOU));
          expect(a.divisionOf(t)).not.toBe(a.divisionOf(YOU));
        }
        expect(tier('regular')).toHaveLength(5);
        for (const t of tier('irregular')) expect(a.conferenceOf(t)).not.toBe(a.conferenceOf(YOU));
        expect(tier('irregular')).toHaveLength(3);
      }
    }
  });

  it('gets to every team within about a year, and never the same team two weeks running', () => {
    for (const seed of seeds) {
      const run: number[] = [];
      for (let season = 1; season <= 12; season++) for (let n = 1; n <= 12; n++) run.push(scheduledOpponent(seed, season, n).slot);
      for (let i = 1; i < run.length; i++) expect(run[i]).not.toBe(run[i - 1]);
      // Any five seasons in a row (60 series) reach all 29 teams.
      for (let start = 0; start + 60 <= run.length; start += 12) expect(new Set(run.slice(start, start + 60)).size).toBe(LEAGUE_SIZE);
    }
  });

  it('gives a Head Start week a team from the other league that isn’t on the schedule', () => {
    for (const seed of seeds) {
      const head = scheduledOpponent(seed, 1, 0);
      const a = seasonAlignment(seed, 1);
      expect(a.conferenceOf(head.slot)).not.toBe(a.conferenceOf(YOU));
      expect(seasonSchedule(seed, 1).map((x) => x.slot)).not.toContain(head.slot);
    }
  });
});

describe('standings', () => {
  const allGames = (result: (i: number) => 'W' | 'L' | null): StandingsGame[] =>
    Array.from({ length: 84 }, (_, i) => ({ seriesNumber: Math.floor(i / 7) + 1, gameNumber: (i % 7) + 1, result: result(i), margin: result(i) === 'W' ? 2 : -2 }));

  it('counts the player’s real games and everyone’s 84 by the end', () => {
    const seed = seeds[0]!;
    const s = seasonStandings(seed, 1, allGames((i) => (i % 3 === 0 ? 'L' : 'W')), 84);
    expect(s.complete).toBe(true);
    const all = s.conferences.flat();
    expect(all).toHaveLength(30);
    for (const r of all) expect(r.wins + r.losses).toBe(84);
    const me = all.find((r) => r.team === YOU)!;
    expect(me).toMatchObject({ wins: 56, losses: 28 });
    expect(all.reduce((n, r) => n + r.wins, 0)).toBe(all.reduce((n, r) => n + r.losses, 0));
    expect(s.titles).not.toBeNull();
  });

  it('shows the race so far, with games back, and no titles until the season is over', () => {
    const seed = seeds[1]!;
    const games = allGames((i) => (i < 21 ? 'W' : null)).slice(0, 21);
    const s = seasonStandings(seed, 1, games, 21);
    expect(s.complete).toBe(false);
    expect(s.titles).toBeNull();
    for (const r of s.conferences.flat()) expect(r.wins + r.losses).toBe(21);
    for (const d of s.divisions) {
      expect(d[0]!.gamesBack).toBe(0);
      for (let i = 1; i < d.length; i++) expect(d[i]!.gamesBack).toBeGreaterThanOrEqual(d[i - 1]!.gamesBack);
    }
  });

  it('gives a dominant season both titles, and a losing one neither', () => {
    const seed = seeds[2]!;
    expect(seasonStandings(seed, 1, allGames(() => 'W'), 84).titles).toEqual({ division: true, conference: true });
    expect(seasonStandings(seed, 1, allGames(() => 'L'), 84).titles).toEqual({ division: false, conference: false });
  });

  it('can win the season and still lose the division to a hot team', () => {
    // Somewhere across seeds and seasons, a winning record (46–38) isn't enough.
    let found = false;
    for (const seed of seeds) {
      for (let season = 1; season <= 8 && !found; season++) {
        const s = seasonStandings(seed, season, allGames((i) => (i % 84 < 46 ? 'W' : 'L')), 84);
        if (s.titles && !s.titles.division) found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('is the same every time for the same season', () => {
    const seed = seeds[3]!;
    const games = allGames((i) => (i % 2 ? 'W' : 'L'));
    expect(seasonStandings(seed, 2, games, 84)).toMatchObject({ divisions: seasonStandings(seed, 2, games, 84).divisions });
  });
});

describe('team names that fit', () => {
  it('keeps every name within TEAM_NAME_MAX and never uses a retired nickname', () => {
    for (let u = 0; u < 200; u++) {
      for (const t of generateLeague(leagueSeedFor(`fit-${u}`))) {
        expect(t.name.length).toBeLessThanOrEqual(TEAM_NAME_MAX);
        expect(teamNameNeedsReplacing(t.name)).toBe(false);
      }
    }
    expect(teamNameNeedsReplacing('Joplin Johnny-Come-Latelies')).toBe(true);
    expect(teamNameNeedsReplacing('Oxford One-More-Episodes')).toBe(true);
    expect(teamNameNeedsReplacing('Pontiac Pajamas')).toBe(false);
    expect(teamNameNeedsReplacing('Pontiac Procrastinators')).toBe(false); // 23: the most allowed
  });

  it('draws a replacement that fits and clashes with no other team', () => {
    const league = generateLeague(leagueSeedFor('swap')).map((t) => t.name);
    const others = league.slice(1);
    const name = replacementTeamName(others, 42);
    expect(name.length).toBeLessThanOrEqual(TEAM_NAME_MAX);
    expect(teamNameNeedsReplacing(name)).toBe(false);
    const town = (n: string) => n.split(' ').slice(0, -1).join(' ');
    expect(others.map((n) => n.split(' ').at(-1))).not.toContain(name.split(' ').at(-1));
    expect(others.some((n) => n.startsWith(`${town(name)} `))).toBe(false);
  });

  it('names the two conferences, with short forms for division names', () => {
    expect(CONFERENCE_NAMES).toEqual(['Early Bird Conference', 'Night Owl Conference']);
    expect(CONFERENCE_ABBREVIATIONS).toEqual(['EBC', 'NOC']);
  });
});
