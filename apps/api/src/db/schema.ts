// Postgres schema (docs/DATA_MODEL_AND_API.md §3). Generic data names only; enum values
// come from @7gs/rules so the database, the rules and the contracts never drift.
//
// Additions beyond §3, all internal (never exposed by the API):
// - users.finalized_through: the finalizer's per-user cursor (last settled local date).
// - games.time_zone: the zone a game started in (GAME_DESIGN §10, travelling users).
// - series.closed_at: set once the series' Sunday is settled (idempotent close).
// - seasons.no_decisions: cached like the other aggregates.
// - rally_rolls.user_id / idempotency_key, rally_tokens.series_id,
//   rainout_allowances.seq / earned_month / series_id / used_at: grant and use bookkeeping.

import {
  GAME_RESULTS,
  GAME_STATUSES,
  LINEUP_ROLES,
  RAINOUT_SOURCES,
  RALLY_TOKEN_SOURCES,
  RESULT_DETAILS,
  SEASON_STATUSES,
  SERIES_RESULTS,
  TASK_KINDS,
  TASK_STATUSES,
} from '@7gs/rules';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Column helpers ───────────────────────────────────────────────────────────

/** Postgres `time`, exposed as 'HH:MM' (Postgres returns 'HH:MM:SS'). */
const timeOfDay = customType<{ data: string; driverData: string }>({
  dataType: () => 'time',
  fromDriver: (value) => value.slice(0, 5),
});

/** Local calendar date as 'YYYY-MM-DD'. */
const localDate = (name: string) => date(name, { mode: 'string' });

/** UTC instant. */
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const count = (name: string) => integer(name).notNull().default(0);

// ── Enums ────────────────────────────────────────────────────────────────────

export const taskStatus = pgEnum('task_status', TASK_STATUSES);
export const taskKind = pgEnum('task_kind', TASK_KINDS);
export const lineupRole = pgEnum('lineup_role', LINEUP_ROLES);
export const templateRole = pgEnum('template_role', ['lineup', 'bench']);
export const gameStatus = pgEnum('game_status', GAME_STATUSES);
export const gameResult = pgEnum('game_result', GAME_RESULTS);
export const resultDetail = pgEnum('result_detail', RESULT_DETAILS);
export const seasonStatus = pgEnum('season_status', SEASON_STATUSES);
export const seriesResult = pgEnum('series_result', SERIES_RESULTS);
export const rallyTokenSource = pgEnum('rally_token_source', RALLY_TOKEN_SOURCES);
export const rainoutSource = pgEnum('rainout_source', RAINOUT_SOURCES);

// ── Accounts ─────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull(),
  startDate: localDate('start_date').notNull(),
  defaultLockTime: timeOfDay('default_lock_time'),
  /** Last local date fully settled by the finalizer. Starts the day before sign-up. */
  finalizedThrough: localDate('finalized_through').notNull(),
  createdAt: instant('created_at').notNull(),
});

export const loginTokens = pgTable('login_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  createdAt: instant('created_at').notNull(),
  expiresAt: instant('expires_at').notNull(),
  usedAt: instant('used_at'),
});

export const sessions = pgTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: instant('created_at').notNull(),
    expiresAt: instant('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ── Calendar ─────────────────────────────────────────────────────────────────

export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    startDate: localDate('start_date').notNull(),
    playEndDate: localDate('play_end_date').notNull(),
    offseasonEndDate: localDate('offseason_end_date').notNull(),
    winGoal: integer('win_goal'),
    status: seasonStatus('status').notNull(),
    wins: count('wins'),
    losses: count('losses'),
    rallyWins: count('rally_wins'),
    noDecisions: count('no_decisions'),
    seriesWon: count('series_won'),
    seriesLost: count('series_lost'),
    runDifferential: integer('run_differential').notNull().default(0),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    unique('seasons_user_number_uq').on(t.userId, t.number),
    check('seasons_number_ck', sql`${t.number} >= 1`),
    check('seasons_win_goal_ck', sql`${t.winGoal} IS NULL OR ${t.winGoal} BETWEEN 1 AND 175`),
    check(
      'seasons_counts_ck',
      sql`${t.wins} >= 0 AND ${t.losses} >= 0 AND ${t.rallyWins} >= 0 AND ${t.seriesWon} >= 0 AND ${t.seriesLost} >= 0`,
    ),
  ],
);

