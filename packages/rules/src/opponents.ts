// Weekly opponents (GAME_DESIGN §8): a real small town and a nickname for putting things
// off, starting with the same letter (the Pontiac Procrastinators, the Litchfield Last
// Minutemen). Deterministic from a seed; the server stores the name, seed and colors on the
// series, and passes the names already played so a town doesn't come round again until
// every one has been played.

/** Small towns and small cities, by first letter. Each appears once. */
const TOWNS: Record<string, readonly string[]> = {
  A: ['Alpena', 'Ashtabula', 'Abilene', 'Ames', 'Athens', 'Antigo'],
  B: ['Bemidji', 'Bozeman', 'Bangor', 'Beloit', 'Brainerd', 'Buckhannon'],
  C: ['Chillicothe', 'Cheboygan', 'Crookston', 'Clarksdale', 'Cody', 'Cortland'],
  D: ['Dubuque', 'Decorah', 'Dothan', 'Dillon', 'Defiance', 'Dodge City'],
  E: ['Elkhart', 'Escanaba', 'Emporia', 'Eureka', 'Elko', 'Effingham'],
  F: ['Frostburg', 'Fairbanks', 'Flagstaff', 'Fond du Lac', 'Fremont', 'Findlay'],
  G: ['Galena', 'Gillette', 'Gatlinburg', 'Grinnell', 'Glasgow', 'Gunnison'],
  H: ['Hibbing', 'Hannibal', 'Hays', 'Houghton', 'Hazard', 'Hood River'],
  I: ['Ishpeming', 'Ithaca', 'Iola', 'Ironwood', 'Independence', 'Idaho Falls'],
  J: ['Joplin', 'Jasper', 'Juneau', 'Jamestown', 'Jackson Hole', 'Janesville'],
  K: ['Kalamazoo', 'Keokuk', 'Kenosha', 'Kearney', 'Ketchikan', 'Kokomo'],
  L: ['Litchfield', 'Lincoln', 'Laramie', 'Lodi', 'Lake Placid', 'Leadville'],
  M: ['Muncie', 'Mankato', 'Marquette', 'Moab', 'Minot', 'Mount Airy'],
  N: ['Natchez', 'Nacogdoches', 'Newport', 'Nome', 'Norwalk', 'New Ulm'],
  O: ['Oshkosh', 'Ottumwa', 'Oneonta', 'Ouray', 'Oxford', 'Ogallala'],
  P: ['Pontiac', 'Paducah', 'Peoria', 'Petoskey', 'Pocatello', 'Pella'],
  Q: ['Quincy', 'Quitman', 'Quakertown'],
  R: ['Rapid City', 'Red Wing', 'Rolla', 'Roswell', 'Rhinelander', 'Rexburg'],
  S: ['Sheboygan', 'Sandusky', 'Saginaw', 'Sedona', 'Stillwater', 'Spearfish'],
  T: ['Tupelo', 'Traverse City', 'Truckee', 'Taos', 'Tomah', 'Tillamook'],
  W: ['Wausau', 'Walla Walla', 'Winona', 'Wapakoneta', 'Wichita Falls', 'Woodstock'],
  Y: ['Ypsilanti', 'Yankton', 'Yreka', 'Yakima', 'Yuma'],
};

