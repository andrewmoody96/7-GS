// Roster (task_definitions) and the Injured List (GAME_DESIGN §7).

import type { TaskDto, TaskUpdateDto } from '@7gs/contracts';
import { compareDates, IL_MIN_DAYS, ilMinUntil, ilReturnDate, ilStartDate, localDateOf, type LocalDate, type TaskKind } from '@7gs/rules';
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, lineupEntries, taskDefinitions, type GameRow, type TaskRow, type UserRow } from '../db/schema';
import { conflict, notFound } from '../errors';
import { uuidv7 } from '../ids';
import { toTaskDto, type LockedAppearance } from './dto';
import { compactPositions, isDayOver, refreshScore } from './lineups';
import { dropHoldsForTask, recordHolds, restoreHolds } from './ilHolds';
import { ensureToday } from './today';
import { seriesGames } from './standings';
import { weekLockOf, weekLocks } from './weeks';

/**
 * Built, unfinished games whose day isn't over, split by whether their week has started.
 * A locked game (its week has had first pitch, or the game itself has) keeps every task
 * exactly as planned: edits and deletes reach only the planning ones (GAME_DESIGN §4a).
 */
async function gamesByLock(tx: Db, user: UserRow, now: Date): Promise<{ planning: GameRow[]; locked: GameRow[] }> {
  const rows = (
    await tx
      .select()
      .from(games)
      .where(and(eq(games.userId, user.id), isNotNull(games.lineupBuiltAt), ne(games.status, 'final')))
  ).filter((g) => !isDayOver(g, user, now));
  const locks = await weekLocks(
    tx,
    user,
    rows.map((g) => g.seriesId),
    now,
  );
  const planning: GameRow[] = [];
  const locked: GameRow[] = [];
  for (const g of rows) (g.lockedAt || locks.get(g.seriesId) ? locked : planning).push(g);
  return { planning, locked };
}

/** For each task still in a locked game: the last such day and its runs there. */
async function lockedAppearances(tx: Db, user: UserRow, now: Date): Promise<Map<string, LockedAppearance>> {
  const { locked } = await gamesByLock(tx, user, now);
  const out = new Map<string, LockedAppearance>();
  if (locked.length === 0) return out;
  const dateOf = new Map(locked.map((g) => [g.id, g.playedDate]));
  const entries = await tx
    .select({ taskId: lineupEntries.taskId, gameId: lineupEntries.gameId, points: lineupEntries.points })
    .from(lineupEntries)
    .where(
      and(
        inArray(
          lineupEntries.gameId,
          locked.map((g) => g.id),
        ),
        ne(lineupEntries.role, 'subbed_out'),
      ),
    );
  for (const e of entries) {
    const date = dateOf.get(e.gameId);
    if (!date) continue;
    const seen = out.get(e.taskId);
    if (!seen || compareDates(date, seen.through) > 0) out.set(e.taskId, { through: date, points: e.points });
  }
  return out;
}

async function taskView(tx: Db, user: UserRow, row: TaskRow, now: Date): Promise<TaskDto> {
  return toTaskDto(row, (await lockedAppearances(tx, user, now)).get(row.id) ?? null);
}

export async function listTasks(tx: Db, user: UserRow, now: Date): Promise<TaskDto[]> {
  const rows = await tx
    .select()
    .from(taskDefinitions)
    .where(eq(taskDefinitions.userId, user.id))
    .orderBy(asc(taskDefinitions.createdAt), asc(taskDefinitions.id));
  const locked = await lockedAppearances(tx, user, now);
  return rows.map((row) => toTaskDto(row, locked.get(row.id) ?? null));
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
  // A new task isn't in any lineup yet.
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
 * Edit a task. A new name reaches every unfinished lineup (it's only a label). A new
 * point value reaches only days whose week hasn't started: days already under way keep
 * the runs they were planned with, so what it takes to win them never changes
 * (GAME_DESIGN §4a). Finished games are history and never change.
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
    const { planning, locked } = await gamesByLock(tx, user, now);
    const setFor = async (targets: readonly GameRow[], values: Partial<typeof lineupEntries.$inferInsert>) => {
      if (targets.length === 0) return;
      await tx
        .update(lineupEntries)
        .set(values)
        .where(
          and(
            eq(lineupEntries.taskId, row.id),
            inArray(
              lineupEntries.gameId,
              targets.map((g) => g.id),
            ),
          ),
        );
    };
    await setFor(planning, { taskName: row.name, points: row.points });
    if (patch.name !== undefined) await setFor(locked, { taskName: row.name });
    if (patch.points !== undefined) for (const game of planning) await refreshScore(tx, game);
  }
  return taskView(tx, user, row, now);
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

/**
 * Delete a task (status retired, deletedAt set). It leaves the task list, the rotation and
 * every day whose week hasn't started. Days in a week already under way keep it exactly
 * as planned through that week, so the bar never drops. Its rotation spots are kept but
 * skipped (lineups only take active tasks), so restoring it puts them back.
 */
export async function retireTask(tx: Db, user: UserRow, taskId: string, now: Date): Promise<TaskDto> {
  const task = await loadTask(tx, user, taskId);
  if (task.status === 'retired') return taskView(tx, user, task, now);
  const [row] = await tx
    .update(taskDefinitions)
    .set({ status: 'retired', deletedAt: now, carryover: false, ilStartedOn: null, ilMinUntil: null, updatedAt: now })
    .where(eq(taskDefinitions.id, task.id))
    .returning();
  if (!row) throw notFound('Task');
  await dropHoldsForTask(tx, task.id);
  await removeFromOpenLineups(tx, (await gamesByLock(tx, user, now)).planning, task.id);
  return taskView(tx, user, row, now);
}

/**
 * Undo a delete while the task is still in a week under way. It comes back active, with
 * its rotation spots. Days planned since the delete don't get it back on their own.
 */
export async function restoreTask(tx: Db, user: UserRow, taskId: string, now: Date): Promise<TaskDto> {
  const task = await loadTask(tx, user, taskId);
  const locked = (await lockedAppearances(tx, user, now)).get(task.id) ?? null;
  if (task.status !== 'retired' || task.deletedAt === null || locked === null) {
    throw conflict('NOT_ELIGIBLE', 'Only a deleted task that is still in this week’s lineups can be brought back.', 'NOT_QUEUED');
  }
  const [row] = await tx
    .update(taskDefinitions)
    .set({ status: 'active', deletedAt: null, updatedAt: now })
    .where(eq(taskDefinitions.id, task.id))
    .returning();
  if (!row) throw notFound('Task');
  return toTaskDto(row, locked);
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
  if (task.status === 'injured') return taskView(tx, user, task, now);

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
    .set({ status: 'injured', ilStartedOn: start, ilMinUntil: ilMinUntil(user, start), updatedAt: now })
    .where(eq(taskDefinitions.id, task.id))
    .returning();
  if (!row) throw notFound('Task');
  await removeFromBuiltLineupsFrom(tx, user, task.id, start, now);
  return taskView(tx, user, row, now);
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
  return taskView(tx, user, row, now);
}
