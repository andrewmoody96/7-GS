// Streaks (DATA_MODEL §6). Callers pass results in chronological order
// (played_date, then slot). Off days, IL time and Review Week simply have no entries,
// which is what freezes a streak rather than breaking it.

import type { GameResult } from './enums';

/** Consecutive wins at the end of `results` (rally wins count as W). */
export function currentWinStreak(results: readonly GameResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === 'W'; i--) streak++;
  return streak;
}

export function longestWinStreak(results: readonly GameResult[]): number {
  return longestRun(results.map((r) => r === 'W'));
}

/**
 * Task streak over a task's lineup appearances, oldest first:
 * true = completed, false = missed.
 */
export function taskStreaks(appearances: readonly boolean[]): { current: number; longest: number } {
  let current = 0;
  for (let i = appearances.length - 1; i >= 0 && appearances[i]; i--) current++;
  return { current, longest: longestRun(appearances) };
}

function longestRun(values: readonly boolean[]): number {
  let longest = 0;
  let run = 0;
  for (const v of values) {
    run = v ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}