export const series = pgTable(
  'series',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    startDate: localDate('start_date').notNull(),
    opponentName: text('opponent_name').notNull(),
    opponentColors: text('opponent_colors').array().notNull(),
    /** uint32 from rules.hashSeed, so it needs a bigint. */
    opponentSeed: bigint('opponent_seed', { mode: 'number' }).notNull(),
    wins: count('wins'),
    losses: count('losses'),
    result: seriesResult('result'),
    /** null until the series is complete. */
    ironMan: boolean('iron_man'),
    closedAt: instant('closed_at'),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    unique('series_season_number_uq').on(t.seasonId, t.number),
    unique('series_user_start_uq').on(t.userId, t.startDate),
    check('series_number_ck', sql`${t.number} BETWEEN 1 AND 25`),
    check('series_colors_ck', sql`cardinality(${t.opponentColors}) = 2`),
    check('series_seed_ck', sql`${t.opponentSeed} BETWEEN 0 AND 4294967295`),
    check('series_counts_ck', sql`${t.wins} BETWEEN 0 AND 7 AND ${t.losses} BETWEEN 0 AND 7`),
  ],
);

// ── Roster & starters ────────────────────────────────────────────────────────

export const taskDefinitions = pgTable(
  'task_definitions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    points: integer('points').notNull().default(1),
    status: taskStatus('status').notNull().default('active'),
    kind: taskKind('kind').notNull().default('recurring'),
    /** A missed one-off must-hit waiting to be added to the next game as a pinch hitter. */
    carryover: boolean('carryover').notNull().default(false),
    ilStartedOn: localDate('il_started_on'),
    ilMinUntil: localDate('il_min_until'),
    currentStreak: count('current_streak'),
    longestStreak: count('longest_streak'),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (t) => [
    index('task_definitions_user_idx').on(t.userId),
    check('task_definitions_points_ck', sql`${t.points} >= 1`),
    check('task_definitions_streaks_ck', sql`${t.currentStreak} >= 0 AND ${t.longestStreak} >= ${t.currentStreak}`),
    check(
      'task_definitions_il_ck',
      sql`(${t.status} = 'injured') = (${t.ilStartedOn} IS NOT NULL AND ${t.ilMinUntil} IS NOT NULL)`,
    ),
  ],
);

export const dayTemplates = pgTable(
  'day_templates',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    name: text('name').notNull(),
    threshold: integer('threshold').notNull().default(1),
    minTasks: integer('min_tasks'),
    lockTime: timeOfDay('lock_time'),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (t) => [
    unique('day_templates_user_weekday_uq').on(t.userId, t.weekday),
    check('day_templates_weekday_ck', sql`${t.weekday} BETWEEN 1 AND 7`),
    check('day_templates_threshold_ck', sql`${t.threshold} >= 1`),
    check('day_templates_min_tasks_ck', sql`${t.minTasks} IS NULL OR ${t.minTasks} >= 1`),
  ],
);

