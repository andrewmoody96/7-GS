import type { Deps } from '../deps';
import { route, type AnyRoute } from '../http/router';
import { clearSessionCookie, setSessionCookie } from '../http/session';
import { createLoginToken, deleteSession, normalizeEmail, verifyLoginToken } from '../services/auth';
import { inUserTx } from '../services/today';
import { meView } from '../services/users';

export function authRoutes(deps: Deps): AnyRoute[] {
  return [
    route('requestMagicLink', async ({ body, now }) => {
      const email = normalizeEmail(body.email);
      const token = await createLoginToken(deps.db, email, now);
      if (deps.mailer) {
        await deps.mailer.sendMagicLink(email, token);
        return { sent: true as const };
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
