// Reminders: notifications to every device a user turned them on for (Web Push), and
// optionally email. The finalizer loop calls runReminders every few minutes; each
// reminder goes out at most once (reminder_sends), and only inside its time window, so a
// server that was asleep never sends a stale one.
//
// - evening: at the user's chosen time, only while today's game isn't won yet
// - last_call: from 10:30 p.m., only while a must-hit is still open
// - rally: the morning after an appealable loss, while a Rally Cap is held
// - plan_fri / plan_sun: Friday when next week's card opens; Sunday evening if it's unopened

import type { ReminderPrefsDto, ReminderSettingsDto } from '@7gs/contracts';
import { addDays, calendarPosition, localDateOf, localTimeOf, weekday, type LocalDate } from '@7gs/rules';
import { and, count, eq, gt, inArray, isNotNull, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, pushSubscriptions, rallyRolls, reminderSends, series, users, type UserRow } from '../db/schema';
import type { Deps, EmailMessage } from '../deps';
import { describeError } from '../logger';
import { uuidv7 } from '../ids';
import type { PushMessage } from '../push';
import { allowancesView } from './allowances';
import { gamesOn } from './calendar';
import { evaluateRows, loadEntries } from './lineups';

export interface DueReminder {
  kind: 'evening' | 'last_call' | 'rally' | 'plan_fri' | 'plan_sun';
  /** With `kind`, identifies one send (a date or a game). */
  key: string;
  message: PushMessage;
}

const LAST_CALL_FROM = '22:30';
const DAY_ENDS = '23:55';
const RALLY_WINDOW = ['08:00', '11:45'] as const;
const FRIDAY_WINDOW = ['09:00', '21:00'] as const;
const SUNDAY_WINDOW = ['18:00', '22:00'] as const;

const between = (time: string, from: string, to: string) => time >= from && time < to;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// ── Settings ─────────────────────────────────────────────────────────────────

function prefsOf(user: UserRow): ReminderPrefsDto {
  return {
    evening: user.remindEvening,
    eveningAt: user.remindEveningAt,
    lastCall: user.remindLastCall,
    rally: user.remindRally,
    plan: user.remindPlan,
    email: user.remindEmail,
  };
}

/**
 * `pushKey` comes from deps.pusher.publicKey(), fetched before the transaction: the first
 * call may create the key pair, which mustn't wait on the transaction's own lock.
 */
export async function reminderSettings(tx: Db, deps: Deps, user: UserRow, pushKey: string): Promise<ReminderSettingsDto> {
  const [devices] = await tx.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  return {
    ...prefsOf(user),
    emailAvailable: deps.mailer !== null,
    pushKey,
    devices: devices?.n ?? 0,
  };
}

export async function updateReminderPrefs(tx: Db, user: UserRow, patch: Partial<ReminderPrefsDto>): Promise<UserRow> {
  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.evening !== undefined) set.remindEvening = patch.evening;
  if (patch.eveningAt !== undefined) set.remindEveningAt = patch.eveningAt;
  if (patch.lastCall !== undefined) set.remindLastCall = patch.lastCall;
  if (patch.rally !== undefined) set.remindRally = patch.rally;
  if (patch.plan !== undefined) set.remindPlan = patch.plan;
  if (patch.email !== undefined) set.remindEmail = patch.email;
  if (Object.keys(set).length === 0) return user;
  const [row] = await tx.update(users).set(set).where(eq(users.id, user.id)).returning();
  return row ?? user;
}

