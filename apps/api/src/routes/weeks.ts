import type { Deps } from '../deps';
import { route, type AnyRoute } from '../http/router';
import { inUserTx } from '../services/today';
import { listWeeks, weekCard } from '../services/weekCard';

export function weekRoutes(deps: Deps): AnyRoute[] {
  const { db } = deps;
  return [
    route('listWeeks', ({ auth, now }) => inUserTx(db, auth.user, now, (tx, user) => listWeeks(tx, user, now))),
    route('getWeek', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, (tx, user) => weekCard(tx, user, params.startDate, now)),
    ),
  ];
}