/** Nicknames for putting things off, by first letter (to match the town). */
const NICKNAMES: Record<string, readonly string[]> = {
  A: ['Afternooners', 'Armchairs', 'Alarm Snoozers', 'Also-Rans'],
  B: ['Backloggers', 'Bingers', 'Blanket Hogs', 'Bedbugs'],
  C: ['Couch Potatoes', 'Catnappers', 'Cancellers', 'Crammers'],
  D: ['Dawdlers', 'Daydreamers', 'Deadline Dodgers', 'Doomscrollers'],
  E: ['Excuse Makers', 'Eleventh Hours', 'Extensions', 'Easy Chairs'],
  F: ['Foot Draggers', 'Fritterers', 'Forgetters', 'Fence Sitters'],
  G: ['Goof-Offs', 'Groggies', 'Get-Arounders', 'Grumblers'],
  H: ['Hibernators', 'Hesitators', 'Homebodies', 'Hammocks'],
  I: ['Idlers', 'Idle Hands', 'Indecisives', 'In-a-Minutes'],
  J: ['Just-a-Minutes', 'Jammies', 'Junk Drawers', 'Jet Laggers'],
  K: ['Kickbacks', 'Kick-the-Cans', 'Kettle Watchers', 'Kill-Times'],
  L: ['Last Minutemen', 'Lazies', 'Loafers', 'Loungers', 'Layabouts', 'Latecomers'],
  M: ['Mañanas', 'Meanderers', 'Moseyers', 'Mopers'],
  N: ['Nappers', 'Nightcaps', 'Not-Todays', 'Nodders'],
  O: ['Oversleepers', 'Old Habits', 'Off-Days', 'Ottomans'],
  P: ['Procrastinators', 'Pajamas', 'Ponderers', 'Putter-Offers'],
  Q: ['Quiet Quitters', 'Quick Breaks', 'Quilts'],
  R: ['Reschedulers', 'Recliners', 'Remotes', 'Rerunners'],
  S: ['Slackers', 'Sloths', 'Snoozers', 'Sleepyheads', 'Stallers', 'Scrollers'],
  T: ['Tomorrowers', 'Time Wasters', 'Tardies', 'Turtles'],
  W: ['Wafflers', 'Wait-and-Sees', 'Wanderers', 'Whenevers'],
  Y: ['Yawners', 'Yesterdays', 'Yeah-Laters', 'Yo-Yos'],
};

/**
 * The longest a new team's name may be, so it fits a standings row. Existing teams keep
 * their names, whatever their length: names never change once given.
 */
export const TEAM_NAME_MAX = 23;

/** Every town, in a fixed order. */
export const OPPONENT_TOWNS: readonly string[] = Object.values(TOWNS).flat();

/** [primary, secondary] pairs chosen for contrast on light and dark backgrounds. */
const COLOR_PAIRS = [
  ['#1D3557', '#F1C453'],
  ['#7B2D26', '#F4E9D8'],
  ['#2B2D42', '#EF233C'],
  ['#264653', '#E9C46A'],
  ['#3D405B', '#F2CC8F'],
  ['#5F0F40', '#FB8B24'],
  ['#0B3954', '#BFD7EA'],
  ['#283618', '#DDA15E'],
  ['#4A4E69', '#C9ADA7'],
  ['#3A0CA3', '#F72585'],
  ['#006D77', '#FFDDD2'],
  ['#432818', '#FFE6A7'],
  ['#14213D', '#FCA311'],
  ['#9D0208', '#FFBA08'],
  ['#1B4332', '#B7E4C7'],
  ['#3C096C', '#E0AAFF'],
  ['#023E8A', '#90E0EF'],
  ['#6A040F', '#E9D8A6'],
  ['#2F3E46', '#CAD2C5'],
  ['#7F4F24', '#EDE0D4'],
  ['#0F4C5C', '#FB8B24'],
  ['#22223B', '#9A8C98'],
  ['#540B0E', '#FFF3B0'],
  ['#005F73', '#EE9B00'],
  ['#3D0C02', '#F0A202'],
  ['#1A535C', '#FFE66D'],
  ['#2D3142', '#EF8354'],
  ['#4F000B', '#FF7F51'],
  ['#081C15', '#95D5B2'],
  ['#370617', '#F48C06'],
] as const;

export interface Opponent {
  seed: number;
  city: string;
  mascot: string;
  name: string;
  colors: readonly [string, string];
  /** Up to three letters for the badge, e.g. "LLM". */
  abbreviation: string;
}

/** FNV-1a 32-bit hash, for turning `${userId}:${season}:${series}` into a seed. */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)] as T;
}

/** Up to three letters for a badge, from a team name: "Litchfield Last Minutemen" → "LLM". */
export function opponentAbbreviation(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .map((word) => word[0]!.toUpperCase())
    .join('')
    .slice(0, 3);
}

/** The town a team name starts with, if it's one of ours (null for the old names). */
export function opponentTown(name: string): string | null {
  return OPPONENT_TOWNS.find((town) => name === town || name.startsWith(`${town} `)) ?? null;
}

