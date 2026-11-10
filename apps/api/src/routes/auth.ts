import type { Context } from 'hono';
import type { Deps } from '../deps';
import { ApiException } from '../errors';
import { clientAddress, RateLimiter } from '../http/rateLimit';
import { route, type AnyRoute } from '../http/router';
import { clearSessionCookie, setSessionCookie } from '../http/session';
import { describeError } from '../logger';
import { createLoginToken, deleteSession, isEmailAllowed, normalizeEmail, verifyLoginToken } from '../services/auth';
import { inUserTx } from '../services/today';
import { meView } from '../services/users';

const WINDOW_MS = 15 * 60_000;

/** The sign-in link: APP_URL in production; the request's own origin in development. */
function signInLink(c: Context, deps: Deps, token: string): string {
  const origin = deps.config.appUrl ?? new URL(c.req.url).origin;
  return `${origin}/sign-in?token=${encodeURIComponent(token)}`;
}

export function authRoutes(deps: Deps): AnyRoute[] {
  // Per address (protects inboxes) and per client (protects the email quota).
  const perEmail = new RateLimiter(5, WINDOW_MS);
  const perClient = new RateLimiter(20, WINDOW_MS);

  return [
    route('requestMagicLink', async ({ c, body, now }) => {
      const email = normalizeEmail(body.email);
      if (deps.config.limitMagicLinks) {
        const client = clientAddress(c.req.header('x-forwarded-for'));
        if (!perClient.take(client, now) || !perEmail.take(email, now)) {
          throw new ApiException(429, 'RATE_LIMITED', 'Too many sign-in links requested. Wait a few minutes and try again.');
        }
      }
      if (!isEmailAllowed(deps.config.allowedEmails, email)) {
        deps.log.info('Sign-in refused: not on the invite list', { email });
        throw new ApiException(
          403,
          'NOT_ELIGIBLE',
          'This 7-Game Series is invite-only, and that email isn’t on the list. Ask whoever runs it to add you.',
          'NOT_INVITED',
        );
      }
      if (!deps.mailer && deps.config.allowDevLogin === false) {
        throw new ApiException(503, 'CONFLICT', 'Sign-in email isn’t set up on this server yet.', 'NO_MAILER');
      }
      const token = await createLoginToken(deps.db, email, now);
      if (deps.mailer) {
        // With ALLOW_DEV_LOGIN on, email is a bonus: "Sign in now" keeps working even if
        // the email fails, so a misconfigured provider never locks everyone out.
        const devLogin = deps.config.allowDevLogin === true;
        try {
          await deps.mailer.sendMagicLink(email, signInLink(c, deps, token));
        } catch (error) {
          deps.log.error('Magic link email failed', { email, error: describeError(error) });
          if (devLogin) return { sent: true as const, devToken: token, emailed: false };
          throw new ApiException(502, 'CONFLICT', 'We couldn’t send the email. Try again in a minute.', 'EMAIL_FAILED');
        }
        return devLogin ? { sent: true as const, devToken: token, emailed: true } : { sent: true as const };
      }
      // No email provider configured (development): hand the token back and log it.
      deps.log.info('Magic link issued (no email provider configured)', { email, devToken: token });
      return { sent: true as const, devToken: token };
    }),

    route('verifyMagicLink', async ({ c, body, now }) => {
      const { user, isNewUser, sessionToken } = await verifyLoginToken(deps.db, body.token, body.timezone, now);
      setSessionCookie(c, sessionToken, deps);
      const me = await inUserTx(deps.db, user, now, (tx, u) => meView(tx, u, now), { scope: 'account' });
      return { me, isNewUser };
    }),

    route('logout', async ({ c, auth }) => {
      await deleteSession(deps.db, auth.token);
      clearSessionCookie(c, deps);
      return { ok: true as const };
    }),
  ];
}
