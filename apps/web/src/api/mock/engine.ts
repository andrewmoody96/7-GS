// The mock backend's world model. It behaves like the API by running the same
// @7gs/rules functions the server uses: building lineups at the start of each game
// day, locking at first pitch, finalizing after the midnight settle window, closing
// series, and granting monthly allowances (DATA_MODEL §5).

import type {
  AllowancesDto,
  CalendarDto,
  ErrorCode,
  GameDto,
  GameSummaryDto,
  LineupEntryDto,
  LineupPatchDto,
  MeDto,
  RainoutQuoteDto,
  RallyQuoteDto,
  RallyRollDto,
  SeasonDto,
  SeriesDto,
  StarterDto,
  StarterPutDto,
  SuspensionQuoteDto,
  TaskDto,
  TodayDto,
  WeekDto,
  WeekSummaryDto,
} from '@7gs/contracts';
import {
  addDays,
  buildLineup,
  calendarPosition,
  compareDates,
  currentWinStreak,
  diffDays,
  evaluateGame,
  finalizeAfter,
  generateOpponent,
  hashSeed,
  IL_MIN_DAYS,
  isIronMan,
  LIMITS,
  lineupEditPolicy,
  nextGameDate,
  pinchHitThreshold,
  plannableWeeks,
  scoreline,
  suspensionOptions,
  weekLockedAt,
  isRallyHit,
  localDateOf,
  longestWinStreak,
  monthKey,
  RALLY,
  rainoutOptions,
  rallyDeadline,
  rallyEligibility,
  rallyOdds,
  scheduledLockAt,
  seasonRecord,
  seasonWindow,
  SERIES_LENGTH,
  seriesStatus,
  starterWarnings,
  startOfLocalDay,
  taskStreaks,
  validateCheckoff,
  weekday,
  type EntryState,
  type GameRules,
  type LocalDate,
  type RainoutGame,
  type LineupEditPolicy,
  type SeriesGameState,
  type SuspensionGame,
  type TaskKind,
  type Weekday,
} from '@7gs/rules';
import { ApiError } from '../client';
import type { EntryRow, GameRow, RallyRollRow, SeasonRow, SeriesRow, StarterRow, TaskRow, UserWorld } from './db';

export interface Env {
  ids: () => string;
  /** 1–100. */
  roll: () => number;
}

const iso = (d: Date) => d.toISOString();

