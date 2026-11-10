import type { ResultDetail } from './enums';
import { hashSeed } from './opponents';
import { scoreline } from './score';

// Sport themes (cosmetic only): the words and look change, the rules never do. A theme is
// saved on the account, so the app, notifications and emails all match, and can be
// switched at any time without changing a record, a lineup or what it takes to win.
//
// The app's full wording lives in apps/web/src/vocab.ts; these are the core terms the
// server needs for notifications and emails.

export const THEMES = ['baseball', 'basketball', 'hockey'] as const;
export type Theme = (typeof THEMES)[number];

export interface ThemeTerms {
  /** "Baseball" */
  name: string;
  /** "must-hit" / "must-hits": a required task. */
  required: string;
  requiredPlural: string;
  /** "1 run" / "3 runs": what a task is worth. */
  points: (n: number) => string;
  /** "Rally Cap": the chance-based appeal of a loss. */
  comebackToken: string;
  /** "Roll a Rally Cap": what you do with it. */
  comebackAction: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const THEME_TERMS: Record<Theme, ThemeTerms> = {
  baseball: {
    name: 'Baseball',
    required: 'must-hit',
    requiredPlural: 'must-hits',
    points: (n) => plural(n, 'run', 'runs'),
    comebackToken: 'Rally Cap',
    comebackAction: 'Roll a Rally Cap',
  },
  basketball: {
    name: 'Basketball',
    required: 'must-make',
    requiredPlural: 'must-makes',
    // A task is a bucket; the scoreboard turns buckets into points (displayScore).
    points: (n) => plural(n, 'bucket', 'buckets'),
    comebackToken: 'Coach’s challenge',
    comebackAction: 'Use a coach’s challenge',
  },
  hockey: {
    name: 'Hockey',
    required: 'must-score',
    requiredPlural: 'must-scores',
    // A task is a shot; the scoreboard turns shots into goals (displayScore).
    points: (n) => plural(n, 'shot', 'shots'),
    comebackToken: 'Coach’s challenge',
    comebackAction: 'Use a coach’s challenge',
  },
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

// ── Display scores ───────────────────────────────────────────────────────────

export interface DisplayScore {
  us: number;
  them: number;
}

/**
 * The scoreboard numbers a theme shows for a game, from its baseball scoreline (rules
 * `scoreline`: runs, with the opponent at its baseline, keeping pace, or credited the
 * go-ahead run). Display only. It keeps the same winner, never shows a lead the
 * baseball line doesn't, and never lowers your score.
 *
 * - baseball: unchanged.
 * - basketball: each task-run is worth V = 100 / target (rounded) points, so reaching
 *   the target lands near 100. The opponent sits a few points short of that (3–9, fixed
 *   per game by `seed`), keeps level while you're tied, and beats you by that margin
 *   when you lose.
 * - hockey: goals stay hockey-sized. The target is worth at most 4 goals (a target of 3
 *   is 3 goals; a target of 8 is 4, so every second task scores). The opponent sits one
 *   goal short of that, so most games end by a goal.
 */
export function displayScore(
  theme: Theme,
  line: DisplayScore,
  threshold: number,
  seed: number,
): DisplayScore {
  if (theme === 'hockey') return hockeyScore(line, threshold);
  if (theme !== 'basketball') return line;
  const target = Math.max(1, threshold);
  const value = Math.max(1, Math.round(100 / target));
  // A margin that never exceeds one task's points, so a lead is always a real lead.
  const margin = Math.max(1, Math.min(3 + (seed % 7), value - 1));
  const us = line.us * value;
  const short = target * value - margin;
  let them: number;
  if (line.them === line.us) them = us;
  else if (line.them > line.us) them = Math.max(short, us + margin);
  else them = Math.max(short, line.them * value);
  return { us, them };
}

function hockeyScore(line: DisplayScore, threshold: number): DisplayScore {
  const target = Math.max(1, threshold);
  const goalsAtTarget = Math.min(target, 4);
  const goals = (runs: number) => Math.floor((runs * goalsAtTarget) / target);
  const us = goals(line.us);
  const short = goalsAtTarget - 1;
  let them: number;
  if (line.them === line.us) them = us;
  else if (line.them > line.us) them = Math.max(short, us + 1);
  else them = Math.max(short, Math.min(goals(line.them), us - 1));
  return { us, them };
}

/** A final game's margin as the theme's scoreboard shows it (for point differential). */
export function displayMargin(
  theme: Theme,
  game: { id: string; result: 'W' | 'L' | null; resultDetail?: ResultDetail | null; runs: number; threshold: number },
): number {
  if (game.result === null) return 0;
  const line = displayScore(theme, scoreline(game), game.threshold, hashSeed(game.id));
  return line.us - line.them;
}
