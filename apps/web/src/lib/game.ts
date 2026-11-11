// Game helpers built on @7gs/rules. The UI never re-implements a rule: projections,
// series labels and lock state all come from the shared package.

import type { GameDto, GameSummaryDto, LineupEntryDto, SeriesDto } from '@7gs/contracts';
import {
  LIMITS,
  lineupThreshold,
  effectiveLockedAt,
  evaluateGame,
  opponentScore,
  pinchHitThreshold,
  scoreline,
  seriesStatus,
  type GameEvaluation,
  type SeriesGameState,
  type SeriesStatus,
  HEAD_START_SERIES,
} from '@7gs/rules';
import type { SituationKey, Vocab } from '../vocab';
import { joinList } from './format';

export function lineupOf(game: GameDto): LineupEntryDto[] {
  return game.entries.filter((e) => e.role === 'lineup').sort((a, b) => a.position - b.position);
}

export function benchOf(game: GameDto): LineupEntryDto[] {
  return game.entries.filter((e) => e.role === 'bench').sort((a, b) => a.position - b.position);
}

export function subbedOutOf(game: GameDto): LineupEntryDto[] {
  return game.entries.filter((e) => e.role === 'subbed_out');
}

/** The live (or final) evaluation of a game from its entries. */
export function evaluate(game: Pick<GameDto, 'entries' | 'threshold' | 'minTasks'>): GameEvaluation {
  return evaluateGame(
    game.entries.map((e) => ({
      points: e.points,
      required: e.required,
      role: e.role,
      completed: e.completedAt !== null,
      partial: e.partial,
    })),
    { threshold: game.threshold, minTasks: game.minTasks },
  );
}

/** "Need 2 more runs and 1 must-hit", or the W-in-hand line. */
export function projectionText(ev: GameEvaluation, vocab: Vocab): string {
  if (ev.result === 'W') return vocab.projection.win;
  const parts: string[] = [];
  if (ev.runsNeeded > 0) parts.push(vocab.projection.moreRuns(ev.runsNeeded));
  if (ev.missedRequired > 0) parts.push(vocab.projection.mustHits(ev.missedRequired));
  if (ev.tasksNeeded > 0) parts.push(vocab.projection.moreHits(ev.tasksNeeded));
  return `${vocab.projection.needPrefix} ${joinList(parts)}`;
}

/** Whether first pitch has passed: recorded, or the scheduled lock time is behind us. */
export function isLocked(game: GameDto, now: Date, timeZone: string): boolean {
  if (game.lockedAt) return true;
  return (
    effectiveLockedAt({
      lockedAt: null,
      playedDate: game.playedDate,
      lockTime: game.lockTime,
      timeZone,
      now,
    }) !== null
  );
}

/** A suspended game that ended with no decision (final, neither W nor L). */
export function isNoDecision(game: Pick<GameSummaryDto, 'status' | 'resultDetail'>): boolean {
  return game.status === 'final' && game.resultDetail === 'suspended';
}

/** Series games as the rules see them, with no-decisions and run differential for the tiebreak. */
export function seriesGameStates(games: readonly GameSummaryDto[]): SeriesGameState[] {
  return games.map((g) => {
    const line = g.result ? scoreline(g) : null;
    return {
      gameNumber: g.gameNumber,
      playedDate: g.playedDate,
      slot: g.slot,
      postponed: g.postponed,
      suspended: g.suspended,
      result: g.status === 'final' ? g.result : null,
      noDecision: isNoDecision(g),
      runDiff: line ? line.us - line.them : 0,
    };
  });
}

/** Series 0 is the Head Start: its games count, but it's never scored as a series. */
export function statusOfSeries(series: Pick<SeriesDto, 'games' | 'number'>): SeriesStatus {
  return seriesStatus(seriesGameStates(series.games), { unscored: series.number === HEAD_START_SERIES });
}

/** Runs to win added by pinch hitters: the must-hits added after the week started. */
export function pinchHitRaise(game: Pick<GameDto, 'entries'>): number {
  return game.entries.filter((e) => e.pinchHitAt !== null && e.role === 'lineup' && e.required).reduce((sum, e) => sum + e.points, 0);
}

/** Everything the lineup could score: every task batting, plus spots held for tasks on the IL. */
export function lineupRunsOf(game: Pick<GameDto, 'entries' | 'ilHolds'>): number {
  return [...game.entries.filter((e) => e.role === 'lineup'), ...game.ilHolds.filter((h) => h.role === 'lineup')].reduce(
    (sum, e) => sum + e.points,
    0,
  );
}

/**
 * Runs to win once a task joins `game`'s lineup, as the server will set it. While the week
 * is still being planned it's worked out from the new lineup (rules.lineupThreshold); once
 * it has started, only a new must-hit raises it (rules.pinchHitThreshold).
 */
export function thresholdAfterAdding(
  game: Pick<GameDto, 'entries' | 'ilHolds' | 'threshold' | 'editPolicy'>,
  add: { taskId: string; points: number; required: boolean },
): number {
  if (game.editPolicy === 'free') {
    const lineup = [
      ...game.entries.filter((e) => e.role === 'lineup' && e.taskId !== add.taskId),
      ...game.ilHolds.filter((h) => h.role === 'lineup'),
      { points: add.points, required: add.required },
    ];
    return Math.min(LIMITS.thresholdMax, lineupThreshold(lineup));
  }
  const batting = game.entries.some((e) => e.taskId === add.taskId && e.role === 'lineup');
  if (batting || !add.required) return game.threshold;
  return Math.min(LIMITS.thresholdMax, pinchHitThreshold(game.threshold, add.points, lineupRunsOf(game)));
}

/** "Runs to win 4 → 6" (and the opponent's answer) before a task is added. */
export function addMath(
  game: Pick<GameDto, 'entries' | 'ilHolds' | 'threshold' | 'editPolicy'>,
  add: { taskId: string; points: number; required: boolean },
) {
  const after = thresholdAfterAdding(game, add);
  return { before: game.threshold, after, opponentBefore: opponentScore(game.threshold), opponentAfter: opponentScore(after) };
}

/** The math shown before sending in a pinch hitter: "Runs to win 4 → 6". */
export function pinchHitMath(threshold: number, points: number, lineupRuns: number = threshold) {
  const after = pinchHitThreshold(threshold, points, lineupRuns);
  return { before: threshold, after, opponentBefore: opponentScore(threshold), opponentAfter: opponentScore(after) };
}

/** Broadcast tags for the chyron, most important first. */
export function situationKeys(status: SeriesStatus): SituationKey[] {
  const keys: SituationKey[] = [];
  if (status.situation === 'game7') keys.push('game7');
  else if (status.situation === 'elimination') keys.push('elimination');
  else if (status.situation === 'clinch') keys.push('clinch');
  else if (status.situation === 'decided') keys.push(status.result === 'won' ? 'decidedWon' : 'decidedLost');
  if (status.sweepWatch) keys.push('sweepWatch');
  return keys;
}

/** Games played on `date`, by slot. */
export function gamesOn(series: Pick<SeriesDto, 'games'> | null | undefined, date: string): GameSummaryDto[] {
  return (series?.games ?? []).filter((g) => g.playedDate === date).sort((a, b) => a.slot - b.slot);
}

/** The scoreboard numbers for a game: live from entries, or the stored final line. */
export function lineScore(game: GameDto): { runs: number; hits: number } {
  if (game.status === 'final') return { runs: game.runs, hits: game.tasksDone };
  const ev = evaluate(game);
  return { runs: ev.runs, hits: ev.tasksDone };
}
