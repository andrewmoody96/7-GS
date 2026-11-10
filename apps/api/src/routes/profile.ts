import { localDateOf } from '@7gs/rules';
import type { Deps } from '../deps';
import { validationFailed } from '../errors';
import { route, type AnyRoute } from '../http/router';
import { clearSessionCookie } from '../http/session';
import { deleteAccount, normalizeEmail } from '../services/auth';
import { inUserTx } from '../services/today';
import { prepareDay } from '../services/finalizer';
import { calendarView, meView, startHeadStart, updateMe } from '../services/users';

export function profileRoutes(deps: Deps): AnyRoute[] {
  return [
    route('getMe', ({ auth, now }) =>
      inUserTx(deps.db, auth.user, now, (tx, user) => meView(tx, user, now), { scope: 'account' }),
    ),

    route('updateMe', ({ auth, body, now }) =>
      inUserTx(deps.db, auth.user, now, async (tx, user) => meView(tx, await updateMe(tx, user, body), now), {
        scope: 'account',
      }),
    ),

    route('startHeadStart', ({ auth, now }) =>
      inUserTx(
        deps.db,
        auth.user,
        now,
        async (tx, user) => {
          const started = await startHeadStart(tx, user, now);
          // Today is now a game day: build its game so it's there on the next screen.
          await prepareDay(tx, started, localDateOf(now, started.timezone), now);
          return meView(tx, started, now);
        },
        { scope: 'account' },
      ),
    ),

    route('deleteMe', async ({ c, auth, body }) => {
      if (normalizeEmail(body.confirmEmail) !== auth.user.email) {
        throw validationFailed(
          [{ path: 'confirmEmail', message: 'Type your account’s email exactly to confirm.' }],
          'That email doesn’t match this account.',
        );
      }
      await deleteAccount(deps.db, auth.user);
      clearSessionCookie(c, deps);
      deps.log.info('Account deleted', { userId: auth.user.id });
      return { ok: true as const };
    }),

    route('getCalendar', ({ auth, now }) => calendarView(auth.user, now)),
  ];
}