export function fail(status: number, code: ErrorCode, message: string, reason?: string): never {
  throw new ApiError(status, code, message, reason ? { reason } : {});
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export function todayOf(world: UserWorld, now: Date): LocalDate {
  return localDateOf(now, world.user.timezone);
}

export function chronological(a: GameRow, b: GameRow): number {
  return compareDates(a.playedDate, b.playedDate) || a.slot - b.slot || a.gameNumber - b.gameNumber;
}

export function findGame(world: UserWorld, gameId: string): GameRow {
  return world.games.find((g) => g.id === gameId) ?? fail(404, 'NOT_FOUND', 'Game not found.');
}

export function findTask(world: UserWorld, taskId: string): TaskRow {
  return world.tasks.find((t) => t.id === taskId) ?? fail(404, 'NOT_FOUND', 'Task not found.');
}

function findEntry(game: GameRow, entryId: string): EntryRow {
  return game.entries.find((e) => e.id === entryId) ?? fail(404, 'NOT_FOUND', 'Lineup entry not found.');
}

export function gamesOfSeries(world: UserWorld, seriesId: string): GameRow[] {
  return world.games.filter((g) => g.seriesId === seriesId).sort((a, b) => a.gameNumber - b.gameNumber);
}

function seriesById(world: UserWorld, seriesId: string): SeriesRow {
  return world.series.find((s) => s.id === seriesId) ?? fail(404, 'NOT_FOUND', 'Series not found.');
}

export function starterFor(world: UserWorld, day: Weekday): StarterRow {
  const starter = world.starters.find((s) => s.weekday === day);
  if (!starter) throw new Error(`Missing starter for weekday ${day}`);
  return starter;
}

function rulesOf(world: UserWorld, game: GameRow): GameRules & { starterName: string; lockTime: string | null } {
  if (game.snapshot) return game.snapshot;
  const starter = starterFor(world, game.templateWeekday);
  return {
    starterName: starter.name,
    threshold: starter.threshold,
    minTasks: starter.minTasks,
    lockTime: starter.lockTime ?? world.user.defaultLockTime,
  };
}

function toEntryState(e: EntryRow): EntryState {
  return { points: e.points, required: e.required, role: e.role, completed: e.completedClientAt !== null, partial: e.partial };
}

export function evaluate(world: UserWorld, game: GameRow) {
  return evaluateGame(game.entries.map(toEntryState), rulesOf(world, game));
}

function toSeriesGameState(world: UserWorld, g: GameRow): SeriesGameState {
  const final = g.status === 'final';
  const result = final ? g.result : null;
  let runDiff = 0;
  if (result) {
    const line = scoreline({ result, resultDetail: g.resultDetail, runs: g.runs, threshold: rulesOf(world, g).threshold });
    runDiff = line.us - line.them;
  }
  return {
    gameNumber: g.gameNumber,
    playedDate: g.playedDate,
    slot: g.slot,
    // A suspended game was moved too, so it also costs Iron Man (rules only see `postponed`).
    postponed: g.postponed,
      suspended: g.suspended,
    result,
    noDecision: final && g.resultDetail === 'suspended',
    runDiff,
  };
}

function seasonNumberOfGame(world: UserWorld, game: GameRow): number {
  return seriesById(world, game.seriesId).seasonNumber;
}

// ── The daily job ────────────────────────────────────────────────────────────

function ensureSeason(world: UserWorld, env: Env, number: number): SeasonRow {
  let season = world.seasons.find((s) => s.number === number);
  if (!season) {
    const w = seasonWindow(world.user.startDate, number);
    season = {
      id: env.ids(),
      number,
      startDate: w.start,
      playEndDate: w.playEnd,
      offseasonEndDate: w.offseasonEnd,
      winGoal: null,
    };
    world.seasons.push(season);
  }
  return season;
}

function ensureSeries(world: UserWorld, env: Env, seasonNumber: number, number: number, startDate: LocalDate): SeriesRow {
  let series = world.series.find((s) => s.seasonNumber === seasonNumber && s.number === number);
  if (series) return series;
  const opp = generateOpponent(hashSeed(`${world.user.id}:${seasonNumber}:${number}`));
  series = {
    id: env.ids(),
    seasonNumber,
    number,
    startDate,
    opponent: { seed: opp.seed, name: opp.name, colors: [opp.colors[0], opp.colors[1]] },
    closedAt: null,
    ironMan: null,
  };
  world.series.push(series);
  for (let i = 0; i < SERIES_LENGTH; i++) {
    const date = addDays(startDate, i);
    world.games.push({
      id: env.ids(),
      seriesId: series.id,
      gameNumber: i + 1,
      scheduledDate: date,
      playedDate: date,
      slot: 1,
      postponed: false,
      suspended: false,
      templateWeekday: weekday(date),
      snapshot: null,
      lineupBuiltAt: null,
      lockedAt: null,
      status: 'scheduled',
      runs: 0,
      tasksDone: 0,
      missedRequired: 0,
      result: null,
      resultDetail: null,
      rallyDeadline: null,
      finalizedAt: null,
      entries: [],
      finalEffects: null,
    });
  }
  return series;
}

function grantMonthly(world: UserWorld, env: Env, month: string): void {
  if (!world.rallyTokens.some((t) => t.source === 'monthly' && t.month === month)) {
    world.rallyTokens.push({ id: env.ids(), source: 'monthly', month, usedGameId: null, usedAt: null });
  }
  if (!world.rainouts.some((r) => r.source === 'monthly' && r.month === month)) {
    for (let i = 0; i < 2; i++) {
      world.rainouts.push({ id: env.ids(), source: 'monthly', month, expiresOn: null, usedGameId: null, usedAt: null });
    }
  }
}

export function buildGameLineup(world: UserWorld, env: Env, game: GameRow, at: Date): void {
  const starter = starterFor(world, game.templateWeekday);
  const snapshot = buildLineup(
    [
      ...starter.lineup.map((s) => ({ ...s, role: 'lineup' as const })),
      ...starter.bench.map((s) => ({ ...s, required: false, role: 'bench' as const })),
    ],
    world.tasks,
  );
  game.entries = snapshot.map((e) => ({
    id: env.ids(),
    ...e,
    subbedInAt: null,
    pinchHitAt: null,
    carriedOver: false,
    completedClientAt: null,
    completedReceivedAt: null,
    partial: false,
  }));
  game.snapshot = {
    starterName: starter.name,
    threshold: starter.threshold,
    minTasks: starter.minTasks,
    lockTime: starter.lockTime ?? world.user.defaultLockTime,
  };
  game.lineupBuiltAt = iso(at);
  placeCarryovers(world, env, at);
}

function runDay(world: UserWorld, env: Env, date: LocalDate): void {
  const pos = calendarPosition(world.user.startDate, date);
  if (pos.phase === 'preseason') {
    ensureSeason(world, env, 1);
    return;
  }
  ensureSeason(world, env, pos.seasonNumber);
  if (pos.phase === 'offseason') {
    ensureSeason(world, env, pos.seasonNumber + 1);
    return;
  }
  ensureSeries(world, env, pos.seasonNumber, pos.seriesNumber, pos.seriesStart);
  grantMonthly(world, env, monthKey(date));
  const tz = world.user.timezone;
  for (const game of world.games) {
    if (game.playedDate === date && !game.lineupBuiltAt && game.status !== 'final') {
      buildGameLineup(world, env, game, startOfLocalDay(date, tz));
    }
  }
}

/** Copies roster names and points onto entries, as the API does at first pitch. */
function snapshotEntries(world: UserWorld, game: GameRow): void {
  for (const entry of game.entries) {
    const task = world.tasks.find((t) => t.id === entry.taskId);
    if (task) {
      entry.taskName = task.name;
      // A pinch hitter's runs already raised the threshold; keep the two in step.
      if (!entry.pinchHitAt) entry.points = task.points;
    }
  }
}

function lockAt(world: UserWorld, game: GameRow, at: Date): void {
  if (game.lockedAt) return;
  snapshotEntries(world, game);
  game.lockedAt = iso(at);
  if (game.status === 'scheduled') game.status = 'live';
}

function autoLock(world: UserWorld, now: Date): void {
  for (const game of world.games) {
    if (game.status === 'final' || game.lockedAt || !game.lineupBuiltAt) continue;
    const scheduled = scheduledLockAt(game.playedDate, rulesOf(world, game).lockTime, world.user.timezone);
    if (scheduled && scheduled.getTime() <= now.getTime()) lockAt(world, game, scheduled);
  }
}

function finalizeGame(world: UserWorld, env: Env, game: GameRow, at: Date): void {
  const ev = evaluate(world, game);
  game.status = 'final';
  game.runs = ev.runs;
  game.tasksDone = ev.tasksDone;
  game.missedRequired = ev.missedRequired;
  game.result = ev.result;
  game.resultDetail = ev.detail;
  game.rallyDeadline = iso(rallyDeadline(game.playedDate, world.user.timezone));
  game.finalizedAt = iso(at);
  applyFinalEffects(world, env, game, at);
}

// ── One-offs and pinch hitters ───────────────────────────────────────────────

/**
 * GAME_DESIGN §4a: a one-off completed in a game retires when that game goes final; a
 * missed one-off must-hit carries over to the next game day as a pinch hitter.
 */
function applyFinalEffects(world: UserWorld, env: Env, game: GameRow, at: Date): void {
  const effects = { retired: [] as string[], carried: [] as string[] };
  for (const entry of game.entries) {
    if (entry.role !== 'lineup') continue;
    const task = world.tasks.find((t) => t.id === entry.taskId);
    if (!task || task.kind !== 'one_off') continue;
    if (entry.completedClientAt) {
      if (task.status === 'retired') continue;
      task.status = 'retired';
      task.carryover = false;
      task.carryoverDate = null;
      task.ilStartedOn = null;
      task.ilMinUntil = null;
      effects.retired.push(task.id);
    } else if (entry.required && task.status === 'active') {
      task.carryover = true;
      task.carryoverDate = nextGameDate(world.user.startDate, game.playedDate);
      effects.carried.push(task.id);
    }
  }
  game.finalEffects = effects;
  placeCarryovers(world, env, at);
}

/** Reverses applyFinalEffects when a final game is suspended the next morning. */
function undoFinalEffects(world: UserWorld, game: GameRow): void {
  const effects = game.finalEffects;
  game.finalEffects = null;
  if (!effects) return;
  for (const taskId of effects.retired) {
    const task = world.tasks.find((t) => t.id === taskId);
    if (task?.status === 'retired') task.status = 'active';
  }
  for (const taskId of effects.carried) {
    const task = world.tasks.find((t) => t.id === taskId);
    if (!task) continue;
    for (const other of world.games) {
      if (other.id === game.id || other.status === 'final') continue;
      const entry = other.entries.find((e) => e.taskId === taskId && e.carriedOver && !e.completedClientAt);
      if (!entry) continue;
      other.entries = other.entries.filter((e) => e !== entry);
      if (entry.pinchHitAt && other.snapshot) other.snapshot.threshold = Math.max(1, other.snapshot.threshold - entry.points);
      renumber(other);
    }
    const ownEntry = game.entries.find((e) => e.taskId === taskId);
    task.carryover = ownEntry?.carriedOver ?? false;
    task.carryoverDate = null;
  }
}

function renumber(game: GameRow): void {
  for (const role of ['lineup', 'bench'] as const) {
    game.entries
      .filter((e) => e.role === role)
      .sort((a, b) => a.position - b.position)
      .forEach((e, i) => {
        e.position = i + 1;
      });
  }
}

/**
 * Makes `task` a must-hit in `game` and raises runs to win by exactly its runs
 * (rules.pinchHitThreshold). A bench task is promoted; a new task bats last.
 */
function addPinchHit(world: UserWorld, env: Env, game: GameRow, task: TaskRow, at: Date, carriedOver: boolean): void {
  const snapshot = game.snapshot ?? fail(409, 'NOT_ELIGIBLE', 'Open the week’s lineup card first.', 'NOT_BUILT');
  const existing = game.entries.find((e) => e.taskId === task.id && e.role !== 'subbed_out');
  if (existing?.role === 'lineup' && existing.required) {
    if (carriedOver) existing.carriedOver = true;
    return;
  }
  if (existing?.role === 'lineup') {
    // Already batting: its runs were available, so it just becomes required (no raise).
    existing.required = true;
    existing.carriedOver = existing.carriedOver || carriedOver;
    return;
  }
  const lastPosition = Math.max(0, ...game.entries.filter((e) => e.role === 'lineup').map((e) => e.position));
  snapshot.threshold = Math.min(LIMITS.thresholdMax, pinchHitThreshold(snapshot.threshold, task.points));
  if (existing) {
    // Promote from the bench.
    existing.position = lastPosition + 1;
    existing.role = 'lineup';
    existing.required = true;
    existing.points = task.points;
    existing.pinchHitAt = iso(at);
    existing.carriedOver = existing.carriedOver || carriedOver;
  } else {
    game.entries.push({
      id: env.ids(),
      taskId: task.id,
      taskName: task.name,
      points: task.points,
      required: true,
      position: lastPosition + 1,
      role: 'lineup',
      subbedInAt: null,
      pinchHitAt: iso(at),
      carriedOver,
      completedClientAt: null,
      completedReceivedAt: null,
      partial: false,
    });
  }
  renumber(game);
}

/** Puts waiting one-off carryovers into the next game day that has a game with a built lineup. */
function placeCarryovers(world: UserWorld, env: Env, at: Date): void {
  for (const task of world.tasks) {
    if (task.carryoverDate === null) continue;
    if (task.status !== 'active') {
      if (task.status === 'retired') task.carryoverDate = null;
      continue;
    }
    let date: LocalDate = task.carryoverDate;
    // A day can be empty when its game was rained out or suspended; try the next one.
    for (let i = 0; i < 30; i++) {
      const open = world.games
        .filter((g) => g.playedDate === date && g.status !== 'final')
        .sort((a, b) => a.slot - b.slot);
      const target = open[0];
      if (target) {
        if (target.lineupBuiltAt) {
          addPinchHit(world, env, target, task, at, true);
          task.carryoverDate = null;
        } else {
          task.carryoverDate = date;
        }
        break;
      }
      if (!world.games.some((g) => g.scheduledDate === date)) {
        // That series isn't on the calendar yet; the carryover waits for it.
        task.carryoverDate = date;
        break;
      }
      date = nextGameDate(world.user.startDate, date);
    }
  }
}

function finalizeDue(world: UserWorld, env: Env, now: Date): void {
  const tz = world.user.timezone;
  const pending = world.games.filter((g) => g.status !== 'final').sort(chronological);
  for (const game of pending) {
    const due = finalizeAfter(game.playedDate, tz);
    if (now.getTime() < due.getTime()) continue;
    if (!game.lineupBuiltAt) buildGameLineup(world, env, game, startOfLocalDay(game.playedDate, tz));
    const scheduled = scheduledLockAt(game.playedDate, rulesOf(world, game).lockTime, tz);
    if (scheduled) lockAt(world, game, scheduled);
    finalizeGame(world, env, game, due);
  }
}

function closeSeries(world: UserWorld, env: Env, now: Date): void {
  const today = todayOf(world, now);
  const month = monthKey(today);
  for (const series of world.series) {
    if (series.closedAt) continue;
    const games = gamesOfSeries(world, series.id);
    if (games.length < SERIES_LENGTH || games.some((g) => g.status !== 'final')) continue;
    series.closedAt = games.map((g) => g.finalizedAt ?? '').sort().at(-1) ?? iso(now);
    const states = games.map((g) => toSeriesGameState(world, g));
    series.ironMan = isIronMan(states);

    if (series.ironMan) {
      const earned = world.rainouts.some((r) => r.source === 'iron_man' && r.month === month);
      const held = world.rainouts.some(
        (r) => r.source === 'iron_man' && !r.usedGameId && r.expiresOn !== null && compareDates(today, r.expiresOn) <= 0,
      );
      if (!earned && !held) {
        const season = world.seasons.find((s) => s.number === series.seasonNumber);
        world.rainouts.push({
          id: env.ids(),
          source: 'iron_man',
          month,
          expiresOn: season?.playEndDate ?? null,
          usedGameId: null,
          usedAt: null,
        });
      }
    }

    const rallyUsed = world.rallyRolls.some((r) => games.some((g) => g.id === r.gameId));
    if (seriesStatus(states).result === 'won' && !rallyUsed) {
      const granted = world.rallyTokens.some((t) => t.source === 'series_bonus' && t.month === month);
      const held = world.rallyTokens.filter((t) => t.month === month && !t.usedGameId).length;
      if (!granted && held < RALLY.maxHeld) {
        world.rallyTokens.push({ id: env.ids(), source: 'series_bonus', month, usedGameId: null, usedAt: null });
      }
    }
  }
}

/** Brings the world up to `now`: the lazy equivalent of the API's scheduled finalizer. */
export function sync(world: UserWorld, env: Env, now: Date): void {
  const today = todayOf(world, now);
  let from = world.syncedThrough ? addDays(world.syncedThrough, 1) : world.user.startDate;
  if (diffDays(today, from) > 420) from = addDays(today, -420);
  for (let d = from; compareDates(d, today) <= 0; d = addDays(d, 1)) runDay(world, env, d);
  if (!world.syncedThrough || compareDates(today, world.syncedThrough) > 0) world.syncedThrough = today;
  autoLock(world, now);
  finalizeDue(world, env, now);
  closeSeries(world, env, now);
}

// ── Allowances ───────────────────────────────────────────────────────────────

function availableRallyTokens(world: UserWorld, today: LocalDate) {
  const month = monthKey(today);
  return world.rallyTokens.filter((t) => t.month === month && !t.usedGameId);
}

function availableRainouts(world: UserWorld, today: LocalDate) {
  const month = monthKey(today);
  const monthly = world.rainouts.filter((r) => r.source === 'monthly' && r.month === month && !r.usedGameId);
  const ironMan = world.rainouts.filter(
    (r) => r.source === 'iron_man' && !r.usedGameId && r.expiresOn !== null && compareDates(today, r.expiresOn) <= 0,
  );
  return [...monthly, ...ironMan];
}

export function allowancesOf(world: UserWorld, now: Date): AllowancesDto {
  const today = todayOf(world, now);
  const rainouts = availableRainouts(world, today);
  return {
    month: monthKey(today),
    rallyTokens: availableRallyTokens(world, today).length,
    rainouts: rainouts.length,
    ironManBonusHeld: rainouts.some((r) => r.source === 'iron_man'),
  };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

export function toTaskDto(world: UserWorld, task: TaskRow): TaskDto {
  const appearances: boolean[] = [];
  for (const game of world.games.filter((g) => g.status === 'final').sort(chronological)) {
    const entry = game.entries.find((e) => e.taskId === task.id && e.role === 'lineup');
    if (entry) appearances.push(entry.completedClientAt !== null);
  }
  const streaks = taskStreaks(appearances);
  return {
    id: task.id,
    name: task.name,
    notes: task.notes,
    points: task.points,
    status: task.status,
    kind: task.kind,
    carryover: task.carryover,
    ilStartedOn: task.ilStartedOn,
    ilMinUntil: task.ilMinUntil,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    createdAt: task.createdAt,
  };
}

export function toStarterDto(world: UserWorld, starter: StarterRow): StarterDto {
  const pointsOf = (taskId: string) => world.tasks.find((t) => t.id === taskId)?.points ?? 1;
  const warnings = starterWarnings(
    [
      ...starter.lineup.map((s) => ({ taskId: s.taskId, points: pointsOf(s.taskId), role: 'lineup' as const })),
      ...starter.bench.map((s) => ({ taskId: s.taskId, points: pointsOf(s.taskId), role: 'bench' as const })),
    ],
    starter.threshold,
    starter.minTasks,
  );
  return {
    weekday: starter.weekday,
    name: starter.name,
    threshold: starter.threshold,
    minTasks: starter.minTasks,
    lockTime: starter.lockTime,
    lineup: [...starter.lineup].sort((a, b) => a.position - b.position),
    bench: [...starter.bench].sort((a, b) => a.position - b.position),
    warnings,
  };
}

const ROLE_ORDER = { lineup: 0, bench: 1, subbed_out: 2 } as const;

function toEntryDto(e: EntryRow): LineupEntryDto {
  return {
    id: e.id,
    taskId: e.taskId,
    taskName: e.taskName,
    points: e.points,
    required: e.required,
    position: e.position,
    role: e.role,
    subbedInAt: e.subbedInAt,
    pinchHitAt: e.pinchHitAt,
    carriedOver: e.carriedOver,
    completedAt: e.completedClientAt,
    partial: e.partial,
  };
}

export function toGameSummary(world: UserWorld, game: GameRow): GameSummaryDto {
  const rules = rulesOf(world, game);
  const live = game.status === 'final' ? game : evaluate(world, game);
  return {
    id: game.id,
    seriesId: game.seriesId,
    gameNumber: game.gameNumber,
    scheduledDate: game.scheduledDate,
    playedDate: game.playedDate,
    slot: game.slot,
    postponed: game.postponed,
    suspended: game.suspended,
    starterName: rules.starterName,
    threshold: rules.threshold,
    minTasks: rules.minTasks,
    status: game.status,
    runs: live.runs,
    tasksDone: live.tasksDone,
    missedRequired: live.missedRequired,
    result: game.status === 'final' ? game.result : null,
    resultDetail: game.status === 'final' ? game.resultDetail : null,
  };
}

export function toRallyRollDto(roll: RallyRollRow): RallyRollDto {
  return {
    id: roll.id,
    gameId: roll.gameId,
    oddsPct: roll.oddsPct,
    breakdown: roll.breakdown,
    roll: roll.roll,
    hit: roll.hit,
    createdAt: roll.createdAt,
  };
}

// ── The week's lock ──────────────────────────────────────────────────────────

/** The series' first first pitch (GAME_DESIGN §4a), or null while it's still being planned. */
export function weekLock(world: UserWorld, seriesId: string, now: Date): Date | null {
  return weekLockedAt(
    gamesOfSeries(world, seriesId).map((g) => ({
      playedDate: g.playedDate,
      lockedAt: g.lockedAt ? new Date(g.lockedAt) : null,
      lockTime: rulesOf(world, g).lockTime,
    })),
    world.user.timezone,
    now,
  );
}

export function editPolicyOf(world: UserWorld, game: GameRow, now: Date): LineupEditPolicy {
  return lineupEditPolicy({
    weekLocked: weekLock(world, game.seriesId, now) !== null,
    gameFinal: game.status === 'final',
    dayOver: compareDates(todayOf(world, now), game.playedDate) > 0,
  });
}

export function toGameDto(world: UserWorld, game: GameRow, now: Date): GameDto {
  const roll = world.rallyRolls.find((r) => r.gameId === game.id);
  return {
    ...toGameSummary(world, game),
    lockTime: rulesOf(world, game).lockTime,
    lockedAt: game.lockedAt,
    rallyDeadline: game.rallyDeadline,
    finalizedAt: game.finalizedAt,
    editPolicy: editPolicyOf(world, game, now),
    entries: [...game.entries]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.position - b.position)
      .map(toEntryDto),
    rally: roll ? toRallyRollDto(roll) : null,
  };
}

export function toSeriesDto(world: UserWorld, series: SeriesRow): SeriesDto {
  const games = gamesOfSeries(world, series.id);
  const status = seriesStatus(games.map((g) => toSeriesGameState(world, g)));
  return {
    id: series.id,
    seasonNumber: series.seasonNumber,
    number: series.number,
    startDate: series.startDate,
    endDate: addDays(series.startDate, SERIES_LENGTH - 1),
    opponent: { seed: series.opponent.seed, name: series.opponent.name, colors: series.opponent.colors },
    wins: status.wins,
    losses: status.losses,
    result: status.result,
    ironMan: series.closedAt ? series.ironMan : null,
    games: games.map((g) => toGameSummary(world, g)),
  };
}

function seasonGames(world: UserWorld, seasonNumber: number): GameRow[] {
  const seriesIds = new Set(world.series.filter((s) => s.seasonNumber === seasonNumber).map((s) => s.id));
  return world.games.filter((g) => seriesIds.has(g.seriesId));
}

export function toSeasonDto(world: UserWorld, season: SeasonRow, now: Date): SeasonDto {
  const today = todayOf(world, now);
  const finals = seasonGames(world, season.number)
    .filter((g) => g.status === 'final')
    .sort(chronological);
  const record = seasonRecord(
    finals.map((g) => ({ result: g.result, resultDetail: g.resultDetail, runs: g.runs, threshold: rulesOf(world, g).threshold })),
  );
  const results = finals.flatMap((g) => (g.result ? [g.result] : []));
  let seriesWon = 0;
  let seriesLost = 0;
  for (const series of world.series.filter((s) => s.seasonNumber === season.number)) {
    const result = seriesStatus(gamesOfSeries(world, series.id).map((g) => toSeriesGameState(world, g))).result;
    if (result === 'won') seriesWon++;
    if (result === 'lost') seriesLost++;
  }
  const status =
    compareDates(today, season.startDate) < 0
      ? 'upcoming'
      : compareDates(today, season.playEndDate) <= 0
        ? 'active'
        : compareDates(today, season.offseasonEndDate) <= 0
          ? 'offseason'
          : 'complete';
  return {
    id: season.id,
    number: season.number,
    startDate: season.startDate,
    playEndDate: season.playEndDate,
    offseasonEndDate: season.offseasonEndDate,
    status,
    winGoal: season.winGoal,
    wins: record.wins,
    losses: record.losses,
    rallyWins: record.rallyWins,
    noDecisions: record.noDecisions,
    seriesWon,
    seriesLost,
    runDifferential: record.runDifferential,
    currentWinStreak: currentWinStreak(results),
    longestWinStreak: longestWinStreak(results),
  };
}

export function currentSeasonRow(world: UserWorld, now: Date): SeasonRow | null {
  const pos = calendarPosition(world.user.startDate, todayOf(world, now));
  return world.seasons.find((s) => s.number === pos.seasonNumber) ?? null;
}

export function currentSeriesRow(world: UserWorld, now: Date): SeriesRow | null {
  const today = todayOf(world, now);
  const pos = calendarPosition(world.user.startDate, today);
  if (pos.phase !== 'season') return null;
  return world.series.find((s) => s.seasonNumber === pos.seasonNumber && s.number === pos.seriesNumber) ?? null;
}

export function toMeDto(world: UserWorld, now: Date): MeDto {
  const today = todayOf(world, now);
  const { user } = world;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    startDate: user.startDate,
    defaultLockTime: user.defaultLockTime,
    today,
    position: calendarPosition(user.startDate, today),
    allowances: allowancesOf(world, now),
  };
}

