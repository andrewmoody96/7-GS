import type { Deps } from '../deps';
import { route, type AnyRoute } from '../http/router';
import { inUserTx } from '../services/today';
import { calendarView, meView, updateMe } from '../services/users';

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

    route('getCalendar', ({ auth, now }) => calendarView(auth.user, now)),
  ];
}
