// Release notes, newest first (docs/RELEASES.md has how versions and releases work).
//
// - The app shows the entries an account hasn't seen yet, once, after an update
//   (components/WhatsNew). Fix releases don't pop up.
// - Settings → What's changed shows three tiles: the current version, the one before it,
//   and SINCE_LAST_MAJOR, a summary of everything since the last major release.
// - A feature or major release (1.2, 2.0) gets an entry; a fix release (1.2.1) bumps
//   APP_VERSION and goes on its feature release's entry as a `patch`.
// - `id` only has to be new and stay the same.

/** The version this build is. Bump with every release, fixes included. */
export const APP_VERSION = '1.3.1-beta';

/** How a version is shown in the app: "v1.1.0-beta". */
export const versionLabel = (version: string) => `v${version}`;

export interface ReleaseNote {
  id: string;
  /** The version it shipped in; null for the notes from before version numbers. */
  version: string | null;
  /** Shown as the heading, e.g. "Version 1.1". */
  title: string;
  /** Named groups of bullets, shown in order (a recap's "1.0: …", "1.1: …"). */
  sections?: { title: string; items: string[] }[];
  added?: string[];
  improved?: string[];
  fixed?: string[];
  /** Fix releases on top of this one, newest first (1.3.1 on 1.3). */
  patches?: { version: string; fixed: string[] }[];
  /** Covers everything before it: older notes aren't shown with it in the popup. */
  recap?: boolean;
}

/** A release's newest version: its latest fix release, or itself. */
export function latestVersionOf(note: ReleaseNote): string | null {
  return note.patches?.[0]?.version ?? note.version;
}