export function toCalendarDto(world: UserWorld, now: Date): CalendarDto {
  const today = todayOf(world, now);
  const position = calendarPosition(world.user.startDate, today);
  return {
    signupDate: world.user.startDate,
    today,
    position,
    seasons: [seasonWindow(world.user.startDate, position.seasonNumber), seasonWindow(world.user.startDate, position.seasonNumber + 1)],
  };
}

export function toTodayDto(world: UserWorld, now: Date): TodayDto {
  const today = todayOf(world, now);
  const series = currentSeriesRow(world, now);
  return {
    date: today,
    position: calendarPosition(world.user.startDate, today),
    games: world.games
      .filter((g) => g.playedDate === today)
      .sort((a, b) => a.slot - b.slot)
      .map((g) => toGameDto(world, g, now)),
    series: series ? toSeriesDto(world, series) : null,
  };
}

// ── Game day operations ──────────────────────────────────────────────────────

function assertNotFinal(game: GameRow): void {
  if (game.status === 'final') fail(409, 'GAME_FINAL', 'This game is final.');
}

function assertBeforeMidnight(world: UserWorld, game: GameRow, now: Date): void {
  if (compareDates(todayOf(world, now), game.playedDate) > 0) {
    fail(409, 'STALE_CHECKOFF', 'The game day is over.', 'AFTER_MIDNIGHT');
  }
}

