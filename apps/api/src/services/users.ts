import type { CalendarDto, MeDto, MePatchDto } from '@7gs/contracts';
import { addDays, calendarPosition, isTheme, localDateOf, seasonWindow } from '@7gs/rules';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { seasons, users, type UserRow } from '../db/schema';
import { conflict } from '../errors';
import { uuidv7 } from '../ids';
import { allowancesView } from './allowances';
import { syncSeasons } from './calendar';
import { ensureStarters } from './starters';

const DISPLAY_NAME_MAX = 40;

export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? '';
  return local.slice(0, DISPLAY_NAME_MAX) || 'Home Team';
}

/**
 * First sign-in: `start_date` is the local date in the device's zone, which anchors the
 * season calendar. Also creates the 7 empty starters and the Season 1 row.
 */
export async function findOrCreateUser(
  tx: Db,
  email: string,
  timezone: string,
  now: Date,
): Promise<{ user: UserRow; created: boolean }> {
  const startDate = localDateOf(now, timezone);
  const [created] = await tx
    .insert(users)
    .values({
      id: uuidv7(),
      email,
      displayName: displayNameFromEmail(email),
      timezone,
      startDate,
      defaultLockTime: null,
      finalizedThrough: addDays(startDate, -1),
      createdAt: now,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!created) {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    if (!existing) throw new Error(`User ${email} vanished during sign-in`);
    return { user: existing, created: false };
  }
  await ensureStarters(tx, created, now);
  await syncSeasons(tx, created, startDate, now);
  return { user: created, created: true };
}

export async function meView(tx: Db, user: UserRow, now: Date): Promise<MeDto> {
  const today = localDateOf(now, user.timezone);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    startDate: user.startDate,
    headStartFrom: user.headStartFrom,
    defaultLockTime: user.defaultLockTime,
    theme: isTheme(user.theme) ? user.theme : 'baseball',
    today,
    position: calendarPosition(user, today),
    allowances: await allowancesView(tx, user.id, today),
  };
}

/**
 * Profile edits. A new time zone applies from the next game: games already built keep
 * the zone they started in (GAME_DESIGN §10). A new default lock time applies to games
 * not built yet, like starter edits.
 */
export async function updateMe(tx: Db, user: UserRow, patch: MePatchDto): Promise<UserRow> {
  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.timezone !== undefined) set.timezone = patch.timezone;
  if (patch.defaultLockTime !== undefined) set.defaultLockTime = patch.defaultLockTime;
  if (patch.theme !== undefined) set.theme = patch.theme;
  if (Object.keys(set).length === 0) return user;
  const [row] = await tx.update(users).set(set).where(eq(users.id, user.id)).returning();
  return row ?? user;
}

/**
 * Start playing today instead of waiting for Opening Day (GAME_DESIGN §5). Only during
 * Spring Training. From today through Sunday the user plays real games that count toward
 * Season 1's record; that partial week isn't scored as a series. One-way: once games
 * exist they aren't taken back.
 */
export async function startHeadStart(tx: Db, user: UserRow, now: Date): Promise<UserRow> {
  const today = localDateOf(now, user.timezone);
  if (calendarPosition(user, today).phase !== 'preseason') {
    throw conflict('NOT_ELIGIBLE', 'You can only start early during Spring Training, before Opening Day.', 'NOT_PRESEASON');
  }
  const [row] = await tx.update(users).set({ headStartFrom: today }).where(eq(users.id, user.id)).returning();
  const started = row ?? { ...user, headStartFrom: today };
  // Season 1 now begins today.
  const window = seasonWindow(started, 1);
  await tx
    .update(seasons)
    .set({ startDate: window.start, status: 'active' })
    .where(and(eq(seasons.userId, user.id), eq(seasons.number, 1)));
  return started;
}

export function calendarView(user: UserRow, now: Date): CalendarDto {
  const today = localDateOf(now, user.timezone);
  const position = calendarPosition(user, today);
  return {
    signupDate: user.startDate,
    today,
    position,
    seasons: [seasonWindow(user, position.seasonNumber), seasonWindow(user, position.seasonNumber + 1)],
  };
}