/**
 * The opponent for `seed`. Towns in `played` (team names already faced) are skipped until
 * every town has been played, so no town comes round twice before then.
 */
export function generateOpponent(seed: number, played: Iterable<string> = []): Opponent {
  const random = mulberry32(seed);
  const used = new Set<string>();
  for (const name of played) {
    const town = opponentTown(name);
    if (town) used.add(town);
  }
  const fresh = OPPONENT_TOWNS.filter((town) => !used.has(town));
  const city = pick(fresh.length > 0 ? fresh : OPPONENT_TOWNS, random);
  const mascot = pick(NICKNAMES[city[0]!.toUpperCase()]!, random);
  const colors = pick(COLOR_PAIRS, random);
  const name = `${city} ${mascot}`;
  return { seed: seed >>> 0, city, mascot, name, colors, abbreviation: opponentAbbreviation(name) };
}

// ── Leagues (v1.3) ──────────────────────────────────────────────────────────
//
// Each player has their own league of 29 teams; they're the 30th. The hierarchy is league,
// conferences, divisions, teams: every season the 30 are dealt into two conferences of three
// five-team divisions, like MLB, and every team plays 84 games. The player's 12 series:
// their 4 division rivals, 5 teams from the rest of their conference and 3 from the other
// conference (MLB's balanced schedule, scaled), choosing teams they haven't faced in longest
// first. The other teams play each other every week too, their
// results drawn from a strength each team gets for the season, so the standings are a
// real race. No playoffs: titles go to the best regular-season record.

/** Teams in a player's league besides them. */
export const LEAGUE_SIZE = 29;
/** The player's id in a season's tables (teams 0–28 are their league's). */
export const YOU = 29;
export const TEAM_COUNT = 30;
export const DIVISION_SIZE = 5;
/** The player's series each season, by tier. */
export const SCHEDULE_TIERS = { division: 4, regular: 5, irregular: 3 } as const;
export type OpponentTier = keyof typeof SCHEDULE_TIERS;

/** The two conferences and their divisions, as shown in standings. */
export const CONFERENCE_NAMES = ['Early Bird Conference', 'Night Owl Conference'] as const;
/** Short forms for the division names: "EBC Central". */
export const CONFERENCE_ABBREVIATIONS = ['EBC', 'NOC'] as const;
export const DIVISION_NAMES = ['East', 'Central', 'West'] as const;