export function completeEntry(world: UserWorld, gameId: string, entryId: string, clientAt: Date, now: Date): GameDto {
  const game = findGame(world, gameId);
  const entry = findEntry(game, entryId);
  const check = validateCheckoff({
    playedDate: game.playedDate,
    timeZone: world.user.timezone,
    gameStatus: game.status,
    role: entry.role,
    clientAt,
    receivedAt: now,
  });
  if (!check.ok) {
    switch (check.reason) {
      case 'GAME_FINAL':
      case 'AFTER_MIDNIGHT':
        fail(409, 'STALE_CHECKOFF', 'That check-off arrived too late to count.', check.reason);
      case 'CLIENT_CLOCK_AHEAD':
        fail(400, 'VALIDATION_FAILED', 'The device clock is ahead of the server.', check.reason);
      default:
        fail(409, 'NOT_ELIGIBLE', 'That task can’t be checked off in this game.', check.reason);
    }
  }
  if (entry.completedClientAt) return toGameDto(world, game, now);
  lockAt(world, game, clientAt);
  entry.completedClientAt = iso(clientAt);
  entry.completedReceivedAt = iso(now);
  game.status = 'live';
  return toGameDto(world, game, now);
}

export function uncompleteEntry(world: UserWorld, gameId: string, entryId: string, now: Date): GameDto {
  const game = findGame(world, gameId);
  const entry = findEntry(game, entryId);
  if (game.status === 'final') fail(409, 'STALE_CHECKOFF', 'This game is final.', 'GAME_FINAL');
  assertBeforeMidnight(world, game, now);
  entry.completedClientAt = null;
  entry.completedReceivedAt = null;
  return toGameDto(world, game, now);
}

