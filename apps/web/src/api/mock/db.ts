// Storage shapes for the in-browser mock backend. They mirror the tables in
// docs/DATA_MODEL_AND_API.md §3 (camelCased), keeping only what the mock needs.

import type {
  GameResult,
  GameStatus,
  LineupRole,
  LocalDate,
  RallyOdds,
  ResultDetail,
  TaskKind,
  TaskStatus,
  Weekday,
} from '@7gs/rules';
import type { ScenarioName } from './scenarios';

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  startDate: LocalDate;
  defaultLockTime: string | null;
  createdAt: string;
}

export interface TaskRow {
  id: string;
  name: string;
  notes: string | null;
  points: number;
  status: TaskStatus;
  kind: TaskKind;
  /** A missed one-off must-hit that's still to do (carried to the next game as a pinch hitter). */
  carryover: boolean;
  /** Where a carryover still has to be placed: the game day it moves to. null once placed. */
  carryoverDate: LocalDate | null;
  ilStartedOn: LocalDate | null;
  ilMinUntil: LocalDate | null;
  createdAt: string;
}

export interface StarterRow {
  weekday: Weekday;
  name: string;
  threshold: number;
  minTasks: number | null;
  lockTime: string | null;
  lineup: { taskId: string; position: number; required: boolean }[];
  bench: { taskId: string; position: number }[];
}

export interface SeasonRow {
  id: string;
  number: number;
  startDate: LocalDate;
  playEndDate: LocalDate;
  offseasonEndDate: LocalDate;
  winGoal: number | null;
}

export interface SeriesRow {
  id: string;
  seasonNumber: number;
  number: number;
  startDate: LocalDate;
  opponent: { seed: number; name: string; colors: [string, string] };
  /** Set once all seven games are final and the series has been closed out. */
  closedAt: string | null;
  ironMan: boolean | null;
}

export interface EntryRow {
  id: string;
  taskId: string;
  taskName: string;
  points: number;
  required: boolean;
  position: number;
  role: LineupRole;
  subbedInAt: string | null;
  /** Added as a must-hit after the week locked; the game's threshold rose by its points. */
  pinchHitAt: string | null;
  /** A one-off must-hit carried over from a game it was missed in. */
  carriedOver: boolean;
  completedClientAt: string | null;
  completedReceivedAt: string | null;
  partial: boolean;
}

export interface GameSnapshot {
  starterName: string;
  threshold: number;
  minTasks: number | null;
  lockTime: string | null;
}

export interface GameRow {
  id: string;
  seriesId: string;
  gameNumber: number;
  scheduledDate: LocalDate;
  playedDate: LocalDate;
  slot: 1 | 2;
  postponed: boolean;
  /** Suspended and moved to resume (slot 2) on `playedDate`, keeping its progress. */
  suspended: boolean;
  /** Weekday of the starter this game uses (the original day for a makeup game). */
  templateWeekday: Weekday;
  /** Copied from the starter when the lineup is built; null before that. */
  snapshot: GameSnapshot | null;
  lineupBuiltAt: string | null;
  lockedAt: string | null;
  status: GameStatus;
  runs: number;
  tasksDone: number;
  missedRequired: number;
  result: GameResult | null;
  resultDetail: ResultDetail | null;
  rallyDeadline: string | null;
  finalizedAt: string | null;
  entries: EntryRow[];
  /** What going final did to the roster, so a next-morning suspension can undo it. */
  finalEffects: FinalEffects | null;
}

export interface FinalEffects {
  /** One-off tasks retired because they were completed in this game. */
  retired: string[];
  /** One-off must-hits missed in this game and carried to a later game. */
  carried: string[];
}

export interface RallyTokenRow {
  id: string;
  source: 'monthly' | 'series_bonus';
  month: string;
  usedGameId: string | null;
  usedAt: string | null;
}

export interface RainoutRow {
  id: string;
  source: 'monthly' | 'iron_man';
  /** Allowance month for `monthly`; the month it was earned for `iron_man`. */
  month: string;
  /** Iron Man only: the season's last day of play. */
  expiresOn: LocalDate | null;
  usedGameId: string | null;
  usedAt: string | null;
}

export interface RallyRollRow {
  id: string;
  gameId: string;
  tokenId: string;
  oddsPct: number;
  breakdown: RallyOdds;
  roll: number;
  hit: boolean;
  createdAt: string;
  idempotencyKey: string | null;
}

export interface UserWorld {
  user: UserRow;
  tasks: TaskRow[];
  starters: StarterRow[];
  seasons: SeasonRow[];
  series: SeriesRow[];
  games: GameRow[];
  rallyTokens: RallyTokenRow[];
  rainouts: RainoutRow[];
  rallyRolls: RallyRollRow[];
  /** Last local date the daily job ran for. */
  syncedThrough: LocalDate | null;
}

export { SCENARIOS, type ScenarioName } from './scenarios';

export interface MagicLinkRow {
  token: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
}

export const MOCK_DB_VERSION = 2;

export interface MockDb {
  version: typeof MOCK_DB_VERSION;
  scenario: ScenarioName;
  /** Demo clock: milliseconds added to the device clock. */
  clockOffsetMs: number;
  sessionUserId: string | null;
  magicLinks: MagicLinkRow[];
  worlds: UserWorld[];
}

export const STORAGE_KEY = '7gs.mock.v1';

export function loadDb(storage: Storage | null): MockDb | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as MockDb;
    return db.version === MOCK_DB_VERSION ? db : null;
  } catch {
    return null;
  }
}

export function saveDb(storage: Storage | null, db: MockDb): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: the demo keeps working in memory.
  }
}
