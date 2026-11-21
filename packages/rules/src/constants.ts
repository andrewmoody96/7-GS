// Tunable numbers from docs/GAME_DESIGN.md. Change them here, never inline.

export const SERIES_LENGTH = 7;
export const WINS_TO_CLINCH = 4;

/** A season is a quarter: 12 series + 1 Review Week = 13 weeks, so 4 seasons fill 52 weeks. */
export const SERIES_PER_SEASON = 12;
export const OFFSEASON_WEEKS = 1;
export const SEASON_WEEKS = SERIES_PER_SEASON + OFFSEASON_WEEKS;
export const SEASON_DAYS = SEASON_WEEKS * 7;
export const GAMES_PER_SEASON = SERIES_PER_SEASON * SERIES_LENGTH;

export const RALLY = {
  tokensPerMonth: 1,
  /** 1 a month, a 2nd for a series won without one, a 3rd for a streak with perfect games. */
  maxHeld: 3,
  /** +% on a roll for each other Rally Cap still held, so saving them up pays off. */
  holdBonusPct: 3,
  /** The 3rd Rally Cap: a win streak this long, with this many perfect games in it. */
  streakBonusWins: 7,
  streakBonusPerfect: 3,
  perSeries: 1,
  /** Local time on the day after the game when the roll window closes (exclusive). */
  windowClosesAt: '12:00',
  floorPct: 10,
  capPct: 40,
} as const;

export const RAINOUT = {
  perMonth: 2,
  maxHeld: 3,
  ironManMinWins: 5,
} as const;

export const IL_MIN_DAYS = 3;

/** Tolerance for device clocks that run slightly ahead of the server. */
export const CHECKOFF_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * A check-off (or uncheck) stamped before midnight that only reaches the server after the
 * game went final still counts until this local time the next day, and the game is
 * re-scored. It matches the Rally Cap window.
 */
export const LATE_CHECKOFF_UNTIL = '12:00';

/**
 * Minutes after local midnight before a game is finalized, so check-offs made
 * before midnight on a slow connection still arrive. Tasks must still be
 * completed before midnight.
 */
export const FINALIZE_SETTLE_MINUTES = 30;

export const LIMITS = {
  taskNameMax: 80,
  notesMax: 500,
  starterNameMax: 40,
  /** The most runs a stored task or entry may carry (tasks from before taskPointsMax). */
  pointsMax: 100,
  /**
   * The most runs a task can be worth when it's created or edited: in baseball you can't
   * put more than 4 on the board at once (a grand slam).
   */
  taskPointsMax: 4,
  thresholdMax: 1000,
  minTasksMax: 100,
} as const;
