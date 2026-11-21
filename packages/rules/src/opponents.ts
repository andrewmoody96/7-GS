// Opponents (GAME_DESIGN §8). Each player has their own league of 29 teams (they're the
// 30th, like MLB): a real small town and a nickname for putting things off, starting with
// the same letter (the Pontiac Procrastinators, the Litchfield Last Minutemen).
//
// Every year (4 seasons, 48 series) the league is dealt out again: 4 division rivals played
// every season, 7 teams every other season, and the other 18 once a year, so every team
// comes up at least once a year and some far more than others. Never the same team two
// weeks running. All deterministic from a seed, so the server and the demo agree.

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
  J: ['Just-a-Minutes', 'Jammies', 'Johnny-Come-Latelies', 'Junk Drawers'],
  K: ['Kickbacks', 'Kick-the-Cans', 'Kettle Watchers', 'Kill-Times'],
  L: ['Last Minutemen', 'Lazies', 'Loafers', 'Loungers', 'Layabouts', 'Latecomers'],
  M: ['Mañanas', 'Meanderers', 'Moseyers', 'Mopers'],
  N: ['Nappers', 'Nightcaps', 'Not-Todays', 'Nodders'],
  O: ['Oversleepers', 'One-More-Episodes', 'Off-Days', 'Ottomans'],
  P: ['Procrastinators', 'Pajamas', 'Ponderers', 'Putter-Offers'],
  Q: ['Quiet Quitters', 'Quick Breaks', 'Quilts'],
  R: ['Reschedulers', 'Recliners', 'Remotes', 'Rerunners'],
  S: ['Slackers', 'Sloths', 'Snoozers', 'Sleepyheads', 'Stallers', 'Scrollers'],
  T: ['Tomorrowers', 'Time Wasters', 'Tardies', 'Turtles'],
  W: ['Wafflers', 'Wait-and-Sees', 'Wanderers', 'Whenevers'],
  Y: ['Yawners', 'Yesterdays', 'Yeah-Laters', 'Yo-Yos'],
};

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
    .split(/[\s-]+/)
    .filter((word) => /^\p{L}/u.test(word))
    .map((word) => word[0]!.toUpperCase())
    .join('')
    .slice(0, 3);
}

/** One opponent from a seed (a team outside any league; leagues use generateLeague). */
export function generateOpponent(seed: number): Opponent {
  const random = mulberry32(seed);
  const city = pick(OPPONENT_TOWNS, random);
  const mascot = pick(NICKNAMES[city[0]!.toUpperCase()]!, random);
  const colors = pick(COLOR_PAIRS, random);
  const name = `${city} ${mascot}`;
  return { seed: seed >>> 0, city, mascot, name, colors, abbreviation: opponentAbbreviation(name) };
}

// ── Leagues ─────────────────────────────────────────────────────────────────

/** Teams in a player's league; they're the 30th. */
export const LEAGUE_SIZE = 29;
export const SEASONS_PER_YEAR = 4;
/** Each year: rivals every season, regulars every other season, the rest once a year. */
export const LEAGUE_TIERS = { division: 4, regular: 7, rare: 18 } as const;

export type OpponentTier = keyof typeof LEAGUE_TIERS;

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

/**
 * A player's league: 29 teams, every town and nickname different, each in its own colors.
 * Draw it once (the server stores it); `seed` is from the player's id.
 */
export function generateLeague(seed: number): LeagueTeam[] {
  const random = mulberry32(seed);
  const towns = shuffle(OPPONENT_TOWNS, random);
  const colors = shuffle(COLOR_PAIRS, random);
  const usedNicknames = new Set<string>();
  const teams: LeagueTeam[] = [];
  for (const city of towns) {
    if (teams.length === LEAGUE_SIZE) break;
    const options = (NICKNAMES[city[0]!.toUpperCase()] ?? []).filter((n) => !usedNicknames.has(n));
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

/** Who a player's league slots are, by tier, for one year (0 = their first 4 seasons). */
export function leagueYear(leagueSeed: number, year: number): Record<OpponentTier, number[]> {
  const random = mulberry32(hashSeed(`${leagueSeed}:year:${year}`));
  const slots = shuffle(
    Array.from({ length: LEAGUE_SIZE }, (_, i) => i),
    random,
  );
  const { division, regular } = LEAGUE_TIERS;
  return {
    division: slots.slice(0, division),
    regular: slots.slice(division, division + regular),
    rare: slots.slice(division + regular),
  };
}

/**
 * The year's 48 opponents (league slots), season by season: each season has every division
 * rival, its share of regulars (4 or 3, alternating) and of once-a-year teams (4 or 5).
 * No team two weeks running, including into the next year.
 */
function yearSchedule(leagueSeed: number, year: number, before: number | null): { slot: number; tier: OpponentTier }[][] {
  const tiers = leagueYear(leagueSeed, year);
  const random = mulberry32(hashSeed(`${leagueSeed}:schedule:${year}`));
  const regulars = [tiers.regular.slice(0, 4), tiers.regular.slice(4)];
  const rares = shuffle(tiers.rare, random);
  const rareCuts = [0, 4, 9, 13, 18];
  const seasons: { slot: number; tier: OpponentTier }[][] = [];
  let last = before;
  for (let season = 0; season < SEASONS_PER_YEAR; season++) {
    const list = shuffle(
      [
        ...tiers.division.map((slot) => ({ slot, tier: 'division' as const })),
        ...regulars[season % 2]!.map((slot) => ({ slot, tier: 'regular' as const })),
        ...rares.slice(rareCuts[season], rareCuts[season + 1]).map((slot) => ({ slot, tier: 'rare' as const })),
      ],
      random,
    );
    // Not the team that closed the last season.
    if (last !== null && list[0]!.slot === last) {
      const swap = list.findIndex((x) => x.slot !== last);
      [list[0], list[swap]] = [list[swap]!, list[0]!];
    }
    seasons.push(list);
    last = list[list.length - 1]!.slot;
  }
  return seasons;
}

const scheduleCache = new Map<string, { slot: number; tier: OpponentTier }[][]>();

function scheduleFor(leagueSeed: number, year: number): { slot: number; tier: OpponentTier }[][] {
  const key = `${leagueSeed}:${year}`;
  let seasons = scheduleCache.get(key);
  if (!seasons) {
    // The year before decides who can't open this one (its last team).
    const before = year === 0 ? null : scheduleFor(leagueSeed, year - 1)[SEASONS_PER_YEAR - 1]!.at(-1)!.slot;
    seasons = yearSchedule(leagueSeed, year, before);
    if (scheduleCache.size > 500) scheduleCache.clear();
    scheduleCache.set(key, seasons);
  }
  return seasons;
}

/**
 * Which league team a series is against. `seasonNumber` from 1, `seriesNumber` 1–12; the
 * Head Start (series 0) gets a once-a-year team that isn't Series 1's.
 */
export function scheduledOpponent(leagueSeed: number, seasonNumber: number, seriesNumber: number): { slot: number; tier: OpponentTier } {
  const year = Math.floor((seasonNumber - 1) / SEASONS_PER_YEAR);
  const season = scheduleFor(leagueSeed, year)[(seasonNumber - 1) % SEASONS_PER_YEAR]!;
  if (seriesNumber >= 1) return season[(seriesNumber - 1) % season.length]!;
  const first = season[0]!.slot;
  const rare = leagueYear(leagueSeed, year).rare.find((slot) => slot !== first)!;
  return { slot: rare, tier: 'rare' };
}

/** The seed a player's league is drawn from. */
export function leagueSeedFor(userId: string): number {
  return hashSeed(`league:${userId}`);
}