export function setPartial(world: UserWorld, gameId: string, entryId: string, partial: boolean, now: Date): GameDto {
  const game = findGame(world, gameId);
  const entry = findEntry(game, entryId);
  assertNotFinal(game);
  assertBeforeMidnight(world, game, now);
  if (!entry.required || entry.role !== 'lineup') {
    fail(409, 'NOT_ELIGIBLE', 'Only must-hits can be marked as warning track.', 'NOT_REQUIRED');
  }
  entry.partial = partial;
  return toGameDto(world, game, now);
}

export function lockGame(world: UserWorld, gameId: string, now: Date): GameDto {
  const game = findGame(world, gameId);
  assertNotFinal(game);
  if (game.lockedAt) return toGameDto(world, game, now);
  if (game.playedDate !== todayOf(world, now) || !game.lineupBuiltAt) {
    fail(409, 'NOT_ELIGIBLE', 'Only today’s game can be locked.', 'NOT_GAME_DAY');
  }
  lockAt(world, game, now);
  return toGameDto(world, game, now);
}

export function patchLineup(world: UserWorld, env: Env, gameId: string, patch: LineupPatchDto, now: Date): GameDto {
  const game = findGame(world, gameId);
  assertNotFinal(game);
  assertBeforeMidnight(world, game, now);
  // GAME_DESIGN §4a: free planning until the week's first pitch; after it, lineups only grow.
  if (weekLock(world, game.seriesId, now) !== null) {
    fail(409, 'GAME_LOCKED', 'The week’s first pitch has passed. Lineups only grow now.', 'WEEK_LOCKED');
  }
  if (game.lockedAt) fail(409, 'GAME_LOCKED', 'First pitch has passed; the lineup is locked.');
  if (!game.lineupBuiltAt || !game.snapshot) {
    fail(409, 'NOT_ELIGIBLE', 'Open the week’s lineup card to build this game first.', 'NOT_BUILT');
  }

  if (patch.entries) {
    const ids = patch.entries.map((e) => e.taskId);
    if (new Set(ids).size !== ids.length) fail(400, 'VALIDATION_FAILED', 'A task can appear only once per game.');
    for (const id of ids) {
      if (findTask(world, id).status !== 'active') {
        fail(409, 'NOT_ELIGIBLE', 'Only active tasks can play.', 'TASK_NOT_ACTIVE');
      }
    }
    const previous = new Map(game.entries.map((e) => [e.taskId, e]));
    const next: EntryRow[] = [];
    for (const role of ['lineup', 'bench'] as const) {
      const ordered = patch.entries.filter((e) => e.role === role).sort((a, b) => a.position - b.position);
      ordered.forEach((slot, i) => {
        const task = findTask(world, slot.taskId);
        const before = previous.get(slot.taskId);
        const required = role === 'lineup' && slot.required;
        next.push({
          id: before?.id ?? env.ids(),
          taskId: task.id,
          taskName: task.name,
          points: task.points,
          required,
          position: i + 1,
          role,
          subbedInAt: null,
          pinchHitAt: null,
          carriedOver: required && (before?.carriedOver ?? false),
          completedClientAt: null,
          completedReceivedAt: null,
          partial: false,
        });
      });
    }
    game.entries = next;
  }
  if (patch.threshold !== undefined) game.snapshot.threshold = patch.threshold;
  if (patch.minTasks !== undefined) game.snapshot.minTasks = patch.minTasks;
  return toGameDto(world, game, now);
}

