// Admin pages (ADMIN_EMAILS). Anyone else gets a plain 404, so the page doesn't reveal
// that it exists. An admin also needs a password, entered on the device within 12 hours.

import type { AdminAccountDto } from '@7gs/contracts';
import { count, desc, eq, max, sql } from 'drizzle-orm';
import type { Deps } from '../deps';
import { sessions, users } from '../db/schema';
import { ApiException, conflict, notFound, validationFailed } from '../errors';
import { RateLimiter } from '../http/rateLimit';
import type { AuthContext } from '../http/session';
import { sha256 } from '../ids';
import { verifyPassword } from '../services/passwords';
import { route, type AnyRoute } from '../http/router';
import { themeOf, isAdmin } from '../services/users';

const UNLOCK_MS = 12 * 60 * 60 * 1000;

export function adminRoutes(deps: Deps): AnyRoute[] {
  // Wrong admin passwords per account.
  const unlockTries = new RateLimiter(5, 15 * 60_000);

  /**
   * The admin pages need an ADMIN_EMAILS account (anyone else: a plain 404) that has a
   * password, unlocked with it on this session within the last 12 hours.
   */
  async function assertUnlocked(auth: AuthContext, path: string, now: Date): Promise<void> {
    if (!isAdmin(auth.user.email)) throw notFound(path);
    if (!auth.user.passwordHash) {
      throw conflict('NOT_ELIGIBLE', 'Set a password in Settings first: the admin pages need one.', 'PASSWORD_NOT_SET');
    }
    const [session] = await deps.db
      .select({ until: sessions.adminUnlockedUntil })
      .from(sessions)
      .where(eq(sessions.idHash, sha256(auth.token)));
    if (!session?.until || session.until.getTime() <= now.getTime()) {
      throw conflict('NOT_ELIGIBLE', 'Enter your password to open the admin pages.', 'ADMIN_LOCKED');
    }
  }

  return [
    route('unlockAdmin', async ({ auth, body, now }) => {
      if (!isAdmin(auth.user.email)) throw notFound('POST /v1/admin/unlock');
      if (!auth.user.passwordHash) {
        throw conflict('NOT_ELIGIBLE', 'Set a password in Settings first: the admin pages need one.', 'PASSWORD_NOT_SET');
      }
      if (!unlockTries.take(auth.user.id, now)) {
        throw new ApiException(429, 'RATE_LIMITED', 'Too many wrong passwords. Wait a few minutes and try again.');
      }
      if (!(await verifyPassword(body.password, auth.user.passwordHash))) {
        throw validationFailed([{ path: 'password', message: 'That password isn’t right.' }], 'That password isn’t right.');
      }
      await deps.db
        .update(sessions)
        .set({ adminUnlockedUntil: new Date(now.getTime() + UNLOCK_MS) })
        .where(eq(sessions.idHash, sha256(auth.token)));
      return { ok: true as const };
    }),

    route('listAccounts', async ({ auth, now }) => {
      await assertUnlocked(auth, 'GET /v1/admin/accounts', now);
      const rows = await deps.db
        .select({
          user: users,
          lastSignInAt: max(sessions.createdAt),
          // Devices still signed in: sessions that haven't expired.
          // The time goes in as text with an explicit type: the Postgres driver can't send a
          // bare Date inside raw SQL (PGlite can, which is why tests alone missed it).
          devices: count(sql`CASE WHEN ${sessions.expiresAt} > ${now.toISOString()}::timestamptz THEN 1 END`),
        })
        .from(users)
        .leftJoin(sessions, eq(sessions.userId, users.id))
        .groupBy(users.id)
        .orderBy(desc(sql`coalesce(${users.lastSeenAt}, ${users.createdAt})`));
      const accounts: AdminAccountDto[] = rows.map(({ user, lastSignInAt, devices }) => ({
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        lastSignInAt: lastSignInAt ? new Date(lastSignInAt).toISOString() : null,
        lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
        devices: Number(devices),
        theme: themeOf(user),
      }));
      return { accounts };
    }),
  ];
}
