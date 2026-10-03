// Row → contracts DTO mappers that don't need extra queries.

import type { LineupEntryDto, RallyRollDto, TaskDto } from '@7gs/contracts';
import type { RallyOdds } from '@7gs/rules';
import type { EntryRow, GameRow, RallyRollRow, TaskRow } from '../db/schema';

export function iso(value: Date): string;
export function iso(value: Date | null): string | null;
export function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toTaskDto(task: TaskRow): TaskDto {
  return {
    id: task.id,
    name: task.name,
    notes: task.notes,
    points: task.points,
    status: task.status,
    ilStartedOn: task.ilStartedOn,
    ilMinUntil: task.ilMinUntil,
    currentStreak: task.currentStreak,
    longestStreak: task.longestStreak,
    createdAt: iso(task.createdAt),
  };
}

const ROLE_ORDER = { lineup: 0, bench: 1, subbed_out: 2 } as const;

export function sortEntries<T extends Pick<EntryRow, 'role' | 'position' | 'id'>>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.position - b.position || a.id.localeCompare(b.id),
  );
}

export function toEntryDto(entry: EntryRow): LineupEntryDto {
  return {
    id: entry.id,
    taskId: entry.taskId,
    taskName: entry.taskName,
    points: entry.points,
    required: entry.required,
    position: entry.position,
    role: entry.role,
    subbedInAt: iso(entry.subbedInAt),
    completedAt: iso(entry.completedClientAt),
    partial: entry.partial,
  };
}

export function toRallyRollDto(roll: RallyRollRow): RallyRollDto {
  const b = roll.oddsBreakdown as RallyOdds;
  return {
    id: roll.id,
    gameId: roll.gameId,
    oddsPct: roll.oddsPct,
    breakdown: {
      base: b.base,
      closeness: b.closeness,
      missedMustHit: b.missedMustHit,
      warningTrack: b.warningTrack,
      runCushion: b.runCushion,
      raw: b.raw,
      pct: b.pct,
      limit: b.limit,
      closenessRatio: b.closenessRatio,
    },
    roll: roll.roll,
    hit: roll.hit,
    createdAt: iso(roll.createdAt),
  };
}

export function slotOf(game: Pick<GameRow, 'slot'>): 1 | 2 {
  return game.slot === 2 ? 2 : 1;
}
