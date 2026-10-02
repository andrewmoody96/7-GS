// Starters (day_templates): the fixed weekday rotation. Edits apply to every game whose
// lineup is not built yet; built games keep their snapshot.

import type { StarterDto, StarterPutDto } from '@7gs/contracts';
import { starterWarnings, type StarterWarning } from '@7gs/rules';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  dayTemplates,
  dayTemplateTasks,
  taskDefinitions,
  type StarterRow,
  type StarterSlotRow,
  type UserRow,
} from '../db/schema';
import { validationFailed, type Issue } from '../errors';
import { uuidv7 } from '../ids';

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function defaultStarterName(weekday: number): string {
  return `${WEEKDAY_NAMES[weekday - 1] ?? 'Game'} Starter`;
}

/** All 7 starters, creating empty defaults ("Monday Starter", threshold 1) as needed. */
export async function ensureStarters(tx: Db, user: UserRow, now: Date): Promise<StarterRow[]> {
  const rows = await loadStarters(tx, user.id);
  if (rows.length >= 7) return rows;
  const have = new Set(rows.map((r) => r.weekday));
  const missing = [1, 2, 3, 4, 5, 6, 7]
    .filter((weekday) => !have.has(weekday))
    .map((weekday) => ({
      id: uuidv7(),
      userId: user.id,
      weekday,
      name: defaultStarterName(weekday),
      threshold: 1,
      minTasks: null,
      lockTime: null,
      createdAt: now,
      updatedAt: now,
    }));
  await tx.insert(dayTemplates).values(missing).onConflictDoNothing();
  return loadStarters(tx, user.id);
}

function loadStarters(tx: Db, userId: string): Promise<StarterRow[]> {
  return tx.select().from(dayTemplates).where(eq(dayTemplates.userId, userId)).orderBy(asc(dayTemplates.weekday));
}

export async function starterFor(tx: Db, user: UserRow, weekday: number, now: Date): Promise<StarterRow> {
  const starter = (await ensureStarters(tx, user, now)).find((s) => s.weekday === weekday);
  if (!starter) throw new Error(`No starter for weekday ${weekday}`);
  return starter;
}

export function loadSlots(tx: Db, templateIds: string[]): Promise<StarterSlotRow[]> {
  if (templateIds.length === 0) return Promise.resolve([]);
  return tx.select().from(dayTemplateTasks).where(inArray(dayTemplateTasks.templateId, templateIds));
}

/** Snapshot values a not-yet-built game shows (and will copy when it is built). */
export interface StarterProjection {
  starterName: string;
  threshold: number;
  minTasks: number | null;
  lockTime: string | null;
}

export function projectStarter(starter: StarterRow, user: UserRow): StarterProjection {
  return {
    starterName: starter.name,
    threshold: starter.threshold,
    minTasks: starter.minTasks,
    lockTime: starter.lockTime ?? user.defaultLockTime,
  };
}

function toStarterDto(
  starter: StarterRow,
  slots: readonly Pick<StarterSlotRow, 'taskId' | 'position' | 'required' | 'role'>[],
  warnings: StarterWarning[],
): StarterDto {
  const byRole = (role: 'lineup' | 'bench') =>
    slots.filter((s) => s.role === role).sort((a, b) => a.position - b.position);
  return {
    weekday: starter.weekday,
    name: starter.name,
    threshold: starter.threshold,
    minTasks: starter.minTasks,
    lockTime: starter.lockTime,
    lineup: byRole('lineup').map((s) => ({ taskId: s.taskId, position: s.position, required: s.required })),
    bench: byRole('bench').map((s) => ({ taskId: s.taskId, position: s.position })),
    warnings,
  };
}

async function taskPoints(tx: Db, userId: string, taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: taskDefinitions.id, points: taskDefinitions.points })
    .from(taskDefinitions)
    .where(and(eq(taskDefinitions.userId, userId), inArray(taskDefinitions.id, taskIds)));
  return new Map(rows.map((r) => [r.id, r.points]));
}

export async function listStarters(tx: Db, user: UserRow, now: Date): Promise<StarterDto[]> {
  const starters = await ensureStarters(tx, user, now);
  const slots = await loadSlots(
    tx,
    starters.map((s) => s.id),
  );
  const points = await taskPoints(tx, user.id, [...new Set(slots.map((s) => s.taskId))]);
  return starters.map((starter) => {
    const own = slots.filter((s) => s.templateId === starter.id);
    const warnings = starterWarnings(
      own.map((s) => ({ taskId: s.taskId, points: points.get(s.taskId) ?? 1, role: s.role })),
      starter.threshold,
      starter.minTasks,
    );
    return toStarterDto(starter, own, warnings);
  });
}

/**
 * Replace a starter. Unknown or retired tasks are rejected; a task listed twice keeps
 * its first spot (lineup before bench) and the response carries DUPLICATE_TASK.
 */
export async function putStarter(
  tx: Db,
  user: UserRow,
  weekday: number,
  body: StarterPutDto,
  now: Date,
): Promise<StarterDto> {
  const starter = await starterFor(tx, user, weekday, now);
  const requested = [
    ...body.lineup.map((s, i) => ({ ...s, role: 'lineup' as const, index: i, path: `lineup.${i}.taskId` })),
    ...body.bench.map((s, i) => ({ ...s, required: false, role: 'bench' as const, index: i, path: `bench.${i}.taskId` })),
  ];

  const ids = [...new Set(requested.map((r) => r.taskId))];
  const tasks =
    ids.length === 0
      ? []
      : await tx
          .select()
          .from(taskDefinitions)
          .where(and(eq(taskDefinitions.userId, user.id), inArray(taskDefinitions.id, ids)));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const issues: Issue[] = [];
  for (const r of requested) {
    const task = byId.get(r.taskId);
    if (!task) issues.push({ path: r.path, message: 'Unknown task.' });
    else if (task.status === 'retired') issues.push({ path: r.path, message: 'This task is retired.' });
  }
  if (issues.length > 0) throw validationFailed(issues);

  const warnings = starterWarnings(
    requested.map((r) => ({ taskId: r.taskId, points: byId.get(r.taskId)?.points ?? 1, role: r.role })),
    body.threshold,
    body.minTasks,
  );

  const seen = new Set<string>();
  const kept = requested.filter((r) => (seen.has(r.taskId) ? false : (seen.add(r.taskId), true)));
  const slots = (['lineup', 'bench'] as const).flatMap((role) =>
    kept
      .filter((r) => r.role === role)
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map((r, i) => ({
        templateId: starter.id,
        taskId: r.taskId,
        position: i + 1,
        required: role === 'lineup' && r.required,
        role,
      })),
  );

  const [updated] = await tx
    .update(dayTemplates)
    .set({
      name: body.name,
      threshold: body.threshold,
      minTasks: body.minTasks,
      lockTime: body.lockTime,
      updatedAt: now,
    })
    .where(eq(dayTemplates.id, starter.id))
    .returning();
  await tx.delete(dayTemplateTasks).where(eq(dayTemplateTasks.templateId, starter.id));
  if (slots.length > 0) await tx.insert(dayTemplateTasks).values(slots);
  return toStarterDto(updated ?? starter, slots, warnings);
}
