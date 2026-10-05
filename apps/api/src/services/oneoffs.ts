// One-off tasks at the final (GAME_DESIGN §4a): a one-off completed in a game retires
// once that game is final; a missed one-off must-hit carries over to the next game day
// as a pinch hitter (rules.nextGameDate skips Review Week). One that wasn't a must-hit
// doesn't move.

import { nextGameDate, type LocalDate } from '@7gs/rules';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dayTemplateTasks, lineupEntries, taskDefinitions, type EntryRow, type GameRow, type TaskRow, type UserRow } from '../db/schema';
import { applyCarryoversFrom } from './lineups';

/**
 * Run once per settled date (the finalizer's cursor makes it idempotent) over every
 * final game played that date, no-decisions included ("the day still counts"). A task
 * in two games that day is judged once: completed in either retires it.
 */
export async function settleOneOffs(tx: Db, user: UserRow, date: LocalDate, finals: readonly GameRow[], now: Date): Promise<void> {
  const gameIds = finals.filter((g) => g.status === 'final').map((g) => g.id);
  if (gameIds.length === 0) return;
  const rows = await tx
    .select({ entry: lineupEntries, task: taskDefinitions })
    .from(lineupEntries)
    .innerJoin(taskDefinitions, eq(taskDefinitions.id, lineupEntries.taskId))
    .where(and(inArray(lineupEntries.gameId, gameIds), eq(taskDefinitions.kind, 'one_off')));

  const byTask = new Map<string, { task: TaskRow; entries: EntryRow[] }>();
  for (const { entry, task } of rows) {
    const item = byTask.get(task.id) ?? { task, entries: [] };
    item.entries.push(entry);
    byTask.set(task.id, item);
  }

  let carried = false;
  for (const { task, entries } of byTask.values()) {
    if (task.status === 'retired') continue;
    const completed = entries.some((e) => e.completedClientAt !== null && e.role !== 'bench');
    const missedMustHit = entries.some((e) => e.role === 'lineup' && e.required && e.completedClientAt === null);
    if (completed) {
      // Retired from the roster and starters. Lineups it was already placed in later are
      // left as they are, so no planned bar changes.
      await tx
        .update(taskDefinitions)
        .set({ status: 'retired', carryover: false, ilStartedOn: null, ilMinUntil: null, updatedAt: now })
        .where(eq(taskDefinitions.id, task.id));
      await tx.delete(dayTemplateTasks).where(eq(dayTemplateTasks.taskId, task.id));
    } else if (missedMustHit) {
      await tx.update(taskDefinitions).set({ carryover: true, updatedAt: now }).where(eq(taskDefinitions.id, task.id));
      carried = true;
    }
  }
  if (carried) await applyCarryoversFrom(tx, user, nextGameDate(user.startDate, date), now);
}
