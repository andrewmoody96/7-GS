// Request and response bodies for /v1. Names match docs/DATA_MODEL_AND_API.md.

import {
  GAME_RESULTS,
  GAME_STATUSES,
  LIMITS,
  LINEUP_EDIT_POLICIES,
  LINEUP_ROLES,
  RAINOUT_INELIGIBLE_REASONS,
  RALLY_INELIGIBLE_REASONS,
  RESULT_DETAILS,
  SEASON_STATUSES,
  SERIES_RESULTS,
  STARTER_WARNINGS,
  SUSPENSION_INELIGIBLE_REASONS,
  TASK_KINDS,
  TASK_STATUSES,
} from '@7gs/rules';
import { z } from 'zod';
import {
  Count,
  HexColor,
  Id,
  Instant,
  LocalDate,
  MinTasks,
  MonthKey,
  Points,
  Threshold,
  TimeOfDay,
  TimeZone,
  Weekday,
} from './primitives';

// ── Calendar ─────────────────────────────────────────────────────────────────

export const CalendarPosition = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('preseason'),
    seasonNumber: z.literal(1),
    openingDay: LocalDate,
    daysUntilOpeningDay: Count,
  }),
  z.object({
    phase: z.literal('season'),
    seasonNumber: z.number().int().min(1),
    seriesNumber: z.number().int().min(1).max(25),
    gameNumber: z.number().int().min(1).max(7),
    seriesStart: LocalDate,
    seriesEnd: LocalDate,
  }),
  z.object({
    phase: z.literal('offseason'),
    seasonNumber: z.number().int().min(1),
    nextSeasonStart: LocalDate,
  }),
]);

export const SeasonWindow = z.object({
  number: z.number().int().min(1),
  start: LocalDate,
  playEnd: LocalDate,
  offseasonStart: LocalDate,
  offseasonEnd: LocalDate,
});

export const Calendar = z.object({
  signupDate: LocalDate,
  today: LocalDate,
  position: CalendarPosition,
  /** The current (or upcoming) season and the one after it. */
  seasons: z.array(SeasonWindow),
});

// ── Profile & allowances ─────────────────────────────────────────────────────

export const Allowances = z.object({
  month: MonthKey,
  rallyTokens: Count,
  rainouts: Count,
  /** Whether one of `rainouts` is the earned Iron Man bonus. */
  ironManBonusHeld: z.boolean(),
});

export const Me = z.object({
  id: Id,
  email: z.email(),
  displayName: z.string().min(1).max(40),
  timezone: TimeZone,
  startDate: LocalDate,
  defaultLockTime: TimeOfDay.nullable(),
  today: LocalDate,
  position: CalendarPosition,
  allowances: Allowances,
});

export const MePatch = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    timezone: TimeZone,
    defaultLockTime: TimeOfDay.nullable(),
  })
  .partial();

// ── Auth (dev-friendly magic link) ───────────────────────────────────────────

export const MagicLinkRequest = z.object({ email: z.email() });
export const MagicLinkResponse = z.object({
  sent: z.literal(true),
  /** Only returned when the server runs without an email provider (development). */
  devToken: z.string().optional(),
});
export const VerifyRequest = z.object({
  token: z.string().min(16),
  /** The device's IANA zone, used when creating a new account. */
  timezone: TimeZone,
});
export const Session = z.object({ me: Me, isNewUser: z.boolean() });

// ── Roster ───────────────────────────────────────────────────────────────────

export const Task = z.object({
  id: Id,
  name: z.string().min(1).max(LIMITS.taskNameMax),
  notes: z.string().max(LIMITS.notesMax).nullable(),
  points: Points,
  status: z.enum(TASK_STATUSES),
  kind: z.enum(TASK_KINDS),
  /** A missed one-off must-hit waiting to be added to the next game as a pinch hitter. */
  carryover: z.boolean(),
  ilStartedOn: LocalDate.nullable(),
  ilMinUntil: LocalDate.nullable(),
  currentStreak: Count,
  longestStreak: Count,
  createdAt: Instant,
});

export const TaskCreate = z.object({
  name: z.string().trim().min(1).max(LIMITS.taskNameMax),
  notes: z.string().max(LIMITS.notesMax).nullable().optional(),
  points: Points.default(1),
  kind: z.enum(TASK_KINDS).default('recurring'),
});

export const TaskUpdate = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.taskNameMax),
    notes: z.string().max(LIMITS.notesMax).nullable(),
    points: Points,
    kind: z.enum(TASK_KINDS),
  })
  .partial();

export const TaskList = z.object({ tasks: z.array(Task) });

// ── Starters (fixed weekday rotation) ────────────────────────────────────────

