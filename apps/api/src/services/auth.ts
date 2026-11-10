// Email magic links and sessions. Only SHA-256 hashes of login tokens and session ids
// are stored; the raw secrets exist only in the link / cookie.

import { randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
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

/** Whether the invite list (if any) lets this address in. */
export function isEmailAllowed(allowed: readonly string[] | null | undefined, email: string): boolean {
  if (!allowed || allowed.length === 0) return true;
  const address = normalizeEmail(email);
  const domain = address.slice(address.lastIndexOf('@'));
  return allowed.includes(address) || allowed.includes(domain);
}

/** Delete the user and, by cascade, everything they own (sessions included). */
export async function deleteAccount(db: Db, user: UserRow): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(loginTokens).where(eq(loginTokens.email, user.email));
    await tx.delete(users).where(eq(users.id, user.id));
  });
}

/** Wrong guesses before a sign-in code stops working (a new email is then needed). */
export const CODE_MAX_ATTEMPTS = 5;

function codeHashOf(email: string, code: string): string {
  return sha256(`${normalizeEmail(email)}:${code}`);
}

/** A sign-in link token and its 6-digit code. Only hashes are stored. */
export async function createLoginToken(db: Db, email: string, now: Date): Promise<{ token: string; code: string }> {
  const token = randomSecret();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.insert(loginTokens).values({
    tokenHash: sha256(token),
    email: normalizeEmail(email),
    createdAt: now,
    expiresAt: new Date(now.getTime() + LOGIN_TOKEN_TTL_MS),
    codeHash: codeHashOf(email, code),
  });
  return { token, code };
}

/**
 * Sign in with the code from the newest sign-in email for `email` (single use, 15
 * minutes). Each wrong guess counts; after CODE_MAX_ATTEMPTS the code is spent.
 */
export async function verifyLoginCode(
  db: Db,
  email: string,
  code: string,
  timezone: string,
  now: Date,
): Promise<{ user: UserRow; isNewUser: boolean; sessionToken: string }> {
  const address = normalizeEmail(email);
  // The guess is recorded even when it's wrong, so the transaction returns instead of throwing.
  const outcome = await db.transaction(async (tx) => {
    const [login] = await tx
      .select()
      .from(loginTokens)
      .where(and(eq(loginTokens.email, address), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
      .orderBy(desc(loginTokens.createdAt))
      .limit(1)
      .for('update');
    if (!login?.codeHash) return { ok: false as const, left: 0 };
    const expected = Buffer.from(login.codeHash, 'hex');
    const given = Buffer.from(codeHashOf(address, code), 'hex');
    if (!timingSafeEqual(expected, given)) {
      const attempts = login.codeAttempts + 1;
      await tx
        .update(loginTokens)
        .set({ codeAttempts: attempts, ...(attempts >= CODE_MAX_ATTEMPTS ? { usedAt: now } : {}) })
        .where(eq(loginTokens.tokenHash, login.tokenHash));
      return { ok: false as const, left: Math.max(0, CODE_MAX_ATTEMPTS - attempts) };
    }
    await tx.update(loginTokens).set({ usedAt: now }).where(eq(loginTokens.tokenHash, login.tokenHash));
    const { user, created } = await findOrCreateUser(tx, address, timezone, now);
    const sessionToken = await createSession(tx, user.id, now);
    return { ok: true as const, user, isNewUser: created, sessionToken };
  });
  if (!outcome.ok) {
    throw unauthorized(
      outcome.left > 0
        ? `That code isn’t right. ${outcome.left} ${outcome.left === 1 ? 'try' : 'tries'} left.`
        : 'That code has expired or been used up. Ask for a new email.',
    );
  }
  return { user: outcome.user, isNewUser: outcome.isNewUser, sessionToken: outcome.sessionToken };
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
