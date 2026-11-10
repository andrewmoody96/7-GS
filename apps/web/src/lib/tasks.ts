import type { TaskDto } from '@7gs/contracts';
import { addDays } from '@7gs/rules';

/** Deleted, but still in a week under way until `lockedThrough` (it can be undone). */
export function isLeaving(task: Pick<TaskDto, 'status' | 'deletedAt' | 'lockedThrough'>): boolean {
  return task.status === 'retired' && task.deletedAt !== null && task.lockedThrough !== null;
}

/** Deleted and gone: no longer shown anywhere but past box scores. */
export function isGone(task: Pick<TaskDto, 'status' | 'deletedAt' | 'lockedThrough'>): boolean {
  return task.status === 'retired' && task.deletedAt !== null && task.lockedThrough === null;
}

/** The first day a new point value applies, when days under way keep the old one. */
export function newPointsFrom(task: Pick<TaskDto, 'lockedThrough' | 'lockedPoints'>): string | null {
  return task.lockedThrough && task.lockedPoints !== null ? addDays(task.lockedThrough, 1) : null;
}
