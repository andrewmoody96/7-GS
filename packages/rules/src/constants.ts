// Tunable numbers from docs/GAME_DESIGN.md. Change them here, never inline.

export const SERIES_LENGTH = 7;
export const WINS_TO_CLINCH = 4;

export const SERIES_PER_SEASON = 25;
export const OFFSEASON_WEEKS = 1;
export const SEASON_WEEKS = SERIES_PER_SEASON + OFFSEASON_WEEKS;
export const SEASON_DAYS = SEASON_WEEKS * 7;
export const GAMES_PER_SEASON = SERIES_PER_SEASON * SERIES_LENGTH;

export const RALLY = {
  tokensPerMonth: 1,
  maxHeld: 2,
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
 * Minutes after local midnight before a game is finalized, so check-offs made
 * before midnight on a slow connection still arrive. Tasks must still be
 * completed before midnight.
 */
export const FINALIZE_SETTLE_MINUTES = 30;

export const LIMITS = {
  taskNameMax: 80,
  notesMax: 500,
  starterNameMax: 40,
  pointsMax: 100,
  thresholdMax: 1000,
  minTasksMax: 100,
} as const;
