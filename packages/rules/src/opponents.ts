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