export interface LeagueTeam {
  /** 0–28: the team's place in the player's league. */
  slot: number;
  seed: number;
  city: string;
  mascot: string;
  name: string;
  colors: readonly [string, string];
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The seed a player's league and seasons are drawn from. */
export function leagueSeedFor(userId: string): number {
  return hashSeed(`league:${userId}`);
}

/**
 * A player's league: 29 teams, every town and nickname different, each in its own colors.
 * Drawn once (the server stores it).
 */
export function generateLeague(seed: number): LeagueTeam[] {
  const random = mulberry32(seed);
  const towns = shuffle(OPPONENT_TOWNS, random);
  const colors = shuffle(COLOR_PAIRS, random);
  const usedNicknames = new Set<string>();
  const teams: LeagueTeam[] = [];
  for (const city of towns) {
    if (teams.length === LEAGUE_SIZE) break;
    const options = (NICKNAMES[city[0]!.toUpperCase()] ?? []).filter(
      (n) => !usedNicknames.has(n) && `${city} ${n}`.length <= TEAM_NAME_MAX,
    );
    if (options.length === 0) continue;
    const mascot = pick(options, random);
    usedNicknames.add(mascot);
    teams.push({
      slot: teams.length,
      seed: Math.floor(random() * 4294967296) >>> 0,
      city,
      mascot,
      name: `${city} ${mascot}`,
      colors: colors[teams.length % colors.length]!,
    });
  }
  return teams;
}

/** A team name that's too long, or uses a nickname that's been retired. */
export function teamNameNeedsReplacing(name: string): boolean {
  if (name.length > TEAM_NAME_MAX) return true;
  const town = OPPONENT_TOWNS.find((t) => name.startsWith(`${t} `));
  const mascot = town ? name.slice(town.length + 1) : null;
  return mascot === null || !(NICKNAMES[town![0]!.toUpperCase()] ?? []).includes(mascot);
}

/**
 * A new name for one team in a league: a town and nickname no other team in it uses, that
 * fits TEAM_NAME_MAX. Same first letter as ever.
 */
export function replacementTeamName(others: readonly string[], seed: number): string {
  const random = mulberry32(seed);
  const usedTowns = new Set<string>();
  const usedNicknames = new Set<string>();
  for (const name of others) {
    const town = OPPONENT_TOWNS.find((t) => name.startsWith(`${t} `));
    if (!town) continue;
    usedTowns.add(town);
    usedNicknames.add(name.slice(town.length + 1));
  }
  for (const city of shuffle(OPPONENT_TOWNS, random)) {
    if (usedTowns.has(city)) continue;
    const options = (NICKNAMES[city[0]!.toUpperCase()] ?? []).filter(
      (n) => !usedNicknames.has(n) && `${city} ${n}`.length <= TEAM_NAME_MAX,
    );
    if (options.length > 0) return `${city} ${pick(options, random)}`;
  }
  return pick(OPPONENT_TOWNS.filter((t) => !usedTowns.has(t)), random);
}

/** A season's alignment: six divisions of five team ids (0–2 one league, 3–5 the other). */
export interface SeasonAlignment {
  divisions: number[][];
  divisionOf: (team: number) => number;
  conferenceOf: (team: number) => 0 | 1;
}

/** The season's two conferences and six divisions, dealt again every season. */
export function seasonAlignment(leagueSeed: number, seasonNumber: number): SeasonAlignment {
  const random = mulberry32(hashSeed(`${leagueSeed}:align:${seasonNumber}`));
  const ids = shuffle(
    Array.from({ length: TEAM_COUNT }, (_, i) => i),
    random,
  );
  const divisions = Array.from({ length: 6 }, (_, d) => ids.slice(d * DIVISION_SIZE, (d + 1) * DIVISION_SIZE));
  const division = new Map<number, number>();
  divisions.forEach((teams, d) => teams.forEach((t) => division.set(t, d)));
  return {
    divisions,
    divisionOf: (team) => division.get(team)!,
    conferenceOf: (team) => (division.get(team)! < 3 ? 0 : 1),
  };
}

export interface ScheduledOpponent {
  slot: number;
  tier: OpponentTier;
}

const scheduleCache = new Map<string, { list: ScheduledOpponent[]; lastSeen: Map<number, number> }>();

/**
 * The player's 12 opponents for a season, in order, and when each team was last faced
 * (season number) by the end of it. Teams faced longest ago (or never) are chosen first.
 */
function seasonPlan(leagueSeed: number, seasonNumber: number): { list: ScheduledOpponent[]; lastSeen: Map<number, number> } {
  const key = `${leagueSeed}:${seasonNumber}`;
  const cached = scheduleCache.get(key);
  if (cached) return cached;
  const before = seasonNumber > 1 ? seasonPlan(leagueSeed, seasonNumber - 1) : { list: [], lastSeen: new Map<number, number>() };
  const random = mulberry32(hashSeed(`${leagueSeed}:schedule:${seasonNumber}`));
  const align = seasonAlignment(leagueSeed, seasonNumber);
  const mine = align.divisionOf(YOU);
  const myConference = align.conferenceOf(YOU);
  const others = Array.from({ length: LEAGUE_SIZE }, (_, i) => i);
  const rivals = align.divisions[mine]!.filter((t) => t !== YOU);
  const staleFirst = (teams: number[], count: number) =>
    shuffle(teams, random)
      .sort((a, b) => (before.lastSeen.get(a) ?? 0) - (before.lastSeen.get(b) ?? 0))
      .slice(0, count);
  const regular = staleFirst(
    others.filter((t) => align.conferenceOf(t) === myConference && align.divisionOf(t) !== mine),
    SCHEDULE_TIERS.regular,
  );
  const irregular = staleFirst(
    others.filter((t) => align.conferenceOf(t) !== myConference),
    SCHEDULE_TIERS.irregular,
  );
  const list = shuffle(
    [
      ...rivals.map((slot) => ({ slot, tier: 'division' as const })),
      ...regular.map((slot) => ({ slot, tier: 'regular' as const })),
      ...irregular.map((slot) => ({ slot, tier: 'irregular' as const })),
    ],
    random,
  );
  // Not the team that closed last season.
  const last = before.list.at(-1)?.slot;
  if (last !== undefined && list[0]!.slot === last) {
    const swap = list.findIndex((x) => x.slot !== last);
    [list[0], list[swap]] = [list[swap]!, list[0]!];
  }
  const lastSeen = new Map(before.lastSeen);
  for (const x of list) lastSeen.set(x.slot, seasonNumber);
  const plan = { list, lastSeen };
  if (scheduleCache.size > 2000) scheduleCache.clear();
  scheduleCache.set(key, plan);
  return plan;
}

/** The player's opponents for a season, Series 1–12. */
export function seasonSchedule(leagueSeed: number, seasonNumber: number): ScheduledOpponent[] {
  return seasonPlan(leagueSeed, seasonNumber).list;
}

/**
 * Which league team a series is against (`seriesNumber` 1–12). A Head Start week (series 0)
 * gets a team from the other conference that isn't on the season's schedule.
 */
export function scheduledOpponent(leagueSeed: number, seasonNumber: number, seriesNumber: number): ScheduledOpponent {
  const list = seasonSchedule(leagueSeed, seasonNumber);
  if (seriesNumber >= 1) return list[(seriesNumber - 1) % list.length]!;
  const align = seasonAlignment(leagueSeed, seasonNumber);
  const onSchedule = new Set(list.map((x) => x.slot));
  const slot = Array.from({ length: LEAGUE_SIZE }, (_, i) => i).find(
    (t) => align.conferenceOf(t) !== align.conferenceOf(YOU) && !onSchedule.has(t),
  )!;
  return { slot, tier: 'irregular' };
}

// ── Standings ───────────────────────────────────────────────────────────────

/** One of the player's games, as standings count it. */
export interface StandingsGame {
  /** 1–12. */
  seriesNumber: number;
  /** 1–7. */
  gameNumber: number;
  /** null: not decided (not played yet, or a no-decision). */
  result: 'W' | 'L' | null;
  /** Runs for minus runs against. */
  margin: number;
}

export interface StandingsRow {
  team: number;
  wins: number;
  losses: number;
  divWins: number;
  divLosses: number;
  conferenceWins: number;
  conferenceLosses: number;
  runDiff: number;
  /** Behind the leader of the table it's shown in. */
  gamesBack: number;
}

export interface SeasonStandings {
  alignment: SeasonAlignment;
  /** Each division's rows, best first. */
  divisions: StandingsRow[][];
  /** Each conference's 15 rows, best first. */
  conferences: StandingsRow[][];
  /** Every game of the season is in. */
  complete: boolean;
  /** Once complete: whether the player finished first in their division / conference / league. */
  /** All 30 teams, best first: the league title race. */
  league: StandingsRow[];
  titles: { division: boolean; conference: boolean; league: boolean } | null;
}

const GAMES_PER_TEAM = 84;

/** Each team's strength for the season (about .350–.650; a few run hot). */
function strengths(leagueSeed: number, seasonNumber: number): number[] {
  const random = mulberry32(hashSeed(`${leagueSeed}:strength:${seasonNumber}`));
  return Array.from({ length: TEAM_COUNT }, () => {
    const base = 0.5 + (random() + random() - 1) * 0.15;
    return random() < 0.12 ? Math.min(0.68, base + 0.08) : base;
  });
}

const pct = (w: number, l: number) => (w + l === 0 ? 0 : w / (w + l));

/**
 * A season's standings so far. `daysSettled` (0–84) is how many of the season's days have
 * gone final: the other teams' games through then count, and the player's decided games.
 * Titles: best record in the division, in the conference, and across the whole league.
 * Ties: overall record, then record in the division, then in the conference, then run
 * differential (no head-to-head).
 */
export function seasonStandings(leagueSeed: number, seasonNumber: number, games: readonly StandingsGame[], daysSettled: number): SeasonStandings {
  const alignment = seasonAlignment(leagueSeed, seasonNumber);
  const schedule = seasonSchedule(leagueSeed, seasonNumber);
  const strength = strengths(leagueSeed, seasonNumber);
  const rows: StandingsRow[] = Array.from({ length: TEAM_COUNT }, (_, team) => ({
    team,
    wins: 0,
    losses: 0,
    divWins: 0,
    divLosses: 0,
    conferenceWins: 0,
    conferenceLosses: 0,
    runDiff: 0,
    gamesBack: 0,
  }));
  const record = (winner: number, loser: number, margin: number) => {
    const w = rows[winner]!;
    const l = rows[loser]!;
    w.wins++;
    l.losses++;
    w.runDiff += margin;
    l.runDiff -= margin;
    if (alignment.divisionOf(winner) === alignment.divisionOf(loser)) {
      w.divWins++;
      l.divLosses++;
    }
    if (alignment.conferenceOf(winner) === alignment.conferenceOf(loser)) {
      w.conferenceWins++;
      l.conferenceLosses++;
    }
  };

  // The player's games, as played.
  for (const g of games) {
    const opponent = schedule[g.seriesNumber - 1]?.slot;
    if (opponent === undefined || g.result === null) continue;
    if (g.result === 'W') record(YOU, opponent, Math.max(1, g.margin));
    else record(opponent, YOU, Math.max(1, -g.margin));
  }

  // Everyone else, a week at a time: paired at random, seven games each.
  const days = Math.max(0, Math.min(GAMES_PER_TEAM, daysSettled));
  for (let week = 0; week < schedule.length; week++) {
    const random = mulberry32(hashSeed(`${leagueSeed}:week:${seasonNumber}:${week}`));
    const busy = new Set([YOU, schedule[week]!.slot]);
    const free = shuffle(
      Array.from({ length: TEAM_COUNT }, (_, i) => i).filter((t) => !busy.has(t)),
      random,
    );
    for (let i = 0; i + 1 < free.length; i += 2) {
      const a = free[i]!;
      const b = free[i + 1]!;
      const sa = strength[a]!;
      const sb = strength[b]!;
      const pA = (sa * (1 - sb)) / (sa * (1 - sb) + sb * (1 - sa));
      for (let game = 0; game < 7; game++) {
        const roll = random();
        const margin = 1 + Math.floor(random() * 5);
        if (week * 7 + game >= days) continue;
        if (roll < pA) record(a, b, margin);
        else record(b, a, margin);
      }
    }
  }

  const order = (list: StandingsRow[]) =>
    [...list].sort(
      (x, y) =>
        pct(y.wins, y.losses) - pct(x.wins, x.losses) ||
        pct(y.divWins, y.divLosses) - pct(x.divWins, x.divLosses) ||
        pct(y.conferenceWins, y.conferenceLosses) - pct(x.conferenceWins, x.conferenceLosses) ||
        y.runDiff - x.runDiff ||
        x.team - y.team,
    );
  const withGamesBack = (list: StandingsRow[]) => {
    const leader = list[0]!;
    return list.map((r) => ({ ...r, gamesBack: (leader.wins - r.wins + (r.losses - leader.losses)) / 2 }));
  };
  const divisions = alignment.divisions.map((teams) => withGamesBack(order(teams.map((t) => rows[t]!))));
  const conferences = [0, 1].map((lg) => withGamesBack(order(rows.filter((r) => alignment.conferenceOf(r.team) === lg))));
  const league = withGamesBack(order(rows));

  const playerDone = games.filter((g) => g.seriesNumber >= 1 && g.seriesNumber <= schedule.length).length >= GAMES_PER_TEAM;
  const complete = days >= GAMES_PER_TEAM && playerDone;
  const titles = complete
    ? {
        division: divisions[alignment.divisionOf(YOU)]![0]!.team === YOU,
        conference: conferences[alignment.conferenceOf(YOU)]![0]!.team === YOU,
        league: league[0]!.team === YOU,
      }
    : null;
  return { alignment, divisions, conferences, league, complete, titles };
}