export const RELEASES: readonly ReleaseNote[] = [
  {
    id: '1.3.0',
    version: '1.3.0-beta',
    title: 'v1.3.0-beta',
    added: [
      'Your own league: 29 teams from small towns. You’re the 30th.',
      'Every season your league splits into two conferences of three divisions, dealt fresh each time.',
      'Each season you play your 4 division rivals, 5 teams from your conference and 3 from the other one. Everyone comes up within about a year.',
      'Standings (Team → Standings): the other teams play each other every week, so there’s a real race.',
      'Division and conference titles go to the best record when the season ends. No playoffs. Winning the season still just takes a winning record.',
      'Title counts under your team stats and in Team History.',
    ],
    improved: [
      'The Team page is tidier: the scoreboard says Season record, your place in the division sits right under it, and Badges is a tile with the rest of your stats.',
    ],
    patches: [
      {
        version: '1.3.1-beta',
        fixed: [
          'Leagues are now conferences: your league splits into the Early Bird and Night Owl Conferences, each with three divisions (EBC Central, NOC West…).',
          'Conference titles replace league titles, everywhere they show.',
          'Standings fit the screen, show your place as two chips (Division, Conference), and group each conference’s divisions together.',
          'More room between the W, L, Pct and GB columns; long team names wrap instead of getting cut off.',
          'The longest team names got shorter ones (no more Johnny-Come-Latelies).',
          'Pages open at the top, including this one.',
        ],
      },
    ],
  },
  {
    id: '1.2.0',
    version: '1.2.0-beta',
    title: 'v1.2.0-beta',
    added: [
      'Ironclad, a new MVP badge: 4 Iron Man weeks in a row.',
      'Badges speak your sport: Tip-Off and Flawless in basketball, Puck Drop and Shutout in hockey.',
    ],
    patches: [
      {
        version: '1.2.1-beta',
        fixed: [
          'Opponents come from real small towns, like the Pontiac Procrastinators, and every past opponent was renamed. No town twice until you’ve played them all.',
        ],
      },
    ],
    improved: [
      'A task is worth up to 4: no play scores more than a grand slam. Bigger tasks were set to 4.',
      'Series badges arrive the moment you clinch, not on Sunday.',
      'Perfect games count for badges with 5+ to win and 3+ tasks. Perfect Game now takes 5 of them, Sharp 15.',
      'Iron Man now means winning the series in a week played as scheduled.',
    ],
  },
  {
    // The id is what accounts remember having seen: never change it.
    id: '1.1.0',
    version: '1.1.0-beta',
    title: 'v1.1.0-beta',
    recap: true,
    sections: [
      {
        title: '1.0: everything since launch',
        items: [
          'Every day is a game and every week a best-of-7. Runs to win comes from your lineup: must-hits plus half the rest.',
          'Rally Caps flip a close loss into a W the next morning. Up to 3 a month, and saving them up boosts the odds.',
          'Rainouts move a day to later in the week. The Injured List puts a task on hold without costing you games.',
          'Checked something off before midnight while offline? It counts if it syncs by noon.',
          'Plan the whole week on one grid in Management → Default Lineups.',
          'Make it yours: baseball, basketball or hockey, a day or night look, and a team name and photo.',
          'Add it to your Home Screen for reminders, sign in with a 6-digit code, and add a password if you like. It updates itself.',
        ],
      },
      {
        title: '1.1: Badges',
        items: [
          '35 badges in 5 tiers, from Rookie to Hall of Fame. Find them in Team → Badges.',
          'Everything you’ve already played counts, so you may have a few waiting.',
          'New badges pop up the moment you earn them.',
          'A quick pass through setup, now with your season win goal.',
        ],
      },
    ],
  },
  {
    // Everything from November 2026, before version numbers.
    id: '0.11.2026',
    version: '0.11.2026_beta',
    title: 'v0.11.2026_beta',
    added: [
      'Guided setup: name your team, add your tasks, plan your week on one grid and pick when to start.',
      'Default Lineups shows your whole week on one grid.',
      'Team photo: it fills your team badge, initials on top.',
      'Optional password: signing in takes your email code plus the password.',
      'A 3rd Rally Cap each month for a 7-game win streak with 3 perfect days in it; Rally Caps you hold add 3% to a roll.',
      'Check-offs made offline before midnight count if they sync by noon.',
      'The app updates itself, and Settings has Check for updates.',
    ],
    improved: [
      'Runs to win comes from each day’s lineup: your must-hits plus half the rest.',
      'Team is simpler: Management, Team History and Settings, with your photo large next to your name.',
      'A loss just says Loss.',
    ],
    fixed: ['A day you add tasks to can always be won, even one that started empty.', 'Unchecking a task while offline now sticks.'],
  },
];

export const LATEST_RELEASE = RELEASES[0]!.id;

/** What's changed, third tile: the features and big fixes since the last major release. */
export const SINCE_LAST_MAJOR = {
  title: 'Since the last major release',
  since: 'v0.11.2026_beta',
  items: [
    'Your own league: 29 small-town teams, split every season into two conferences of three divisions.',
    'Standings, plus division and conference titles for the best record when a season ends. No playoffs.',
    'Badges: 36 in five tiers, earned for everything you’ve played, in your sport’s words.',
    'Series badges arrive the moment you clinch.',
    'A season win goal in the guided setup.',
    'A task is worth up to 4 (no play scores more than a grand slam).',
    'Version numbers, with What’s changed in Settings.',
  ],
} as const;

/** At most this many entries in one popup, newest first. */
const MAX_SHOWN = 3;

/**
 * The entries newer than `seen`, newest first. Nothing seen yet (an account from before the
 * popup existed) or an id no longer listed means the newest few, so nobody misses a release.
 * A recap ends the list: it already covers what came before it.
 */
export function unseenReleases(seen: string | null): ReleaseNote[] {
  if (seen === LATEST_RELEASE) return [];
  const index = seen === null ? -1 : RELEASES.findIndex((r) => r.id === seen);
  const newer = (index === -1 ? RELEASES : RELEASES.slice(0, index)).slice(0, MAX_SHOWN);
  const recap = newer.findIndex((r) => r.recap);
  return recap === -1 ? newer : newer.slice(0, recap + 1);
}
