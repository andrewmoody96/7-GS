// Late check-offs (GAME_DESIGN §4): a check-off, uncheck or "partly done" stamped before
// midnight that only reaches the server after the game went final still counts until noon
// the next day (rules.lateCheckoffDeadline). The game's result is then worked out again,
// along with everything that hangs off it.

import { nextGameDate, rallyDeadline } from '@7gs/rules';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  dayTemplateTasks,
  games,
  lineupEntries,
  rainoutAllowances,
  rallyRolls,
  rallyTokens,
  taskDefinitions,
  type GameRow,
  type UserRow,
} from '../db/schema';
import { grantStreakBonusToken } from './allowances';
import { applyCarryoversFrom, evaluateRows, gameTimeZone, loadEntries, reloadGame } from './lineups';
import { closeSeries, recomputeSeason, recomputeSeries, recomputeTaskStreaks } from './standings';

/**
 * Work a final game's result out again after a late change to `taskId`'s entry.
 *
 * - The result, runs and Rally Cap window follow the entries again.
 * - Now a W: a Rally Cap rolled on it is given back (the roll is erased); it was never needed.
 * - Still an L after a roll: the roll stands (a hit keeps the Rally W).
 * - Task streaks, series and season aggregates are rebuilt; a closed series is closed
 *   again, taking back an unused Iron Man Rainout or series-bonus Rally Cap it no longer earns.
 * - A one-off: done late, it retires and any carried-over copy comes out of later days;
 *   undone late, it is carried over to the next game day like any missed must-hit.
 */
export async function rescoreFinalGame(tx: Db, user: UserRow, game: GameRow, taskId: string, now: Date): Promise<GameRow> {
  const entries = await loadEntries(tx, [game.id]);
  const ev = evaluateRows(game, entries);
  const [roll] = await tx.select().from(rallyRolls).where(eq(rallyRolls.gameId, game.id));

  let result: GameRow['result'] = ev.result;
  let detail: GameRow['resultDetail'] = ev.detail;
  let deadline = ev.rallyEligible ? rallyDeadline(game.playedDate, gameTimeZone(game, user)) : null;
  if (ev.result === 'W') {
    if (roll) {
      await tx.delete(rallyRolls).where(eq(rallyRolls.gameId, game.id));
      await tx.update(rallyTokens).set({ usedGameId: null, usedAt: null }).where(eq(rallyTokens.usedGameId, game.id));
    }
    deadline = null;
  } else if (roll) {
    deadline = null;
    if (roll.hit) {
      result = 'W';
      detail = 'rally';
    }
  }
  await tx
    .update(games)
    .set({ runs: ev.runs, tasksDone: ev.tasksDone, missedRequired: ev.missedRequired, result, resultDetail: detail, rallyDeadline: deadline })
    .where(eq(games.id, game.id));

  await recomputeTaskStreaks(
    tx,
    entries.filter((e) => e.role === 'lineup').map((e) => e.taskId),
  );
  const updated = await recomputeSeries(tx, game.seriesId);
  await recomputeSeason(tx, updated.seasonId);
  if (updated.closedAt) {
    const closed = await closeSeries(tx, user, updated.id, now);
    if (!closed.ironMan) {
      await tx
        .delete(rainoutAllowances)
        .where(and(eq(rainoutAllowances.seriesId, closed.id), eq(rainoutAllowances.source, 'iron_man'), isNull(rainoutAllowances.usedGameId)));
    }
    if (closed.result !== 'won') {
      await tx
        .delete(rallyTokens)
        .where(and(eq(rallyTokens.seriesId, closed.id), eq(rallyTokens.source, 'series_bonus'), isNull(rallyTokens.usedGameId)));
    }
  }
  if (result === 'W') await grantStreakBonusToken(tx, user, updated.seasonId, game.playedDate, now);

  await resettleOneOff(tx, user, game, taskId, now);
  return reloadGame(tx, game.id);
}

/** A one-off whose check-off changed late: retire it, or carry it over again. */
async function resettleOneOff(tx: Db, user: UserRow, game: GameRow, taskId: string, now: Date): Promise<void> {
  const [task] = await tx.select().from(taskDefinitions).where(eq(taskDefinitions.id, taskId));
  if (!task || task.kind !== 'one_off') return;
  // Judged across every final game that day, as at the final (oneoffs.settleOneOffs).
  const sameDay = await tx
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.userId, user.id), eq(games.playedDate, game.playedDate), eq(games.status, 'final')));
  const dayEntries = (
    await loadEntries(
      tx,
      sameDay.map((g) => g.id),
    )
  ).filter((e) => e.taskId === taskId);
  const completed = dayEntries.some((e) => e.completedClientAt !== null && e.role !== 'bench');
  const missedMustHit = dayEntries.some((e) => e.role === 'lineup' && e.required && e.completedClientAt === null);

  if (completed) {
    // Done after all: take out copies carried into later days that weren't done there,
    // and the raise each one brought with it.
    const carried = await tx
      .select({ entry: lineupEntries, game: games })
      .from(lineupEntries)
      .innerJoin(games, eq(games.id, lineupEntries.gameId))
      .where(
        and(
          eq(lineupEntries.taskId, taskId),
          eq(lineupEntries.carriedOver, true),
          isNull(lineupEntries.completedClientAt),
          ne(games.status, 'final'),
          ne(games.id, game.id),
        ),
      );
    for (const { entry, game: later } of carried) {
      await tx.delete(lineupEntries).where(eq(lineupEntries.id, entry.id));
      if (entry.pinchHitAt) {
        await tx
          .update(games)
          .set({ threshold: Math.max(1, (later.threshold ?? 1) - entry.points) })
          .where(eq(games.id, later.id));
      }
    }
    await tx
      .update(taskDefinitions)
      .set({ status: 'retired', carryover: false, ilStartedOn: null, ilMinUntil: null, updatedAt: now })
      .where(eq(taskDefinitions.id, taskId));
    await tx.delete(dayTemplateTasks).where(eq(dayTemplateTasks.taskId, taskId));
  } else if (missedMustHit && task.status === 'retired' && task.deletedAt === null) {
    // Retired at the final because it looked done; it wasn't, so it carries over.
    const placed = await tx
      .select({ id: lineupEntries.id })
      .from(lineupEntries)
      .innerJoin(games, eq(games.id, lineupEntries.gameId))
      .where(and(eq(lineupEntries.taskId, taskId), inArray(games.status, ['scheduled', 'live'])));
    await tx
      .update(taskDefinitions)
      .set({ status: 'active', carryover: placed.length === 0, updatedAt: now })
      .where(eq(taskDefinitions.id, taskId));
    if (placed.length === 0) await applyCarryoversFrom(tx, user, nextGameDate(user, game.playedDate), now);
  }
}