/** Save a device's subscription. The same endpoint signing in as someone else moves to them. */
export async function savePushSubscription(
  tx: Db,
  user: UserRow,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  now: Date,
): Promise<void> {
  await tx
    .insert(pushSubscriptions)
    .values({ id: uuidv7(), userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: now })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

export async function removePushSubscription(tx: Db, user: UserRow, endpoint: string): Promise<void> {
  await tx
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
}

// ── What's due ───────────────────────────────────────────────────────────────

export async function dueReminders(tx: Db, user: UserRow, now: Date): Promise<DueReminder[]> {
  const today = localDateOf(now, user.timezone);
  const time = localTimeOf(now, user.timezone);
  const due: DueReminder[] = [];

  if ((user.remindEvening && between(time, user.remindEveningAt, '23:00')) || (user.remindLastCall && between(time, LAST_CALL_FROM, DAY_ENDS))) {
    const open = (await gamesOn(tx, user.id, today)).filter((g) => g.status !== 'final' && g.lineupBuiltAt);
    const entries = open.length > 0 ? await loadEntries(tx, open.map((g) => g.id)) : [];
    for (const game of open) {
      const own = entries.filter((e) => e.gameId === game.id);
      const ev = evaluateRows(game, own);
      const openMusts = own.filter((e) => e.role === 'lineup' && e.required && e.completedClientAt === null);
      const label = `Game ${game.gameNumber}`;

      if (user.remindEvening && between(time, user.remindEveningAt, '23:00') && ev.result !== 'W') {
        const needs: string[] = [];
        if (ev.runsNeeded > 0) needs.push(plural(ev.runsNeeded, 'more run', 'more runs'));
        if (openMusts.length > 0) needs.push(plural(openMusts.length, 'must-hit', 'must-hits'));
        if (ev.tasksNeeded > 0) needs.push(plural(ev.tasksNeeded, 'more task', 'more tasks'));
        due.push({
          kind: 'evening',
          key: `${today}:${game.slot}`,
          message: {
            title: `${label} isn’t won yet`,
            body: needs.length > 0 ? `${listNames(needs)} to win today.` : 'A little more to win today.',
            url: '/',
            tag: `evening-${today}`,
          },
        });
      }
      if (user.remindLastCall && between(time, LAST_CALL_FROM, DAY_ENDS) && openMusts.length > 0) {
        due.push({
          kind: 'last_call',
          key: `${today}:${game.slot}`,
          message: {
            title: 'Last call',
            body: `${listNames(openMusts.map((e) => e.taskName))} ${openMusts.length === 1 ? 'is' : 'are'} still open. Must-hits close at midnight.`,
            url: '/',
            tag: `lastcall-${today}`,
          },
        });
      }
    }
  }

  if (user.remindRally && between(time, RALLY_WINDOW[0], RALLY_WINDOW[1])) {
    const appealable = await tx
      .select()
      .from(games)
      .where(
        and(
          eq(games.userId, user.id),
          eq(games.status, 'final'),
          eq(games.result, 'L'),
          isNotNull(games.rallyDeadline),
          gt(games.rallyDeadline, now),
        ),
      );
    const rolled =
      appealable.length === 0
        ? new Set<string>()
        : new Set(
            (
              await tx
                .select({ gameId: rallyRolls.gameId })
                .from(rallyRolls)
                .where(inArray(rallyRolls.gameId, appealable.map((g) => g.id)))
            ).map((r) => r.gameId),
          );
    const open = appealable.filter((g) => !rolled.has(g.id));
    if (open.length > 0 && (await allowancesView(tx, user.id, today)).rallyTokens > 0) {
      for (const game of open) {
        due.push({
          kind: 'rally',
          key: game.id,
          message: {
            title: 'Rally Cap available',
            body: `Game ${game.gameNumber} went down as an L, but you can still appeal it. Roll a Rally Cap before noon.`,
            url: '/',
            tag: `rally-${game.id}`,
          },
        });
      }
    }
  }

  if (user.remindPlan) {
    const day = weekday(today);
    if (day === 5 && between(time, FRIDAY_WINDOW[0], FRIDAY_WINDOW[1])) {
      const nextMonday = addDays(today, 3);
      if (calendarPosition(user, nextMonday).phase === 'season') {
        due.push({
          kind: 'plan_fri',
          key: nextMonday,
          message: {
            title: 'Next week’s lineups are open',
            body: 'Plan the week while it’s free: set each day’s lineup, must-hits and runs to win before Monday’s first pitch.',
            url: '/team/lineups',
            tag: `plan-${nextMonday}`,
          },
        });
      }
    }
    if (day === 7 && between(time, SUNDAY_WINDOW[0], SUNDAY_WINDOW[1])) {
      const nextMonday = addDays(today, 1);
      if (calendarPosition(user, nextMonday).phase === 'season' && !(await weekOpened(tx, user, nextMonday))) {
        due.push({
          kind: 'plan_sun',
          key: nextMonday,
          message: {
            title: 'Tomorrow starts a new series',
            body: 'You haven’t looked at next week’s lineups yet. Take a minute to plan it tonight.',
            url: '/team/lineups',
            tag: `plan-${nextMonday}`,
          },
        });
      }
    }
  }
  return due;
}

/** Whether next week's card has been opened (opening it builds the week's lineups). */
async function weekOpened(tx: Db, user: UserRow, startDate: LocalDate): Promise<boolean> {
  const [row] = await tx
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.userId, user.id), eq(series.startDate, startDate)));
  if (!row) return false;
  const [built] = await tx
    .select({ n: count() })
    .from(games)
    .where(and(eq(games.seriesId, row.id), isNotNull(games.lineupBuiltAt)));
  return (built?.n ?? 0) > 1;
}

