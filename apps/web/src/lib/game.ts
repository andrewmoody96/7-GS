// Game helpers built on @7gs/rules. The UI never re-implements a rule: projections,
// series labels and lock state all come from the shared package.

import type { GameDto, GameSummaryDto, LineupEntryDto, SeriesDto } from '@7gs/contracts';
import {
  effectiveLockedAt,
  evaluateGame,
  seriesStatus,
  type GameEvaluation,
  type SeriesStatus,
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

export function statusOfSeries(series: Pick<SeriesDto, 'games'>): SeriesStatus {
  return seriesStatus(series.games);
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
