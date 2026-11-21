// Badges (rules achievements): an account's stats, worked out from its history every time
// it's asked, so play from before badges existed counts and nothing can drift.
//
// Days opened come from user_open_days (recorded since badges arrived), plus every day
// with a check-off and the sign-up day: an account that checked something off that day
// had the app open.

import type { AchievementsDto } from '@7gs/contracts';
import { achievementStatsFromHistory, localDateOf, type LocalDate } from '@7gs/rules';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dayTemplates, dayTemplateTasks, games, lineupEntries, seasons, series, userAvatars, userOpenDays, type UserRow } from '../db/schema';

export async function achievements(tx: Db, user: UserRow): Promise<AchievementsDto> {
  const finals = await tx
    .select({
      id: games.id,
      seriesId: games.seriesId,
      gameNumber: games.gameNumber,
      playedDate: games.playedDate,
      slot: games.slot,
      result: games.result,
      resultDetail: games.resultDetail,
      tasksDone: games.tasksDone,
      threshold: games.threshold,
    })
    .from(games)
    .where(and(eq(games.userId, user.id), eq(games.status, 'final')));

  // A game is all done when every lineup task in it was checked off.
  const open = new Set<string>();
  const lineupSize = new Map<string, number>();
  if (finals.length > 0) {
    const entries = await tx
      .select({ gameId: lineupEntries.gameId, completedAt: lineupEntries.completedClientAt })
      .from(lineupEntries)
      .where(
        and(
          inArray(
            lineupEntries.gameId,
            finals.map((g) => g.id),
          ),
          eq(lineupEntries.role, 'lineup'),
        ),
      );
    for (const e of entries) {
      lineupSize.set(e.gameId, (lineupSize.get(e.gameId) ?? 0) + 1);
      if (e.completedAt === null) open.add(e.gameId);
    }
  }

  // A series counts the moment it's decided (the 4th W or L), as it does in the season's
  // series record; Iron Man waits for the week to finish (series.iron_man is null until then).
  const decided = await tx
    .select({ id: series.id, startDate: series.startDate, result: series.result, wins: series.wins, ironMan: series.ironMan })
    .from(series)
    .where(and(eq(series.userId, user.id), or(isNotNull(series.result), isNotNull(series.closedAt))));
  const seasonRows = await tx.select().from(seasons).where(eq(seasons.userId, user.id));

  const opened = await tx.select({ day: userOpenDays.day }).from(userOpenDays).where(eq(userOpenDays.userId, user.id));
  const openDays: LocalDate[] = [
    ...opened.map((r) => r.day),
    ...finals.filter((g) => g.tasksDone > 0).map((g) => g.playedDate),
    localDateOf(user.createdAt, user.timezone),
  ];

  const [photo] = await tx.select({ userId: userAvatars.userId }).from(userAvatars).where(eq(userAvatars.userId, user.id));
  const planned = await tx
    .selectDistinct({ weekday: dayTemplates.weekday })
    .from(dayTemplates)
    .innerJoin(dayTemplateTasks, eq(dayTemplateTasks.templateId, dayTemplates.id))
    .where(and(eq(dayTemplates.userId, user.id), eq(dayTemplateTasks.role, 'lineup')));

  const stats = achievementStatsFromHistory({
    openDays,
    teamPhoto: photo !== undefined,
    defaultLineupsSet: planned.length,
    games: finals.map((g) => ({
      seriesId: g.seriesId,
      gameNumber: g.gameNumber,
      playedDate: g.playedDate,
      slot: g.slot,
      result: g.result === 'W' || g.result === 'L' ? g.result : null,
      rally: g.resultDetail === 'rally',
      tasksDone: g.tasksDone,
      allDone: (lineupSize.get(g.id) ?? 0) > 0 && !open.has(g.id),
      threshold: g.threshold ?? 0,
      lineupSize: lineupSize.get(g.id) ?? 0,
    })),
    series: decided.map((s) => ({ id: s.id, startDate: s.startDate, result: s.result, wins: s.wins, ironMan: s.ironMan })),
    seasons: seasonRows.map((s) => ({
      wins: s.wins,
      losses: s.losses,
      winGoal: s.winGoal,
      finished: s.status === 'offseason' || s.status === 'complete',
      seriesWon: s.seriesWon,
      seriesLost: s.seriesLost,
    })),
  });
  return { stats };
}