export const StarterLineupSlot = z.object({
  taskId: Id,
  position: z.number().int().min(1),
  required: z.boolean(),
});
export const StarterBenchSlot = z.object({ taskId: Id, position: z.number().int().min(1) });

export const Starter = z.object({
  weekday: Weekday,
  name: z.string().min(1).max(LIMITS.starterNameMax),
  threshold: Threshold,
  minTasks: MinTasks,
  /** Overrides the user's default lock time. */
  lockTime: TimeOfDay.nullable(),
  lineup: z.array(StarterLineupSlot),
  bench: z.array(StarterBenchSlot),
  warnings: z.array(z.enum(STARTER_WARNINGS)),
});

export const StarterPut = Starter.omit({ weekday: true, warnings: true }).extend({
  name: z.string().trim().min(1).max(LIMITS.starterNameMax),
});

export const StarterList = z.object({ starters: z.array(Starter) });

// ── Games ────────────────────────────────────────────────────────────────────

export const LineupEntry = z.object({
  id: Id,
  taskId: Id,
  taskName: z.string(),
  points: Points,
  required: z.boolean(),
  position: z.number().int().min(1),
  role: z.enum(LINEUP_ROLES),
  subbedInAt: Instant.nullable(),
  /** Added as a pinch hitter after the week locked; raised runs to win by its points. */
  pinchHitAt: Instant.nullable(),
  /** A one-off must-hit carried over from an earlier game it was missed in. */
  carriedOver: z.boolean(),
  completedAt: Instant.nullable(),
  partial: z.boolean(),
});

export const RallyOddsBreakdown = z.object({
  base: z.number().int(),
  closeness: z.number().int(),
  missedMustHit: z.number().int(),
  warningTrack: z.number().int(),
  runCushion: z.number().int(),
  raw: z.number().int(),
  pct: z.number().int().min(1).max(100),
  limit: z.enum(['floor', 'cap']).nullable(),
  closenessRatio: z.number().min(0).max(1),
});

export const RallyRoll = z.object({
  id: Id,
  gameId: Id,
  oddsPct: z.number().int().min(1).max(100),
  breakdown: RallyOddsBreakdown,
  roll: z.number().int().min(1).max(100),
  hit: z.boolean(),
  createdAt: Instant,
});

/** A spot an Injured List stint vacated; the task returns to it on activation. */
export const IlHold = z.object({
  taskId: Id,
  taskName: z.string(),
  points: Points,
  required: z.boolean(),
  role: z.enum(['lineup', 'bench']),
  position: z.number().int().min(1),
});

const GameCore = {
  id: Id,
  seriesId: Id,
  gameNumber: z.number().int().min(1).max(7),
  scheduledDate: LocalDate,
  playedDate: LocalDate,
  slot: z.union([z.literal(1), z.literal(2)]),
  postponed: z.boolean(),
  /** Suspended and moved to resume on `playedDate` (slot 2), keeping earlier progress. */
  suspended: z.boolean(),
  starterName: z.string(),
  threshold: Threshold,
  minTasks: MinTasks,
  status: z.enum(GAME_STATUSES),
  runs: Count,
  tasksDone: Count,
  missedRequired: Count,
  result: z.enum(GAME_RESULTS).nullable(),
  resultDetail: z.enum(RESULT_DETAILS).nullable(),
};

export const GameSummary = z.object(GameCore);

export const Game = z.object({
  ...GameCore,
  lockTime: TimeOfDay.nullable(),
  lockedAt: Instant.nullable(),
  rallyDeadline: Instant.nullable(),
  finalizedAt: Instant.nullable(),
  /** free before the week's first pitch; additions_only after; closed when final or the day is over. */
  editPolicy: z.enum(LINEUP_EDIT_POLICIES),
  /** All entries (lineup, bench, subbed_out). Empty until the game's lineup is built. */
  entries: z.array(LineupEntry),
  /** Tasks on the Injured List that this game is holding a spot for. */
  ilHolds: z.array(IlHold),
  rally: RallyRoll.nullable(),
});

export const Opponent = z.object({
  seed: z.number().int().min(0),
  name: z.string(),
  colors: z.tuple([HexColor, HexColor]),
});

export const Series = z.object({
  id: Id,
  seasonNumber: z.number().int().min(1),
  number: z.number().int().min(1).max(25),
  startDate: LocalDate,
  endDate: LocalDate,
  opponent: Opponent,
  wins: Count,
  losses: Count,
  result: z.enum(SERIES_RESULTS).nullable(),
  /** null until the series is complete. */
  ironMan: z.boolean().nullable(),
  /** Seven games ordered by game number. */
  games: z.array(GameSummary),
});

