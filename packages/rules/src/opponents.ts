// Generic weekly opponents (GAME_DESIGN §8). Deterministic from a seed so the server
// stores only the seed and name, and the client can redraw the same badge.

const CITIES = [
  'Snooze City',
  'Couchville',
  'Doomscroll',
  'Tomorrow Town',
  'Excuse Bay',
  'Netflix Valley',
  'Procrastination Point',
  'Sofa Springs',
  'Someday Harbor',
  'Laterton',
  'Distraction Heights',
  'Burnout Basin',
  'Overslept Hollow',
  'Takeout Terrace',
  'Notification Falls',
  'Rerun Ridge',
  'Nap Valley',
  'Scroll Creek',
  'Backlog Bluffs',
  'Snack Drawer',
] as const;

const MASCOTS = [
  'Alarms',
  'Cushions',
  'Dynasty',
  'Tigers',
  'Pirates',
  'Nightcaps',
  'Loafers',
  'Sloths',
  'Snoozers',
  'Remotes',
  'Excuses',
  'Pillows',
  'Slackers',
  'Dawdlers',
  'Yawns',
  'Blankets',
  'Recliners',
  'Scrollers',
  'Mañanas',
  'Leftovers',
] as const;

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
] as const;

export interface Opponent {
  seed: number;
  city: string;
  mascot: string;
  name: string;
  colors: readonly [string, string];
  /** Up to three letters for the badge, e.g. "SCA". */
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

export function generateOpponent(seed: number): Opponent {
  const random = mulberry32(seed);
  const city = pick(CITIES, random);
  const mascot = pick(MASCOTS, random);
  const colors = pick(COLOR_PAIRS, random);
  const abbreviation = `${city} ${mascot}`
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
  return { seed: seed >>> 0, city, mascot, name: `${city} ${mascot}`, colors, abbreviation };
}
