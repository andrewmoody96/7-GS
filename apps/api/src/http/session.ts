// Session transport: httpOnly `7gs_session` cookie (30 days, sliding, SameSite=Lax), or
// `Authorization: Bearer <session>` for tests and tools.

import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { users, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { unauthorized } from '../errors';
import { isEmailAllowed, resolveSession, SESSION_TTL_MS } from '../services/auth';

export const SESSION_COOKIE = '7gs_session';

export interface AuthContext {
  user: UserRow;
  /** The raw session token, for logout. */
  token: string;
  via: 'cookie' | 'bearer';
}

export function setSessionCookie(c: Context, token: string, deps: Deps): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: deps.config.cookieSecure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context, deps: Deps): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: deps.config.cookieSecure, httpOnly: true, sameSite: 'Lax' });
}

function readToken(c: Context): { token: string; via: AuthContext['via'] } | null {
  const header = c.req.header('authorization');
  if (header) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return match?.[1] ? { token: match[1], via: 'bearer' } : null;
  }
  const cookie = getCookie(c, SESSION_COOKIE);
  return cookie ? { token: cookie, via: 'cookie' } : null;
}

export async function authenticate(c: Context, deps: Deps, now: Date): Promise<AuthContext> {
  const found = readToken(c);
  if (!found) throw unauthorized();
  const session = await resolveSession(deps.db, found.token, now);
  if (!session) throw unauthorized('Your session has expired. Sign in again.');
  // Taking someone off the invite list ends their access on their next request.
  if (!isEmailAllowed(deps.config.allowedEmails, session.user.email)) {
    throw unauthorized('This account isn’t on the invite list anymore.');
  }
  await touchLastSeen(deps, session.user, now);
  // Sliding expiry: re-issue the cookie with a fresh Max-Age when the session moved.
  if (session.refreshed && found.via === 'cookie') setSessionCookie(c, found.token, deps);
  return { user: session.user, token: found.token, via: found.via };
}

/** How stale `users.last_seen_at` may get before a request updates it. */
const LAST_SEEN_PRECISION_MS = 60 * 60 * 1000;

/**
 * Record that the account used the app, at most once an hour, so it costs next to
 * nothing. Never fails the request: it's bookkeeping for the admin page.
 */
async function touchLastSeen(deps: Deps, user: UserRow, now: Date): Promise<void> {
  if (user.lastSeenAt && now.getTime() - user.lastSeenAt.getTime() < LAST_SEEN_PRECISION_MS) return;
  try {
    await deps.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));
  } catch (error) {
    deps.log.warn('Could not record last seen', { userId: user.id, error: String(error) });
  }
}
