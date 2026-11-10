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
    points: (n) => plural(n, 'point', 'points'),
    comebackToken: 'Coach’s challenge',
    comebackAction: 'Use a coach’s challenge',
  },
  hockey: {
    name: 'Hockey',
    required: 'must-score',
    requiredPlural: 'must-scores',
    points: (n) => plural(n, 'goal', 'goals'),
    comebackToken: 'Coach’s challenge',
    comebackAction: 'Use a coach’s challenge',
  },
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
