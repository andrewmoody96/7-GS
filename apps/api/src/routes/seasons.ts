import type { Deps } from '../deps';
import { route, type AnyRoute } from '../http/router';
import { currentSeason, currentSeries, loadUserSeason, loadUserSeries, setWinGoal } from '../services/seasons';
import { career, listSeasonSeries, listSeasons } from '../services/history';
import { inUserTx } from '../services/today';
import { themeOf } from '../services/users';
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
          return row ? seasonView(tx, row, themeOf(user)) : null;
        },
        { scope: 'account' },
      ),
    ),

    route('getSeason', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => seasonView(tx, await loadUserSeason(tx, user.id, params.seasonId), themeOf(user)), {
        scope: 'account',
      }),
    ),

    route('updateSeason', ({ auth, params, body, now }) =>
      inUserTx(
        db,
        auth.user,
        now,
        async (tx, user) => seasonView(tx, await setWinGoal(tx, user, params.seasonId, body.winGoal, now), themeOf(user)),
        { scope: 'account' },
      ),
    ),

    route('listSeasons', ({ auth, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => ({ seasons: await listSeasons(tx, user) }), { scope: 'account' }),
    ),

    route('listSeasonSeries', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => ({ series: await listSeasonSeries(tx, user, params.seasonId) }), {
        scope: 'account',
      }),
    ),

    route('getCareer', ({ auth, now }) => inUserTx(db, auth.user, now, (tx, user) => career(tx, user), { scope: 'account' })),
  ];
}
