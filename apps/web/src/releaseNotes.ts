// Release notes, newest first (docs/RELEASES.md has how versions and releases work).
//
// - The app shows the entries an account hasn't seen yet, once, after an update
//   (components/WhatsNew). Settings → What's changed lists them all.
// - A feature or major release (1.2, 2.0) gets an entry; a fix release (1.2.1) only bumps
//   APP_VERSION, and goes in the entry as `fixed` if it's worth a line.
// - `id` only has to be new and stay the same.

/** The version this build is. Bump with every release, fixes included. */
export const APP_VERSION = '1.2.1-beta';

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
  /** Covers everything before it: older notes aren't shown with it in the popup. */
  recap?: boolean;
}

export const RELEASES: readonly ReleaseNote[] = [
  {
    id: '1.2.0',
    version: '1.2.0-beta',
    title: 'v1.2.0-beta',
    added: [
      'Ironclad, a new MVP badge: 4 Iron Man weeks in a row.',
      'Badges speak your sport: Tip-Off and Flawless in basketball, Puck Drop and Shutout in hockey.',
    ],
    fixed: ['v1.2.1: opponents come from real small towns, like the Pontiac Procrastinators, and every past opponent was renamed. No town twice until you’ve played them all.'],
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
    id: '2026-11-guided-setup',
    version: null,
    title: 'November 2026: guided setup',
    added: [
      'Guided setup: name your team, add your tasks and plan your week on one grid, then pick when to start.',
      'Plan your week walks you through every task and day at once and shows the runs to win for each day as you go.',
    ],
    improved: [
      'Default Lineups shows your whole week on one grid: tap a box to cycle off, in the lineup, must-hit, then save every day at once.',
    ],
  },
  {
    id: '2026-11-sign-in-lock',
    version: null,
    title: 'November 2026: passwords',
    added: [
      'Optional password: add one in Team → Settings and signing in takes your email code plus the password, so your email alone isn’t enough.',
    ],
    improved: ['The Team page shows your team photo large, next to your name.', 'What’s new lists each item as its own bullet.'],
  },
  {
    id: '2026-11-team-photo',
    version: null,
    title: 'November 2026: team photo',
    added: [
      'Team photo: add one in Team → Settings and it fills your team badge, initials on top.',
      'A 3rd Rally Cap each month for a 7-game win streak with 3 perfect days in it.',
      'Saving Rally Caps pays off: each one you’re still holding adds 3% to a roll.',
      'Check-offs made offline before midnight now count if they sync by noon the next day.',
      'The app updates itself when you open it, and Settings has Check for updates.',
    ],
    improved: [
      'Runs to win comes from each day’s lineup: your must-hits plus half the rest.',
      'Team is simpler: Management (This Week, Default Lineups, Injuries), Team History and Settings.',
      'A loss just says Loss.',
    ],
    fixed: [
      'A day you add tasks to can always be won, even one that started empty.',
      'Unchecking a task while offline now sticks.',
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0]!.id;

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
