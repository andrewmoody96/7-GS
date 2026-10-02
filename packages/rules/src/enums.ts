// Value lists shared with @7gs/contracts so the Zod enums never drift from the rules.

export const TASK_STATUSES = ['active', 'injured', 'retired'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** `subbed_out` entries stay on the game for the box score but never count. */
export const LINEUP_ROLES = ['lineup', 'bench', 'subbed_out'] as const;
export type LineupRole = (typeof LINEUP_ROLES)[number];

export const GAME_STATUSES = ['scheduled', 'live', 'final'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const GAME_RESULTS = ['W', 'L'] as const;
export type GameResult = (typeof GAME_RESULTS)[number];

/**
 * - clean: won outright
 * - short: all must-hits done, but runs or minimum tasks not met
 * - forfeit: exactly one must-hit missed
 * - no_appeal: two or more must-hits missed
 * - rally: a loss overturned by a Rally Cap
 */
export const RESULT_DETAILS = ['clean', 'short', 'forfeit', 'no_appeal', 'rally'] as const;
export type ResultDetail = (typeof RESULT_DETAILS)[number];

export const SEASON_STATUSES = ['upcoming', 'active', 'offseason', 'complete'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const PHASES = ['preseason', 'season', 'offseason'] as const;
export type Phase = (typeof PHASES)[number];

export const SERIES_RESULTS = ['won', 'lost'] as const;
export type SeriesResult = (typeof SERIES_RESULTS)[number];

export const RALLY_TOKEN_SOURCES = ['monthly', 'series_bonus'] as const;
export type RallyTokenSource = (typeof RALLY_TOKEN_SOURCES)[number];

export const RAINOUT_SOURCES = ['monthly', 'iron_man'] as const;
export type RainoutSource = (typeof RAINOUT_SOURCES)[number];