export const dayTemplateTasks = pgTable(
  'day_template_tasks',
  {
    templateId: uuid('template_id')
      .notNull()
      .references(() => dayTemplates.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => taskDefinitions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    required: boolean('required').notNull().default(false),
    role: templateRole('role').notNull(),
  },
  (t) => [
    primaryKey({ name: 'day_template_tasks_pk', columns: [t.templateId, t.taskId] }),
    index('day_template_tasks_task_idx').on(t.taskId),
    check('day_template_tasks_position_ck', sql`${t.position} >= 1`),
    check('day_template_tasks_bench_ck', sql`${t.role} = 'lineup' OR NOT ${t.required}`),
  ],
);

// ── Games ────────────────────────────────────────────────────────────────────

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    gameNumber: integer('game_number').notNull(),
    scheduledDate: localDate('scheduled_date').notNull(),
    playedDate: localDate('played_date').notNull(),
    slot: integer('slot').notNull().default(1),
    postponed: boolean('postponed').notNull().default(false),
    /** Suspended and moved to resume (slot 2) on played_date, keeping its progress. */
    suspended: boolean('suspended').notNull().default(false),
    // Snapshot taken when the lineup is built (start of the played day).
    templateId: uuid('template_id').references(() => dayTemplates.id, { onDelete: 'set null' }),
    starterName: text('starter_name'),
    threshold: integer('threshold'),
    minTasks: integer('min_tasks'),
    lockTime: timeOfDay('lock_time'),
    timeZone: text('time_zone'),
    lineupBuiltAt: instant('lineup_built_at'),
    lockedAt: instant('locked_at'),
    status: gameStatus('status').notNull().default('scheduled'),
    runs: count('runs'),
    tasksDone: count('tasks_done'),
    missedRequired: count('missed_required'),
    result: gameResult('result'),
    resultDetail: resultDetail('result_detail'),
    rallyDeadline: instant('rally_deadline'),
    finalizedAt: instant('finalized_at'),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    unique('games_series_number_uq').on(t.seriesId, t.gameNumber),
    unique('games_user_played_slot_uq').on(t.userId, t.playedDate, t.slot),
    check('games_number_ck', sql`${t.gameNumber} BETWEEN 1 AND 7`),
    check('games_slot_ck', sql`${t.slot} IN (1, 2)`),
    check('games_makeup_ck', sql`(${t.postponed} OR ${t.suspended}) = (${t.slot} = 2)`),
    check('games_threshold_ck', sql`${t.threshold} IS NULL OR ${t.threshold} >= 1`),
    check('games_min_tasks_ck', sql`${t.minTasks} IS NULL OR ${t.minTasks} >= 1`),
    check(
      'games_snapshot_ck',
      sql`${t.lineupBuiltAt} IS NULL OR (${t.starterName} IS NOT NULL AND ${t.threshold} IS NOT NULL AND ${t.timeZone} IS NOT NULL)`,
    ),
    check('games_counts_ck', sql`${t.runs} >= 0 AND ${t.tasksDone} >= 0 AND ${t.missedRequired} >= 0`),
    // A no-decision (suspended, couldn't resume) is final with no result. The detail is
    // compared as text so the migration that adds the enum value can also add this check.
    check('games_final_ck', sql`(${t.status} = 'final') = (${t.resultDetail} IS NOT NULL)`),
    check('games_final_built_ck', sql`${t.status} <> 'final' OR ${t.lineupBuiltAt} IS NOT NULL`),
    check(
      'games_detail_ck',
      sql`(${t.result} IS NULL) = (${t.resultDetail} IS NULL OR ${t.resultDetail}::text = 'suspended')`,
    ),
    check('games_live_ck', sql`${t.status} <> 'live' OR ${t.lockedAt} IS NOT NULL`),
  ],
);

export const lineupEntries = pgTable(
  'lineup_entries',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => taskDefinitions.id, { onDelete: 'cascade' }),
    taskName: text('task_name').notNull(),
    points: integer('points').notNull(),
    required: boolean('required').notNull().default(false),
    position: integer('position').notNull(),
    role: lineupRole('role').notNull(),
    subbedInAt: instant('subbed_in_at'),
    /** Added (or promoted) as a must-hit that raised runs to win by its points. */
    pinchHitAt: instant('pinch_hit_at'),
    /** A one-off must-hit carried over from a game it was missed in. */
    carriedOver: boolean('carried_over').notNull().default(false),
    completedClientAt: instant('completed_client_at'),
    completedReceivedAt: instant('completed_received_at'),
    partial: boolean('partial').notNull().default(false),
  },
  (t) => [
    unique('lineup_entries_game_task_uq').on(t.gameId, t.taskId),
    index('lineup_entries_task_idx').on(t.taskId),
    check('lineup_entries_points_ck', sql`${t.points} >= 1`),
    check('lineup_entries_position_ck', sql`${t.position} >= 1`),
    check('lineup_entries_completed_ck', sql`(${t.completedClientAt} IS NULL) = (${t.completedReceivedAt} IS NULL)`),
    check('lineup_entries_bench_ck', sql`${t.role} <> 'bench' OR NOT ${t.required}`),
  ],
);

