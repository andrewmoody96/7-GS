// Injured List holds (GAME_DESIGN §7): the lineup spots a stint vacated, so activation
// returns the task exactly where it was. Runs to win is never touched either way.

import type { IlHoldDto } from '@7gs/contracts';
import { restorePosition, type LocalDate } from '@7gs/rules';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, ilHolds, lineupEntries, taskDefinitions, type UserRow } from '../db/schema';
import { uuidv7 } from '../ids';
import { isDayOver, loadEntries, refreshScore } from './lineups';

export interface HeldSpot {
  taskId: string;
  taskName: string;
  points: number;
  required: boolean;
  position: number;
  role: 'lineup' | 'bench';
}

export async function recordHolds(tx: Db, userId: string, gameId: string, spots: readonly HeldSpot[], now: Date): Promise<void> {
  if (spots.length === 0) return;
  await tx
    .insert(ilHolds)
    .values(
      spots.map((s) => ({
        id: uuidv7(),
        userId,
        gameId,
        taskId: s.taskId,
        taskName: s.taskName,
        points: s.points,
        required: s.role === 'lineup' && s.required,
        position: s.position,
        role: s.role,
        createdAt: now,
      })),
    )
    .onConflictDoNothing();
}

/** The user re-planned this day while the task was out: their plan stands. */
export async function dropHoldsForGame(tx: Db, gameId: string): Promise<void> {
  await tx.delete(ilHolds).where(eq(ilHolds.gameId, gameId));
}

export async function dropHoldsForTask(tx: Db, taskId: string): Promise<void> {
  await tx.delete(ilHolds).where(eq(ilHolds.taskId, taskId));
}

/**
 * Put an activated task back into every held spot in games played on `from` or later
 * that are still open, then forget all of its holds. Each spot keeps its batting order
 * position (later entries move down one), its must-hit status and its runs. Runs to
 * win is left alone: the IL never lowered it.
 */
export async function restoreHolds(tx: Db, user: UserRow, taskId: string, from: LocalDate, now: Date): Promise<void> {
  const [task] = await tx.select().from(taskDefinitions).where(eq(taskDefinitions.id, taskId));
  const rows = await tx
    .select({ hold: ilHolds, game: games })
    .from(ilHolds)
    .innerJoin(games, eq(games.id, ilHolds.gameId))
    .where(and(eq(ilHolds.taskId, taskId), gte(games.playedDate, from)))
    .orderBy(games.playedDate, games.slot);
  for (const { hold, game } of rows) {
    if (game.status === 'final' || !game.lineupBuiltAt || isDayOver(game, user, now)) continue;
    const entries = await loadEntries(tx, [game.id]);
    if (entries.some((e) => e.taskId === taskId)) continue;
    const role = hold.role === 'bench' ? 'bench' : 'lineup';
    const { position, shiftFrom } = restorePosition(entries, role, hold.position);
    await tx
      .update(lineupEntries)
      .set({ position: sql`${lineupEntries.position} + 1` })
      .where(
        and(
          eq(lineupEntries.gameId, game.id),
          // A subbed-out entry shares its replacement's spot, so it moves with the lineup.
          role === 'lineup' ? inArray(lineupEntries.role, ['lineup', 'subbed_out']) : eq(lineupEntries.role, 'bench'),
          gte(lineupEntries.position, shiftFrom),
        ),
      );
    await tx.insert(lineupEntries).values({
      id: uuidv7(),
      gameId: game.id,
      taskId,
      taskName: task?.name ?? hold.taskName,
      points: hold.points,
      required: role === 'lineup' && hold.required,
      position,
      role,
    });
    await refreshScore(tx, game);
  }
  await dropHoldsForTask(tx, taskId);
}

export async function holdsByGame(tx: Db, gameIds: readonly string[]): Promise<Map<string, IlHoldDto[]>> {
  const map = new Map<string, IlHoldDto[]>();
  if (gameIds.length === 0) return map;
  const rows = await tx.select().from(ilHolds).where(inArray(ilHolds.gameId, [...gameIds]));
  rows.sort((a, b) => (a.role === b.role ? a.position - b.position : a.role === 'lineup' ? -1 : 1));
  for (const r of rows) {
    const list = map.get(r.gameId) ?? [];
    list.push({
      taskId: r.taskId,
      taskName: r.taskName,
      points: r.points,
      required: r.required,
      role: r.role === 'bench' ? 'bench' : 'lineup',
      position: r.position,
    });
    map.set(r.gameId, list);
  }
  return map;
}
