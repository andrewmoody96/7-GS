// Roster (task_definitions) and the Injured List (GAME_DESIGN §7).

import type { TaskDto, TaskUpdateDto } from '@7gs/contracts';
import { compareDates, IL_MIN_DAYS, ilMinUntil, ilReturnDate, ilStartDate, localDateOf, type LocalDate, type TaskKind } from '@7gs/rules';
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dayTemplateTasks, games, lineupEntries, taskDefinitions, type GameRow, type TaskRow, type UserRow } from '../db/schema';
import { conflict, notFound } from '../errors';
import { uuidv7 } from '../ids';
import { toTaskDto } from './dto';
import { compactPositions, openGames, refreshScore } from './lineups';
import { dropHoldsForTask, recordHolds, restoreHolds } from './ilHolds';
import { ensureToday } from './today';
import { seriesGames } from './standings';
import { weekLockOf } from './weeks';

export async function listTasks(tx: Db, user: UserRow): Promise<TaskDto[]> {
  const rows = await tx
    .select()
    .from(taskDefinitions)
    .where(eq(taskDefinitions.userId, user.id))
    .orderBy(asc(taskDefinitions.createdAt), asc(taskDefinitions.id));
  return rows.map(toTaskDto);
}

export async function createTask(
  tx: Db,
  user: UserRow,
  body: { name: string; notes?: string | null; points: number; kind?: TaskKind },
  now: Date,
): Promise<TaskDto> {
  const [row] = await tx
    .insert(taskDefinitions)
    .values({
      id: uuidv7(),
      userId: user.id,
      name: body.name,
      notes: body.notes ?? null,
      points: body.points,
      kind: body.kind ?? 'recurring',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error('Task insert failed');
  return toTaskDto(row);
}

async function loadTask(tx: Db, user: UserRow, taskId: string): Promise<TaskRow> {
  const [row] = await tx
    .select()
    .from(taskDefinitions)
    .where(and(eq(taskDefinitions.id, taskId), eq(taskDefinitions.userId, user.id)))
    .for('update');
  if (!row) throw notFound('Task');
  return row;
}

/**
 * Edit a task. Lineups that are built but still before first pitch pick up a new name
 * or point value (entries are frozen at lock, GAME_DESIGN §4); history never changes.
 */
export async function updateTask(tx: Db, user: UserRow, taskId: string, patch: TaskUpdateDto, now: Date): Promise<TaskDto> {
  const task = await loadTask(tx, user, taskId);
  const set: Partial<typeof taskDefinitions.$inferInsert> = { updatedAt: now };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.points !== undefined) set.points = patch.points;
  if (patch.kind !== undefined) {
    set.kind = patch.kind;
    // Only a one-off carries over.
    if (patch.kind === 'recurring') set.carryover = false;
  }
  const [row] = await tx.update(taskDefinitions).set(set).where(eq(taskDefinitions.id, task.id)).returning();
  if (!row) throw notFound('Task');

  if (patch.name !== undefined || patch.points !== undefined) {
    const open = await openGames(tx, user, now);
    if (open.length > 0) {
      await tx
        .update(lineupEntries)
        .set({ taskName: row.name, points: row.points })
        .where(
          and(
            eq(lineupEntries.taskId, row.id),
            inArray(
              lineupEntries.gameId,
              open.map((g) => g.id),
            ),
          ),
        );
      for (const game of open) await refreshScore(tx, game);
    }
  }
  return toTaskDto(row);
}

/** Drop a task from lineups that are still editable (built, before first pitch). */
async function removeFromOpenLineups(tx: Db, games: readonly GameRow[], taskId: string): Promise<void> {
  for (const game of games) {
    const removed = await tx
      .delete(lineupEntries)
      .where(and(eq(lineupEntries.gameId, game.id), eq(lineupEntries.taskId, taskId)))
      .returning({ id: lineupEntries.id });
    if (removed.length === 0) continue;
    await compactPositions(tx, game.id);
    await refreshScore(tx, game);
  }
}

/**
 * Take a task's unfinished entries out of built, non-final games played on `from` or
 * later, remembering each spot as an IL hold so activation can put it back.
 */
async function removeFromBuiltLineupsFrom(tx: Db, user: UserRow, taskId: string, from: LocalDate, now: Date): Promise<void> {
  const targets = await tx
    .select()
    .from(games)
    .where(
      and(eq(games.userId, user.id), gte(games.playedDate, from), isNotNull(games.lineupBuiltAt), ne(games.status, 'final')),
    );
  for (const game of targets) {
    const removed = await tx
      .delete(lineupEntries)
      .where(
        and(
          eq(lineupEntries.gameId, game.id),
          eq(lineupEntries.taskId, taskId),
          isNull(lineupEntries.completedClientAt),
          ne(lineupEntries.role, 'subbed_out'),
        ),
      )
      .returning();
    if (removed.length === 0) continue;
    await recordHolds(
      tx,
      user.id,
      game.id,
      removed.map((e) => ({
        taskId: e.taskId,
        taskName: e.taskName,
        points: e.points,
        required: e.required,
        position: e.position,
        role: e.role === 'bench' ? 'bench' : 'lineup',
      })),
      now,
    );
    await compactPositions(tx, game.id);
    await refreshScore(tx, game);
  }
}

/** Retire (soft delete): off every starter and every still-editable lineup. */
export async function retireTask(tx: Db, user: UserRow, taskId: string, now: Date): Promise<TaskDto> {
  const task = await loadTask(tx, user, taskId);
  if (task.status === 'retired') return toTaskDto(task);
  const [row] = await tx
    .update(taskDefinitions)
    .set({ status: 'retired', carryover: false, ilStartedOn: null, ilMinUntil: null, updatedAt: now })
    .where(eq(taskDefinitions.id, task.id))
    .returning();
  if (!row) throw notFound('Task');
  await tx.delete(dayTemplateTasks).where(eq(dayTemplateTasks.taskId, task.id));
  await dropHoldsForTask(tx, task.id);
  await removeFromOpenLineups(tx, await openGames(tx, user, now), task.id);
  return toTaskDto(row);
}

/** The IL minimum is a rule shared with the web app's demo backend. */
export { ilMinUntil } from '@7gs/rules';

/**
 * Place a task on the IL (GAME_DESIGN §7). If it is in one of today's games that already
 * had first pitch (or whose week has), it must still be played today, so the stint starts tomorrow;
 * otherwise it starts today. From that date on it leaves every built lineup (the week's
 * card may already be built) except entries already completed, and those games keep
 * their runs to win: the bar never drops, the IL only changes who clears it.
 */
export async function placeOnInjuredList(tx: Db, user: UserRow, taskId: string, now: Date): Promise<TaskDto> {
  const task = await loadTask(tx, user, taskId);
  if (task.status === 'retired') throw conflict('CONFLICT', 'A retired task cannot go on the injured list.', 'RETIRED');
  if (task.status === 'injured') return toTaskDto(task);

  const today = localDateOf(now, user.timezone);
  const todays = await ensureToday(tx, user, now);
  const builtToday = todays.filter((g) => g.lineupBuiltAt && g.status !== 'final');
  const appearsIn =
    builtToday.length === 0
      ? []
      : await tx
          .select({ gameId: lineupEntries.gameId })
          .from(lineupEntries)
          .where(
            and(
              eq(lineupEntries.taskId, task.id),
              ne(lineupEntries.role, 'subbed_out'),
              inArray(
                lineupEntries.gameId,
                builtToday.map((g) => g.id),
              ),
            ),
          );
  // Today's game keeps it if that game had first pitch, or once the week's first pitch has
  // passed (after the lock, the IL takes effect from tomorrow: GAME_DESIGN §7).
  let playsToday = false;
  for (const g of builtToday) {
    if (!appearsIn.some((a) => a.gameId === g.id)) continue;
    if (g.lockedAt !== null || weekLockOf(await seriesGames(tx, g.seriesId), user, now) !== null) playsToday = true;
  }

  const start = ilStartDate(today, playsToday);
  const [row] = await tx
    .update(taskDefinitions)
    .set({ status: 'injured', ilStartedOn: start, ilMinUntil: ilMinUntil(user.startDate, start), updatedAt: now })
    .where(eq(taskDefinitions.id, task.id))
    .returning();
  if (!row) throw notFound('Task');
  await removeFromBuiltLineupsFrom(tx, user, task.id, start, now);
  return toTaskDto(row);
}

/**
 * Activate from the IL once the minimum stint is over. The task goes back into every
 * spot the stint vacated from tomorrow on (or everywhere, when cancelling a stint that
 * hasn't started), and into its starters' lineups for days not built yet.
 */
export async function activateFromInjuredList(tx: Db, user: UserRow, taskId: string, now: Date): Promise<TaskDto> {
  const task = await loadTask(tx, user, taskId);
  if (task.status !== 'injured' || !task.ilStartedOn || !task.ilMinUntil) {
    throw conflict('CONFLICT', 'This task is not on the injured list.', 'NOT_INJURED');
  }
  const today = localDateOf(now, user.timezone);
  const notStartedYet = compareDates(today, task.ilStartedOn) < 0;
  if (!notStartedYet && compareDates(today, task.ilMinUntil) < 0) {
    throw conflict(
      'IL_MINIMUM',
      `The injured list has a ${IL_MIN_DAYS}-day minimum. This task can be activated on ${task.ilMinUntil}.`,
      'MINIMUM_STINT',
    );
  }
  const [row] = await tx
    .update(taskDefinitions)
    .set({ status: 'active', ilStartedOn: null, ilMinUntil: null, updatedAt: now })
    .where(eq(taskDefinitions.id, task.id))
    .returning();
  if (!row) throw notFound('Task');
  await restoreHolds(tx, user, task.id, ilReturnDate(today, task.ilStartedOn), now);
  return toTaskDto(row);
}
