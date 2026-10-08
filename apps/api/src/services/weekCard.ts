// GET /v1/weeks and /v1/weeks/:startDate (GAME_DESIGN §4a). Opening a week's card
// creates its series and games and builds every lineup still unbuilt, so all 7 days can
// be planned before the week's first pitch.

import { LocalDate as LocalDateSchema, type ResponseBody, type WeekDto } from '@7gs/contracts';
import { addDays, calendarPosition, isInWeek, localDateOf, plannableWeeks, type LocalDate } from '@7gs/rules';
import type { Db } from '../db/client';
import type { GameRow, UserRow } from '../db/schema';
import { conflict, notFound } from '../errors';
import { ensureSeason, ensureSeries, ensureSeriesGames, findSeriesByStart } from './calendar';
import { iso } from './dto';
import { buildLineupNow, materializeLock } from './lineups';
import { seriesGames } from './standings';
import { gameViews, seriesView } from './views';
import { weekLockOf } from './weeks';

function byPlayOrder(a: GameRow, b: GameRow): number {
  return a.playedDate < b.playedDate ? -1 : a.playedDate > b.playedDate ? 1 : a.slot - b.slot;
}

export async function listWeeks(tx: Db, user: UserRow, now: Date): Promise<ResponseBody<'listWeeks'>> {
  const today = localDateOf(now, user.timezone);
  const weeks = [];
  for (const startDate of plannableWeeks(user.startDate, today)) {
    const row = await findSeriesByStart(tx, user.id, startDate);
    const lock = row ? weekLockOf(await seriesGames(tx, row.id), user, now) : null;
    weeks.push({
      startDate,
      label:
        calendarPosition(user.startDate, today).phase === 'preseason'
          ? ('opening' as const)
          : isInWeek(startDate, today)
            ? ('current' as const)
            : ('next' as const),
      locked: lock !== null,
    });
  }
  return { weeks };
}

/** The series start a card can be opened for, or a 404 / 409. */
export function assertPlannable(user: UserRow, startDate: string, today: LocalDate): LocalDate {
  const parsed = LocalDateSchema.safeParse(startDate);
  if (!parsed.success) throw notFound('Week');
  const pos = calendarPosition(user.startDate, parsed.data);
  if (pos.phase !== 'season' || pos.seriesStart !== parsed.data) throw notFound('Week');
  if (!plannableWeeks(user.startDate, today).includes(parsed.data)) {
    throw conflict(
      'NOT_ELIGIBLE',
      "Only this week's card can be planned, plus next week's from Friday.",
      'WEEK_NOT_PLANNABLE',
    );
  }
  return parsed.data;
}

export async function weekCard(tx: Db, user: UserRow, rawStartDate: string, now: Date): Promise<WeekDto> {
  const today = localDateOf(now, user.timezone);
  const startDate = assertPlannable(user, rawStartDate, today);
  const pos = calendarPosition(user.startDate, startDate);
  if (pos.phase !== 'season') throw notFound('Week');

  const season = await ensureSeason(tx, user, pos.seasonNumber, today, now);
  const seriesRow = await ensureSeries(tx, user, season, pos.seriesNumber, startDate, now);
  await ensureSeriesGames(tx, user, seriesRow, now);

  // Build in play order, so a pending carryover lands on the earliest game.
  for (const game of (await seriesGames(tx, seriesRow.id)).sort(byPlayOrder)) {
    if (game.status === 'final') continue;
    await materializeLock(tx, await buildLineupNow(tx, user, game, now), now);
  }

  const rows = (await seriesGames(tx, seriesRow.id)).sort(byPlayOrder);
  const lock = weekLockOf(rows, user, now);
  return {
    startDate,
    endDate: addDays(startDate, 6),
    lockedAt: iso(lock),
    locked: lock !== null,
    series: await seriesView(tx, user, seriesRow, now),
    games: await gameViews(tx, user, rows, now),
  };
}
