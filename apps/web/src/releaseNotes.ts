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
export const APP_VERSION = '1.3.5-beta';

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
      'Your own league of 29 small-town teams, split into conferences and divisions each season.',
      'Standings, with division and conference titles for the best record. No playoffs.',
      'Title counts in your team stats and Team History.',
    ],
    improved: ['A tidier Team page.'],
    patches: [
      { version: '1.3.5-beta', fixed: ['Tidier standings: even columns, town over a bold team name.'] },
      { version: '1.3.4-beta', fixed: ['A bigger, roomier scoreboard.'] },
      { version: '1.3.3-beta', fixed: ['Scoreboards show just the score.'] },
      {
        version: '1.3.2-beta',
        fixed: ['A league title for the best record across both conferences.', 'Your league place in Standings.', 'Win streak and best streak share a tile.'],
      },
      {
        version: '1.3.1-beta',
        fixed: [
          'Leagues are now conferences.',
          'Cleaner standings that fit the screen.',
          'Long team names got shorter ones, one last time. Names won’t change again.',
          'Pages open at the top.',
        ],
      },
    ],
  },
  {
    id: '1.2.0',
    version: '1.2.0-beta',
    title: 'v1.2.0-beta',
    added: ['Ironclad, a new MVP badge.', 'Badges in your sport’s words.'],
    improved: [
      'A task is worth up to 4.',
      'Series badges arrive the moment you clinch.',
      'Tougher perfect-game and Iron Man badges.',
    ],
    patches: [{ version: '1.2.1-beta', fixed: ['Opponents from real small towns.'] }],
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
          'Every day is a game, every week a best-of-7.',
          'Rally Caps, Rainouts and the Injured List.',
          'Plan your whole week on one grid.',
          'Baseball, basketball or hockey, with your own team name and photo.',
          'Home Screen app with reminders and automatic updates.',
        ],
      },
      {
        title: '1.1: Badges',
        items: ['Badges for everything you’ve played, in Team → Badges.', 'A season win goal in the guided setup.'],
      },
    ],
  },
  {
    // Everything from November 2026, before version numbers.
    id: '0.11.2026',
    version: '0.11.2026_beta',
    title: 'v0.11.2026_beta',
    added: [
      'Guided setup.',
      'Team photo.',
      'Optional password.',
      'A 3rd Rally Cap each month.',
      'Offline check-offs count until noon.',
      'Automatic updates.',
    ],
    improved: ['Runs to win comes from your lineup.', 'A simpler Team page.'],
    fixed: ['Every day with tasks can be won.', 'Offline unchecks stick.'],
  },
];

export const LATEST_RELEASE = RELEASES[0]!.id;

/** What's changed, third tile: the features and big fixes since the last major release. */
export const SINCE_LAST_MAJOR = {
  title: 'Since the last major release',
  since: 'v0.11.2026_beta',
  items: [
    'Your own league, with conferences, divisions and standings.',
    'Division, conference and league titles.',
    'Badges.',
    'A season win goal in setup.',
    'Tasks are worth up to 4.',
    'Version numbers and What’s changed.',
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
