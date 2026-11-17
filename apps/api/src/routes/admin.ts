// Admin pages (ADMIN_EMAILS). Anyone else gets a plain 404, so the page doesn't reveal
// that it exists.

import type { AdminAccountDto } from '@7gs/contracts';
import { count, desc, eq, max, sql } from 'drizzle-orm';
import type { Deps } from '../deps';
import { sessions, users } from '../db/schema';
import { notFound } from '../errors';
import { route, type AnyRoute } from '../http/router';
import { themeOf, isAdmin } from '../services/users';

export function adminRoutes(deps: Deps): AnyRoute[] {
  return [
    route('listAccounts', async ({ auth, now }) => {
      if (!isAdmin(auth.user.email)) throw notFound(`GET /v1/admin/accounts`);
      const rows = await deps.db
        .select({
          user: users,
          lastSignInAt: max(sessions.createdAt),
          // Devices still signed in: sessions that haven't expired.
          devices: count(sql`CASE WHEN ${sessions.expiresAt} > ${now} THEN 1 END`),
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
