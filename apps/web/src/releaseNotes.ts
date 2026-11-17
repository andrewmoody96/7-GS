// What's new, newest first. The app shows the entries an account hasn't seen yet, once,
// after an update (components/WhatsNew). Add an entry with each release worth telling
// people about; `id` only has to be new and stay the same.

export interface ReleaseNote {
  id: string;
  /** Shown as the heading, e.g. "November 2026". */
  title: string;
  added?: string[];
  improved?: string[];
  fixed?: string[];
}

export const RELEASES: readonly ReleaseNote[] = [
  {
    id: '2026-11-team-photo',
    title: 'November 2026',
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

/** The entries newer than `seen` (just the latest when nothing has been seen yet). */
export function unseenReleases(seen: string | null): ReleaseNote[] {
  if (seen === LATEST_RELEASE) return [];
  const index = seen === null ? -1 : RELEASES.findIndex((r) => r.id === seen);
  return index === -1 ? [RELEASES[0]!] : RELEASES.slice(0, index);
}