// ── Sending ──────────────────────────────────────────────────────────────────

function emailFor(message: PushMessage, appUrl: string | null): EmailMessage {
  const link = appUrl ? `${appUrl}${message.url}` : null;
  const text = `${message.body}${link ? `\n\nOpen 7-Game Series: ${link}` : ''}\n\nTurn these off any time in Team → Settings → Reminders.`;
  const html = `<p style="font:16px/1.5 system-ui,sans-serif">${message.body}</p>${
    link ? `<p style="font:16px/1.5 system-ui,sans-serif"><a href="${link}">Open 7-Game Series</a></p>` : ''
  }<p style="font:13px/1.5 system-ui,sans-serif;color:#666">Turn these off any time in Team → Settings → Reminders.</p>`;
  return { subject: message.title, text, html };
}

/** Push to every device (forgetting ones the browser dropped) and email if it's on. */
export async function deliver(deps: Deps, user: UserRow, message: PushMessage): Promise<{ devices: number; email: boolean }> {
  const subs = await deps.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  let devices = 0;
  for (const sub of subs) {
    try {
      const result = await deps.pusher.send(sub, message);
      if (result === 'gone') await deps.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      else devices++;
    } catch (error) {
      deps.log.error('reminders: push failed', { userId: user.id, error: describeError(error) });
    }
  }
  let email = false;
  if (user.remindEmail && deps.mailer) {
    try {
      await deps.mailer.sendMessage(user.email, emailFor(message, deps.config.appUrl ?? null));
      email = true;
    } catch (error) {
      deps.log.error('reminders: email failed', { userId: user.id, error: describeError(error) });
    }
  }
  return { devices, email };
}

export interface ReminderReport {
  usersChecked: number;
  sent: number;
}

/** Send every reminder that's due as of `now`. Safe to run as often as you like. */
export async function runReminders(deps: Deps, now: Date): Promise<ReminderReport> {
  const withDevice = deps.db.select({ id: pushSubscriptions.userId }).from(pushSubscriptions);
  // Anyone with a device, plus (when email works) anyone who turned email on.
  const candidates = await deps.db
    .select()
    .from(users)
    .where(deps.mailer ? or(inArray(users.id, withDevice), eq(users.remindEmail, true)) : inArray(users.id, withDevice));
  const report: ReminderReport = { usersChecked: 0, sent: 0 };
  for (const user of candidates) {
    report.usersChecked++;
    try {
      for (const reminder of await dueReminders(deps.db, user, now)) {
        // Claim it first: at most once, even if two runs overlap.
        const claimed = await deps.db
          .insert(reminderSends)
          .values({ userId: user.id, kind: reminder.kind, key: reminder.key, sentAt: now })
          .onConflictDoNothing()
          .returning({ key: reminderSends.key });
        if (claimed.length === 0) continue;
        await deliver(deps, user, reminder.message);
        report.sent++;
      }
    } catch (error) {
      deps.log.error('reminders: user failed', { userId: user.id, error: describeError(error) });
    }
  }
  return report;
}