export function addToBench(world: UserWorld, env: Env, gameId: string, taskId: string, now: Date): GameDto {
  const game = findGame(world, gameId);
  assertNotFinal(game);
  assertBeforeMidnight(world, game, now);
  if (!game.lineupBuiltAt) fail(409, 'NOT_ELIGIBLE', 'Lineups are built on game day.', 'NOT_GAME_DAY');
  const task = findTask(world, taskId);
  if (task.status !== 'active') fail(409, 'CONFLICT', 'Only active tasks can join the bench.', 'TASK_NOT_ACTIVE');
  if (game.entries.some((e) => e.taskId === taskId)) fail(409, 'CONFLICT', 'That task is already in this game.', 'ALREADY_IN_GAME');
  const benchPositions = game.entries.filter((e) => e.role === 'bench').map((e) => e.position);
  game.entries.push({
    id: env.ids(),
    taskId: task.id,
    taskName: task.name,
    points: task.points,
    required: false,
    position: Math.max(0, ...benchPositions) + 1,
    role: 'bench',
    subbedInAt: null,
    pinchHitAt: null,
    carriedOver: false,
    completedClientAt: null,
    completedReceivedAt: null,
    partial: false,
  });
  return toGameDto(world, game, now);
}

export function substitute(world: UserWorld, gameId: string, outEntryId: string, inEntryId: string, now: Date): GameDto {
  const game = findGame(world, gameId);
  assertNotFinal(game);
  assertBeforeMidnight(world, game, now);
  if (!game.lockedAt) {
    fail(409, 'NOT_ELIGIBLE', 'Before first pitch, edit the lineup instead.', 'NOT_LOCKED');
  }
  const out = findEntry(game, outEntryId);
  const sub = findEntry(game, inEntryId);
  if (out.role !== 'lineup') fail(409, 'NOT_ELIGIBLE', 'That task isn’t in the lineup.', 'NOT_IN_LINEUP');
  if (out.required) fail(409, 'NOT_ELIGIBLE', 'Must-hits can’t be subbed out.', 'REQUIRED');
  if (out.completedClientAt) fail(409, 'NOT_ELIGIBLE', 'That task already scored.', 'COMPLETED');
  if (sub.role !== 'bench') fail(409, 'NOT_ELIGIBLE', 'Only bench tasks can come in.', 'NOT_ON_BENCH');
  sub.role = 'lineup';
  sub.required = false;
  sub.position = out.position;
  sub.subbedInAt = iso(now);
  out.role = 'subbed_out';
  return toGameDto(world, game, now);
}

// ── Rainouts ─────────────────────────────────────────────────────────────────

function toRainoutGame(g: GameRow): RainoutGame {
  return {
    id: g.id,
    scheduledDate: g.scheduledDate,
    playedDate: g.playedDate,
    postponed: g.postponed,
    status: g.status,
    lockedAt: g.lockedAt,
  };
}

export function rainoutQuote(world: UserWorld, gameId: string, now: Date): RainoutQuoteDto {
  const game = findGame(world, gameId);
  const today = todayOf(world, now);
  const allowancesAvailable = availableRainouts(world, today).length;
  const options = rainoutOptions({
    game: toRainoutGame(game),
    seriesGames: gamesOfSeries(world, game.seriesId).map(toRainoutGame),
    allowancesAvailable,
    today,
  });
  return {
    ok: options.ok,
    reason: options.ok ? null : options.reason,
    makeupDates: options.ok ? options.makeupDates : [],
    allowancesAvailable,
  };
}

export function callRainout(world: UserWorld, gameId: string, makeupDate: LocalDate, now: Date): SeriesDto {
  const game = findGame(world, gameId);
  const quote = rainoutQuote(world, gameId, now);
  if (!quote.ok) {
    const code: ErrorCode =
      quote.reason === 'GAME_FINAL'
        ? 'GAME_FINAL'
        : quote.reason === 'GAME_LOCKED'
          ? 'GAME_LOCKED'
          : quote.reason === 'NO_ALLOWANCE'
            ? 'NO_ALLOWANCE'
            : 'NOT_ELIGIBLE';
    fail(409, code, 'This game can’t be rained out.', quote.reason ?? undefined);
  }
  if (!quote.makeupDates.includes(makeupDate)) {
    fail(409, 'INVALID_MAKEUP_DATE', 'That makeup date isn’t available.');
  }
  const today = todayOf(world, now);
  const allowance = availableRainouts(world, today)[0] ?? fail(409, 'NO_ALLOWANCE', 'No Rainouts left.');
  allowance.usedGameId = game.id;
  allowance.usedAt = iso(now);
  // GAME_DESIGN §7: the game moves with its full lineup (pinch hitters and one-offs too).
  // A lineup not built yet is built from the starter on the makeup day.
  game.postponed = true;
  game.playedDate = makeupDate;
  game.slot = 2;
  game.lockedAt = null;
  game.status = 'scheduled';
  return toSeriesDto(world, seriesById(world, game.seriesId));
}

// ── Suspended games ──────────────────────────────────────────────────────────

function toSuspensionGame(g: GameRow): SuspensionGame {
  return {
    id: g.id,
    scheduledDate: g.scheduledDate,
    playedDate: g.playedDate,
    status: g.status,
    result: g.result,
    postponed: g.postponed,
    suspended: g.suspended,
  };
}

export function suspensionQuote(world: UserWorld, gameId: string, now: Date): SuspensionQuoteDto {
  const game = findGame(world, gameId);
  const today = todayOf(world, now);
  const allowancesAvailable = availableRainouts(world, today).length;
  const options = suspensionOptions({
    game: toSuspensionGame(game),
    seriesGames: gamesOfSeries(world, game.seriesId).map(toSuspensionGame),
    allowancesAvailable,
    rallyRolled: world.rallyRolls.some((r) => r.gameId === game.id),
    today,
    now,
    timeZone: world.user.timezone,
  });
  return {
    ok: options.ok,
    reason: options.ok ? null : options.reason,
    resumeDates: options.ok ? options.resumeDates : [],
    deadline: options.ok ? iso(options.deadline) : null,
    allowancesAvailable,
  };
}

/**
 * GAME_DESIGN §7. With a resume date the game moves there as game 2 of a doubleheader,
 * keeping its progress (a final L called the next morning is reopened and its effects
 * undone). With none left it ends as a no-decision. Either way it uses a Rainout.
 */