export const Today = z.object({
  date: LocalDate,
  position: CalendarPosition,
  /** 0 off-season, 1 normally, 2 on a doubleheader day. Ordered by slot. */
  games: z.array(Game),
  series: Series.nullable(),
});

export const WeekSummary = z.object({
  startDate: LocalDate,
  /** 'current' is this series, 'next' opens on Friday, 'opening' is Opening Week during Spring Training. */
  label: z.enum(['current', 'next', 'opening']),
  locked: z.boolean(),
});
export const WeekList = z.object({ weeks: z.array(WeekSummary) });

export const Week = z.object({
  startDate: LocalDate,
  endDate: LocalDate,
  /** The week's first first pitch. After it, lineups only grow. */
  lockedAt: Instant.nullable(),
  locked: z.boolean(),
  series: Series,
  /** Every game of the week with lineups built (planning builds them early), by date and slot. */
  games: z.array(Game),
});

/** A new must-hit added after the week locks, or a bench task promoted to must-hit. */
export const PinchHitter = z.object({ taskId: Id });

export const LineupPatch = z
  .object({
    threshold: Threshold,
    minTasks: MinTasks,
    /** Replaces the whole lineup and bench. Only before first pitch. */
    entries: z.array(
      z.object({
        taskId: Id,
        position: z.number().int().min(1),
        required: z.boolean(),
        role: z.enum(['lineup', 'bench']),
      }),
    ),
  })
  .partial();

export const CompleteEntry = z.object({ clientAt: Instant });
export const EntryPatch = z.object({ partial: z.boolean() });
export const Substitution = z.object({ outEntryId: Id, inEntryId: Id });
/** Any active roster task can join today's bench until the game is final. */
export const AddToBench = z.object({ taskId: Id });

// ── Rainouts ─────────────────────────────────────────────────────────────────

export const RainoutQuote = z.object({
  ok: z.boolean(),
  reason: z.enum(RAINOUT_INELIGIBLE_REASONS).nullable(),
  makeupDates: z.array(LocalDate),
  allowancesAvailable: Count,
});
export const RainoutRequest = z.object({ makeupDate: LocalDate });

// ── Suspended games ──────────────────────────────────────────────────────────

export const SuspensionQuote = z.object({
  ok: z.boolean(),
  reason: z.enum(SUSPENSION_INELIGIBLE_REASONS).nullable(),
  /** Empty when ok: the game would end as a no-decision. */
  resumeDates: z.array(LocalDate),
  deadline: Instant.nullable(),
  allowancesAvailable: Count,
});
/** `resumeDate` is required when the quote offers resume dates; null means no-decision. */
export const SuspendRequest = z.object({ resumeDate: LocalDate.nullable() });

// ── Rally Cap ────────────────────────────────────────────────────────────────

export const RallyQuote = z.object({
  eligible: z.boolean(),
  reason: z.enum(RALLY_INELIGIBLE_REASONS).nullable(),
  /** Present when eligible: shown to the user before they roll. */
  odds: RallyOddsBreakdown.nullable(),
  deadline: Instant.nullable(),
  tokensAvailable: Count,
  seasonWinStreak: Count,
});

export const RallyResult = z.object({ roll: RallyRoll, game: Game });

// ── Seasons ──────────────────────────────────────────────────────────────────

export const Season = z.object({
  id: Id,
  number: z.number().int().min(1),
  startDate: LocalDate,
  playEndDate: LocalDate,
  offseasonEndDate: LocalDate,
  status: z.enum(SEASON_STATUSES),
  winGoal: z.number().int().min(1).max(175).nullable(),
  wins: Count,
  losses: Count,
  rallyWins: Count,
  noDecisions: Count,
  seriesWon: Count,
  seriesLost: Count,
  runDifferential: z.number().int(),
  currentWinStreak: Count,
  longestWinStreak: Count,
});

export const SeasonPatch = z.object({ winGoal: z.number().int().min(1).max(175) });

// ── Task IL ──────────────────────────────────────────────────────────────────

export const InjuredListResponse = z.object({ task: Task });

// ── Errors ───────────────────────────────────────────────────────────────────

export const ERROR_CODES = [
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'GAME_LOCKED',
  'GAME_FINAL',
  'NOT_ELIGIBLE',
  'NO_ALLOWANCE',
  'INVALID_MAKEUP_DATE',
  'IL_MINIMUM',
  'OUT_OF_SEASON',
  'STALE_CHECKOFF',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiError = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    /** Machine-readable cause, e.g. a rules rejection reason like 'AFTER_MIDNIGHT'. */
    reason: z.string().optional(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export const Ok = z.object({ ok: z.literal(true) });
