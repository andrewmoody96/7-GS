import type { Deps } from '../deps';
import { route, type AnyRoute } from '../http/router';
import { currentSeason, currentSeries, loadUserSeason, loadUserSeries, setWinGoal } from '../services/seasons';
import { inUserTx } from '../services/today';
import { seasonView, seriesView } from '../services/views';

export function seasonRoutes(deps: Deps): AnyRoute[] {
  const { db } = deps;
  return [
    route('getCurrentSeries', ({ auth, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => {
        const row = await currentSeries(tx, user, now);
        return row ? seriesView(tx, user, row, now) : null;
      }),
    ),

    route('getSeries', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        seriesView(tx, user, await loadUserSeries(tx, user.id, params.seriesId), now),
      ),
    ),

    route('getCurrentSeason', ({ auth, now }) =>
      inUserTx(
        db,
        auth.user,
        now,
        async (tx, user) => {
          const row = await currentSeason(tx, user, now);
          return row ? seasonView(tx, row) : null;
        },
        { scope: 'account' },
      ),
    ),

    route('getSeason', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => seasonView(tx, await loadUserSeason(tx, user.id, params.seasonId)), {
        scope: 'account',
      }),
    ),

    route('updateSeason', ({ auth, params, body, now }) =>
      inUserTx(
        db,
        auth.user,
        now,
        async (tx, user) => seasonView(tx, await setWinGoal(tx, user, params.seasonId, body.winGoal, now)),
        { scope: 'account' },
      ),
    ),
  ];
}