export function suspendGame(world: UserWorld, env: Env, gameId: string, resumeDate: LocalDate | null, now: Date): SeriesDto {
  const game = findGame(world, gameId);
  const quote = suspensionQuote(world, gameId, now);
  if (!quote.ok) {
    const code: ErrorCode =
      quote.reason === 'NO_ALLOWANCE' ? 'NO_ALLOWANCE' : quote.reason === 'NO_DECISION' ? 'GAME_FINAL' : 'NOT_ELIGIBLE';
    fail(409, code, 'This game can’t be suspended.', quote.reason ?? undefined);
  }
  if (quote.resumeDates.length > 0) {
    if (resumeDate === null || !quote.resumeDates.includes(resumeDate)) {
      fail(409, 'INVALID_MAKEUP_DATE', 'Pick one of the days it can resume on.');
    }
  } else if (resumeDate !== null) {
    fail(409, 'INVALID_MAKEUP_DATE', 'No days are left in the series; it ends as a no-decision.');
  }
  const today = todayOf(world, now);
  const allowance = availableRainouts(world, today)[0] ?? fail(409, 'NO_ALLOWANCE', 'No Rainouts left.');
  allowance.usedGameId = game.id;
  allowance.usedAt = iso(now);
  const wasFinal = game.status === 'final';

  if (resumeDate !== null) {
    if (wasFinal) undoFinalEffects(world, game);
    game.suspended = true;
    game.playedDate = resumeDate;
    game.slot = 2;
    game.status = game.lockedAt ? 'live' : 'scheduled';
    game.runs = 0;
    game.tasksDone = 0;
    game.missedRequired = 0;
    game.result = null;
    game.resultDetail = null;
    game.rallyDeadline = null;
    game.finalizedAt = null;
  } else {
    if (!wasFinal) {
      const ev = evaluate(world, game);
      game.runs = ev.runs;
      game.tasksDone = ev.tasksDone;
      game.missedRequired = ev.missedRequired;
      game.finalizedAt = iso(now);
    }
    game.status = 'final';
    game.result = null;
    game.resultDetail = 'suspended';
    game.rallyDeadline = null;
    // A missed one-off must-hit still carries over from a no-decision (§4a).
    if (!wasFinal) applyFinalEffects(world, env, game, now);
  }
  return toSeriesDto(world, seriesById(world, game.seriesId));
}

// ── Pinch hitters ────────────────────────────────────────────────────────────

/** POST /games/:id/pinch-hitters: a new must-hit (or a promoted bench task) until the game is final. */
export function pinchHitter(world: UserWorld, env: Env, gameId: string, taskId: string, now: Date): GameDto {
  const game = findGame(world, gameId);
  assertNotFinal(game);
  assertBeforeMidnight(world, game, now);
  if (!game.lineupBuiltAt || !game.snapshot) {
    fail(409, 'NOT_ELIGIBLE', 'Open the week’s lineup card to build this game first.', 'NOT_BUILT');
  }
  const task = findTask(world, taskId);
  if (task.status !== 'active') fail(409, 'CONFLICT', 'Only active tasks can pinch hit.', 'TASK_NOT_ACTIVE');
  const existing = game.entries.find((e) => e.taskId === taskId);
  if (existing?.role === 'lineup' && existing.required) {
    fail(409, 'CONFLICT', 'That task is already a must-hit in this game.', 'ALREADY_REQUIRED');
  }
  if (existing?.role === 'subbed_out') {
    fail(409, 'CONFLICT', 'A task that was subbed out cannot come back in this game.', 'SUBBED_OUT');
  }
  if (existing?.role !== 'lineup' && pinchHitThreshold(game.snapshot.threshold, task.points) > LIMITS.thresholdMax) {
    fail(409, 'CONFLICT', 'Runs to win would go past the limit.', 'THRESHOLD_MAX');
  }
  addPinchHit(world, env, game, task, now, false);
  return toGameDto(world, game, now);
}

// ── The weekly lineup card ───────────────────────────────────────────────────

export function listWeeks(world: UserWorld, now: Date): { weeks: WeekSummaryDto[] } {
  const today = todayOf(world, now);
  const position = calendarPosition(world.user.startDate, today);
  return {
    weeks: plannableWeeks(world.user.startDate, today).map((startDate) => {
      const series = world.series.find((s) => s.startDate === startDate);
      return {
        startDate,
        label: position.phase === 'season' && position.seriesStart === startDate ? 'current' : 'next',
        locked: series ? weekLock(world, series.id, now) !== null : false,
      };
    }),
  };
}

/** GET /weeks/:startDate: the week's card. Opening it builds every lineup of the week. */
export function getWeek(world: UserWorld, env: Env, startDate: LocalDate, now: Date): WeekDto {
  const today = todayOf(world, now);
  if (!plannableWeeks(world.user.startDate, today).includes(startDate)) {
    fail(404, 'NOT_FOUND', 'That week’s lineup card isn’t open.');
  }
  const position = calendarPosition(world.user.startDate, startDate);
  if (position.phase !== 'season') fail(404, 'NOT_FOUND', 'That week has no games.');
  ensureSeason(world, env, position.seasonNumber);
  const series = ensureSeries(world, env, position.seasonNumber, position.seriesNumber, position.seriesStart);
  for (const game of gamesOfSeries(world, series.id)) {
    if (!game.lineupBuiltAt && game.status !== 'final') buildGameLineup(world, env, game, now);
  }
  const lock = weekLock(world, series.id, now);
  return {
    startDate: series.startDate,
    endDate: addDays(series.startDate, SERIES_LENGTH - 1),
    lockedAt: lock ? iso(lock) : null,
    locked: lock !== null,
    series: toSeriesDto(world, series),
    games: gamesOfSeries(world, series.id)
      .sort(chronological)
      .map((g) => toGameDto(world, g, now)),
  };
}

// ── Rally Cap ────────────────────────────────────────────────────────────────

function seasonWinStreakBefore(world: UserWorld, game: GameRow): number {
  const season = seasonNumberOfGame(world, game);
  const results = seasonGames(world, season)
    .filter((g) => g.status === 'final' && g.id !== game.id && chronological(g, game) < 0)
    .sort(chronological)
    .flatMap((g) => (g.result ? [g.result] : []));
  return currentWinStreak(results);
}

export function rallyQuote(world: UserWorld, gameId: string, now: Date): RallyQuoteDto {
  const game = findGame(world, gameId);
  const today = todayOf(world, now);
  const inSeason = calendarPosition(world.user.startDate, today).phase === 'season';
  const seriesGameIds = new Set(gamesOfSeries(world, game.seriesId).map((g) => g.id));
  const tokensAvailable = availableRallyTokens(world, today).length;
  const eligibility = rallyEligibility({
    inSeason,
    gameStatus: game.status,
    result: game.result,
    missedRequired: game.missedRequired,
    rallyDeadline: game.rallyDeadline ? new Date(game.rallyDeadline) : null,
    now,
    alreadyRolled: world.rallyRolls.some((r) => r.gameId === game.id),
    seriesRallyUsed: world.rallyRolls.some((r) => seriesGameIds.has(r.gameId)),
    tokensAvailable,
  });
  const streak = seasonWinStreakBefore(world, game);
  let odds: RallyQuoteDto['odds'] = null;
  if (eligibility.eligible) {
    const rules = rulesOf(world, game);
    odds = rallyOdds({
      seasonWinStreak: streak,
      runs: game.runs,
      threshold: rules.threshold,
      tasksDone: game.tasksDone,
      minTasks: rules.minTasks,
      missedRequired: game.missedRequired,
      partialOnMissed: evaluate(world, game).partialOnMissed,
    });
  }
  return {
    eligible: eligibility.eligible,
    reason: eligibility.eligible ? null : eligibility.reason,
    odds,
    deadline: game.rallyDeadline,
    tokensAvailable,
    seasonWinStreak: streak,
  };
}

