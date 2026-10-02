// Building a game's lineup from its starter, and Film Room warnings for starters.

import type { TaskStatus } from './enums';

export interface StarterSlot {
  taskId: string;
  position: number;
  required: boolean;
  role: 'lineup' | 'bench';
}

export interface RosterTask {
  id: string;
  name: string;
  points: number;
  status: TaskStatus;
}

export interface LineupSnapshotEntry {
  taskId: string;
  taskName: string;
  points: number;
  required: boolean;
  position: number;
  role: 'lineup' | 'bench';
}

/**
 * Snapshot a starter into a game lineup. Injured, retired and unknown tasks are left
 * out, positions are renumbered from 1 per role, and bench tasks are never required.
 */
export function buildLineup(
  slots: readonly StarterSlot[],
  roster: readonly RosterTask[],
): LineupSnapshotEntry[] {
  const tasks = new Map(roster.map((t) => [t.id, t]));
  const entries: LineupSnapshotEntry[] = [];
  for (const role of ['lineup', 'bench'] as const) {
    const ordered = slots
      .filter((s) => s.role === role)
      .sort((a, b) => a.position - b.position);
    let position = 1;
    for (const slot of ordered) {
      const task = tasks.get(slot.taskId);
      if (!task || task.status !== 'active') continue;
      entries.push({
        taskId: task.id,
        taskName: task.name,
        points: task.points,
        required: role === 'lineup' && slot.required,
        position: position++,
        role,
      });
    }
  }
  return entries;
}

export const STARTER_WARNINGS = [
  'EMPTY_LINEUP',
  'THRESHOLD_UNREACHABLE',
  'MIN_TASKS_UNREACHABLE',
  'DUPLICATE_TASK',
] as const;
export type StarterWarning = (typeof STARTER_WARNINGS)[number];

export function starterWarnings(
  entries: readonly { taskId: string; points: number; role: 'lineup' | 'bench' }[],
  threshold: number,
  minTasks: number | null,
): StarterWarning[] {
  const warnings: StarterWarning[] = [];
  const lineup = entries.filter((e) => e.role === 'lineup');
  if (lineup.length === 0) warnings.push('EMPTY_LINEUP');
  const maxRuns = lineup.reduce((sum, e) => sum + e.points, 0);
  if (lineup.length > 0 && maxRuns < threshold) warnings.push('THRESHOLD_UNREACHABLE');
  if (minTasks !== null && lineup.length > 0 && lineup.length < minTasks) {
    warnings.push('MIN_TASKS_UNREACHABLE');
  }
  if (new Set(entries.map((e) => e.taskId)).size !== entries.length) warnings.push('DUPLICATE_TASK');
  return warnings;
}
