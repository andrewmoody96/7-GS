// Email magic links and sessions. Only SHA-256 hashes of login tokens and session ids
// are stored; the raw secrets exist only in the link / cookie.

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { loginTokens, sessions, users, type UserRow } from '../db/schema';
import { unauthorized } from '../errors';
import { randomSecret, sha256 } from '../ids';
import { findOrCreateUser } from './users';

export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
/** Sliding expiry is rewritten at most about once a day. */
const SESSION_SLIDE_AFTER_MS = 86_400_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createLoginToken(db: Db, email: string, now: Date): Promise<string> {
  const token = randomSecret();
  await db.insert(loginTokens).values({
    tokenHash: sha256(token),
    email: normalizeEmail(email),
    createdAt: now,
    expiresAt: new Date(now.getTime() + LOGIN_TOKEN_TTL_MS),
  });
  return token;
}

export async function createSession(tx: Db, userId: string, now: Date): Promise<string> {
  const token = randomSecret();
  await tx.insert(sessions).values({
    idHash: sha256(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

/** Redeem a magic link (single use, 15 minutes) and open a 30-day session. */
export async function verifyLoginToken(
  db: Db,
  token: string,
  timezone: string,
  now: Date,
): Promise<{ user: UserRow; isNewUser: boolean; sessionToken: string }> {
  return db.transaction(async (tx) => {
    const [login] = await tx
      .update(loginTokens)
      .set({ usedAt: now })
      .where(and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
      .returning();
    if (!login) throw unauthorized('This sign-in link is invalid, expired, or already used.');
    const { user, created } = await findOrCreateUser(tx, login.email, timezone, now);
    const sessionToken = await createSession(tx, user.id, now);
    return { user, isNewUser: created, sessionToken };
  });
}

/** Resolve a session token; slides the 30-day expiry forward. */
export async function resolveSession(
  db: Db,
  token: string,
  now: Date,
): Promise<{ user: UserRow; refreshed: boolean } | null> {
  const idHash = sha256(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.idHash, idHash), gt(sessions.expiresAt, now)));
  if (!row) return null;
  const fresh = new Date(now.getTime() + SESSION_TTL_MS);
  const refreshed = fresh.getTime() - row.expiresAt.getTime() >= SESSION_SLIDE_AFTER_MS;
  if (refreshed) await db.update(sessions).set({ expiresAt: fresh }).where(eq(sessions.idHash, idHash));
  return { user: row.user, refreshed };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.idHash, sha256(token)));
}