export function rollRally(
  world: UserWorld,
  env: Env,
  gameId: string,
  idempotencyKey: string | null,
  now: Date,
  forcedRoll?: number,
): RallyRollRow {
  const game = findGame(world, gameId);
  const existing = world.rallyRolls.find((r) => r.gameId === game.id);
  if (existing) return existing;
  const quote = rallyQuote(world, gameId, now);
  if (!quote.eligible || !quote.odds) {
    const code: ErrorCode =
      quote.reason === 'NO_TOKEN' ? 'NO_ALLOWANCE' : quote.reason === 'OUT_OF_SEASON' ? 'OUT_OF_SEASON' : 'NOT_ELIGIBLE';
    fail(409, code, 'This game can’t be rallied.', quote.reason ?? undefined);
  }
  const token =
    availableRallyTokens(world, todayOf(world, now))[0] ?? fail(409, 'NO_ALLOWANCE', 'No Rally Caps left this month.');
  const roll = forcedRoll ?? env.roll();
  const hit = isRallyHit(roll, quote.odds.pct);
  token.usedGameId = game.id;
  token.usedAt = iso(now);
  const row: RallyRollRow = {
    id: env.ids(),
    gameId: game.id,
    tokenId: token.id,
    oddsPct: quote.odds.pct,
    breakdown: quote.odds,
    roll,
    hit,
    createdAt: iso(now),
    idempotencyKey,
  };
  world.rallyRolls.push(row);
  if (hit) {
    game.result = 'W';
    game.resultDetail = 'rally';
  }
  return row;
}

// ── Roster ───────────────────────────────────────────────────────────────────

/**
 * Games from today on whose lineup is built (the weekly card builds them early) but not
 * yet locked: they still track the roster.
 */
function editableGames(world: UserWorld, now: Date): GameRow[] {
  const today = todayOf(world, now);
  return world.games.filter(
    (g) => compareDates(g.playedDate, today) >= 0 && g.lineupBuiltAt && !g.lockedAt && g.status !== 'final',
  );
}

/**
 * Takes a task out of upcoming lineups (IL or retirement). Runs to win never changes:
 * before the week's first pitch the user adjusts it while planning; after it, the bar
 * never drops and the task leaves lineups from tomorrow (GAME_DESIGN §7).
 */
function removeFromEditableGames(world: UserWorld, taskId: string, now: Date): void {
  const today = todayOf(world, now);
  for (const game of editableGames(world, now)) {
    if (game.playedDate === today && weekLock(world, game.seriesId, now) !== null) continue;
    game.entries = game.entries.filter((e) => e.taskId !== taskId);
    renumber(game);
  }
}

export function createTask(
  world: UserWorld,
  env: Env,
  body: { name: string; notes?: string | null; points: number; kind?: TaskKind },
  now: Date,
): TaskDto {
  const task: TaskRow = {
    id: env.ids(),
    name: body.name,
    notes: body.notes ?? null,
    points: body.points,
    status: 'active',
    kind: body.kind ?? 'recurring',
    carryover: false,
    carryoverDate: null,
    ilStartedOn: null,
    ilMinUntil: null,
    createdAt: iso(now),
  };
  world.tasks.push(task);
  return toTaskDto(world, task);
}

export function updateTask(
  world: UserWorld,
  taskId: string,
  body: { name?: string; notes?: string | null; points?: number; kind?: TaskKind },
  now: Date,
): TaskDto {
  const task = findTask(world, taskId);
  if (body.name !== undefined) task.name = body.name;
  if (body.notes !== undefined) task.notes = body.notes;
  if (body.points !== undefined) task.points = body.points;
  if (body.kind !== undefined) {
    task.kind = body.kind;
    if (body.kind === 'recurring') {
      task.carryover = false;
      task.carryoverDate = null;
    }
  }
  for (const game of editableGames(world, now)) snapshotEntries(world, game);
  return toTaskDto(world, task);
}

export function retireTask(world: UserWorld, taskId: string, now: Date): TaskDto {
  const task = findTask(world, taskId);
  task.status = 'retired';
  task.carryover = false;
  task.carryoverDate = null;
  task.ilStartedOn = null;
  task.ilMinUntil = null;
  removeFromEditableGames(world, taskId, now);
  return toTaskDto(world, task);
}

export function placeOnInjuredList(world: UserWorld, taskId: string, now: Date): TaskDto {
  const task = findTask(world, taskId);
  if (task.status === 'retired') fail(409, 'NOT_ELIGIBLE', 'Retired tasks can’t go on the IL.', 'RETIRED');
  if (task.status === 'injured') return toTaskDto(world, task);
  const today = todayOf(world, now);
  const lockedToday = world.games.some(
    (g) =>
      g.playedDate === today &&
      g.lockedAt &&
      g.status !== 'final' &&
      g.entries.some((e) => e.taskId === taskId && e.role !== 'subbed_out'),
  );
  if (lockedToday) fail(409, 'GAME_LOCKED', 'It’s in today’s game and first pitch has passed.');
  task.status = 'injured';
  task.ilStartedOn = today;
  task.ilMinUntil = addDays(today, IL_MIN_DAYS);
  removeFromEditableGames(world, taskId, now);
  return toTaskDto(world, task);
}

export function activateFromInjuredList(world: UserWorld, taskId: string, now: Date): TaskDto {
  const task = findTask(world, taskId);
  if (task.status !== 'injured') fail(409, 'CONFLICT', 'That task isn’t on the Injured List.');
  if (task.ilMinUntil && compareDates(todayOf(world, now), task.ilMinUntil) < 0) {
    fail(409, 'IL_MINIMUM', `The Injured List has a ${IL_MIN_DAYS}-day minimum.`);
  }
  task.status = 'active';
  task.ilStartedOn = null;
  task.ilMinUntil = null;
  return toTaskDto(world, task);
}

export function putStarter(world: UserWorld, day: Weekday, body: StarterPutDto): StarterDto {
  for (const slot of [...body.lineup, ...body.bench]) {
    const task = world.tasks.find((t) => t.id === slot.taskId);
    if (!task || task.status === 'retired') fail(400, 'VALIDATION_FAILED', 'Unknown or retired task in the starter.');
  }
  const starter = starterFor(world, day);
  starter.name = body.name;
  starter.threshold = body.threshold;
  starter.minTasks = body.minTasks;
  starter.lockTime = body.lockTime;
  starter.lineup = body.lineup.map((s) => ({ taskId: s.taskId, position: s.position, required: s.required }));
  starter.bench = body.bench.map((s) => ({ taskId: s.taskId, position: s.position }));
  return toStarterDto(world, starter);
}

export function updateSeasonGoal(world: UserWorld, seasonId: string, winGoal: number, now: Date): SeasonDto {
  const season = world.seasons.find((s) => s.id === seasonId) ?? fail(404, 'NOT_FOUND', 'Season not found.');
  const dto = toSeasonDto(world, season, now);
  const phase = calendarPosition(world.user.startDate, todayOf(world, now)).phase;
  if (phase === 'season') fail(409, 'OUT_OF_SEASON', 'Set the goal in Spring Training or Review Week.');
  if (dto.status !== 'upcoming') fail(409, 'NOT_ELIGIBLE', 'Only an upcoming season’s goal can be set.', 'NOT_UPCOMING');
  season.winGoal = winGoal;
  return toSeasonDto(world, season, now);
}

export function seasonById(world: UserWorld, seasonId: string): SeasonRow {
  return world.seasons.find((s) => s.id === seasonId) ?? fail(404, 'NOT_FOUND', 'Season not found.');
}

export function seriesDtoById(world: UserWorld, seriesId: string): SeriesDto {
  return toSeriesDto(world, seriesById(world, seriesId));
}
