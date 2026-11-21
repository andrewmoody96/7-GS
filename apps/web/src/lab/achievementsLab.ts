// The Achievements lab's player (demo only): a simulated set of stats, kept in this browser
// (localStorage), for watching badges unlock. The Badges page itself shows the account's
// real stats from the server (GET /v1/achievements).

import { EMPTY_STATS, newSim, type AchievementSim, type AchievementStats } from '@7gs/rules';
import { useSyncExternalStore } from 'react';

const KEY = '7gs.lab.achievements.v1';

export interface LabPreset {
  id: string;
  name: string;
  blurb: string;
  stats: AchievementStats;
}

const base = EMPTY_STATS;

/** One player per difficulty tier, so each tier's badges can be seen unlocked. */
export const LAB_PRESETS: readonly LabPreset[] = [
  { id: 'new', name: 'Brand-new player', blurb: 'Just signed up and opened the app once.', stats: { ...base, daysOpened: 1, longestOpenStreak: 1 } },
  {
    id: 'week',
    name: 'First week',
    blurb: 'Set up, a team photo, a few wins and a perfect day.',
    stats: {
      ...base,
      daysOpened: 6,
      longestOpenStreak: 6,
      teamPhoto: 1,
      defaultLineupsSet: 7,
      tasksDone: 22,
      longestCheckStreak: 6,
      gamesPlayed: 6,
      wins: 4,
      longestWinStreak: 2,
      perfectGames: 1,
      bestPerfectInSeries: 1,
      bounceBacks: 2,
    },
  },
  {
    id: 'month',
    name: 'First month',
    blurb: 'Four series in: the Regular tier, close to some All-Stars.',
    stats: {
      ...base,
      daysOpened: 29,
      longestOpenStreak: 21,
      teamPhoto: 1,
      defaultLineupsSet: 7,
      tasksDone: 118,
      longestCheckStreak: 18,
      gamesPlayed: 28,
      wins: 17,
      longestWinStreak: 6,
      perfectGames: 6,
      bestPerfectInSeries: 3,
      bounceBacks: 7,
      rallyWins: 1,
      seriesWon: 3,
      ironManWins: 2,
      longestIronManRun: 2,
    },
  },
  {
    id: 'season',
    name: 'Big first season',
    blurb: 'A full season: All-Star and some MVP badges.',
    stats: {
      ...base,
      daysOpened: 88,
      longestOpenStreak: 47,
      teamPhoto: 1,
      defaultLineupsSet: 7,
      tasksDone: 612,
      longestCheckStreak: 41,
      gamesPlayed: 84,
      wins: 55,
      longestWinStreak: 12,
      perfectGames: 24,
      bestPerfectInSeries: 5,
      bounceBacks: 19,
      rallyWins: 3,
      seriesWon: 9,
      sweeps: 1,
      game7Wins: 1,
      ironManWins: 6,
      longestIronManRun: 4,
      winningSeasons: 1,
      goalsReached: 1,
    },
  },
  {
    id: 'hof',
    name: 'Hall of Famer',
    blurb: 'Years in: nearly everything, a couple still to chase.',
    stats: {
      ...base,
      daysOpened: 700,
      longestOpenStreak: 210,
      teamPhoto: 1,
      defaultLineupsSet: 7,
      tasksDone: 5400,
      longestCheckStreak: 160,
      gamesPlayed: 672,
      wins: 470,
      longestWinStreak: 26,
      perfectGames: 190,
      bestPerfectInSeries: 6,
      bounceBacks: 120,
      rallyWins: 14,
      seriesWon: 70,
      sweeps: 6,
      reverseSweeps: 1,
      game7Wins: 9,
      ironManWins: 55,
      longestIronManRun: 20,
      winningSeasons: 7,
      goalsReached: 5,
      perfectSeasons: 0,
    },
  },
];

const DEFAULT_PRESET = 'month';

function read(): AchievementSim {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AchievementSim;
  } catch {
    // Storage unavailable or old data: start over.
  }
  return newSim(LAB_PRESETS.find((p) => p.id === DEFAULT_PRESET)!.stats);
}

let current: AchievementSim | null = null;
const listeners = new Set<() => void>();

function snapshot(): AchievementSim {
  current ??= read();
  return current;
}

export function setLabSim(next: AchievementSim): void {
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Fine: it lasts until the page reloads.
  }
  listeners.forEach((l) => l());
}

/** The lab player's sim, shared by the lab and the Badges page. */
export function useLabSim(): AchievementSim {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    snapshot,
  );
}