// ── Rally Cap ────────────────────────────────────────────────────────────────

export const rallyTokens = pgTable(
  'rally_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: rallyTokenSource('source').notNull(),
    /** 'YYYY-MM'. Expires at the end of that month. */
    month: char('month', { length: 7 }).notNull(),
    /** For `series_bonus`: the series that earned it. */
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    usedGameId: uuid('used_game_id').references(() => games.id, { onDelete: 'set null' }),
    usedAt: instant('used_at'),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    // One monthly token and at most one series bonus per calendar month.
    unique('rally_tokens_user_source_month_uq').on(t.userId, t.source, t.month),
    unique('rally_tokens_used_game_uq').on(t.usedGameId),
    check('rally_tokens_month_ck', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('rally_tokens_used_ck', sql`(${t.usedGameId} IS NULL) = (${t.usedAt} IS NULL)`),
  ],
);

export const rallyRolls = pgTable(
  'rally_rolls',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => rallyTokens.id, { onDelete: 'cascade' }),
    oddsPct: integer('odds_pct').notNull(),
    oddsBreakdown: jsonb('odds_breakdown').notNull(),
    roll: integer('roll').notNull(),
    hit: boolean('hit').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    unique('rally_rolls_game_uq').on(t.gameId),
    unique('rally_rolls_token_uq').on(t.tokenId),
    unique('rally_rolls_user_key_uq').on(t.userId, t.idempotencyKey),
    check('rally_rolls_odds_ck', sql`${t.oddsPct} BETWEEN 10 AND 40`),
    check('rally_rolls_roll_ck', sql`${t.roll} BETWEEN 1 AND 100`),
  ],
);

// ── Rainouts ─────────────────────────────────────────────────────────────────

export const rainoutAllowances = pgTable(
  'rainout_allowances',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: rainoutSource('source').notNull(),
    /** For `monthly`: 'YYYY-MM', expires at the end of that month. */
    month: char('month', { length: 7 }),
    /** For `monthly`: 1 or 2 (two per month). */
    seq: integer('seq').notNull().default(1),
    /** For `iron_man`: the season's play_end_date. */
    expiresOn: localDate('expires_on'),
    /** For `iron_man`: the month it was earned (at most one per month). */
    earnedMonth: char('earned_month', { length: 7 }),
    /** For `iron_man`: the series that earned it. */
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    usedGameId: uuid('used_game_id').references(() => games.id, { onDelete: 'set null' }),
    usedAt: instant('used_at'),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    unique('rainout_allowances_monthly_uq').on(t.userId, t.source, t.month, t.seq),
    unique('rainout_allowances_series_uq').on(t.seriesId),
    // A game can use two: a Rainout and then a suspension of its makeup, or a suspension
    // and then a no-decision suspension of the resumed game.
    index('rainout_allowances_used_game_idx').on(t.usedGameId),
    uniqueIndex('rainout_allowances_iron_man_month_uq')
      .on(t.userId, t.earnedMonth)
      .where(sql`${t.source} = 'iron_man'`),
    check(
      'rainout_allowances_source_ck',
      sql`(${t.source} = 'monthly' AND ${t.month} IS NOT NULL AND ${t.expiresOn} IS NULL AND ${t.seq} IN (1, 2))
        OR (${t.source} = 'iron_man' AND ${t.month} IS NULL AND ${t.expiresOn} IS NOT NULL AND ${t.earnedMonth} IS NOT NULL)`,
    ),
    check('rainout_allowances_used_ck', sql`(${t.usedGameId} IS NULL) = (${t.usedAt} IS NULL)`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SeasonRow = typeof seasons.$inferSelect;
export type SeriesRow = typeof series.$inferSelect;
export type TaskRow = typeof taskDefinitions.$inferSelect;
export type StarterRow = typeof dayTemplates.$inferSelect;
export type StarterSlotRow = typeof dayTemplateTasks.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type EntryRow = typeof lineupEntries.$inferSelect;
export type RallyTokenRow = typeof rallyTokens.$inferSelect;
export type RallyRollRow = typeof rallyRolls.$inferSelect;
export type RainoutAllowanceRow = typeof rainoutAllowances.$inferSelect;
