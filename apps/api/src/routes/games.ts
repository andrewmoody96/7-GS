import type { Deps } from '../deps';
import { validationFailed } from '../errors';
import { route, type AnyRoute } from '../http/router';
import { toRallyRollDto } from '../services/dto';
import {
  completeEntry,
  lockGame,
  patchLineup,
  setPartial,
  substitute,
  uncompleteEntry,
} from '../services/games';
import { loadUserGame } from '../services/lineups';
import { callRainout, rainoutQuote } from '../services/rainouts';
import { rallyQuote, rollRally } from '../services/rally';
import { inUserTx, todayView } from '../services/today';
import { gameView, seriesView } from '../services/views';

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{8,200}$/;

export function gameRoutes(deps: Deps): AnyRoute[] {
  const { db } = deps;
  return [
    route('getToday', ({ auth, now }) => inUserTx(db, auth.user, now, (tx, user) => todayView(tx, user, now))),

    route('getGame', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => gameView(tx, user, await loadUserGame(tx, user.id, params.gameId), now)),
    ),

    route('patchLineup', ({ auth, params, body, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        gameView(tx, user, await patchLineup(tx, user, params.gameId, body, now), now),
      ),
    ),

    route('lockGame', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => gameView(tx, user, await lockGame(tx, user, params.gameId, now), now)),
    ),

    route('completeEntry', ({ auth, params, body, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        gameView(tx, user, await completeEntry(tx, user, params.gameId, params.entryId, new Date(body.clientAt), now), now),
      ),
    ),

    route('uncompleteEntry', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        gameView(tx, user, await uncompleteEntry(tx, user, params.gameId, params.entryId, now), now),
      ),
    ),

    route('patchEntry', ({ auth, params, body, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        gameView(tx, user, await setPartial(tx, user, params.gameId, params.entryId, body.partial, now), now),
      ),
    ),

    route('substitute', ({ auth, params, body, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        gameView(tx, user, await substitute(tx, user, params.gameId, body.outEntryId, body.inEntryId, now), now),
      ),
    ),

    route('getRainoutQuote', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, (tx, user) => rainoutQuote(tx, user, params.gameId, now)),
    ),

    route('callRainout', ({ auth, params, body, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) =>
        seriesView(tx, user, await callRainout(tx, user, params.gameId, body.makeupDate, now), now),
      ),
    ),

    route('getRallyQuote', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, (tx, user) => rallyQuote(tx, user, params.gameId, now)),
    ),

    route('rollRally', ({ c, auth, params, now }) => {
      const key = c.req.header('idempotency-key')?.trim() ?? '';
      if (!IDEMPOTENCY_KEY_RE.test(key)) {
        throw validationFailed([
          { path: 'Idempotency-Key', message: 'Send an Idempotency-Key header (8–200 printable characters).' },
        ]);
      }
      return inUserTx(db, auth.user, now, async (tx, user) => {
        const { roll, game } = await rollRally(tx, user, params.gameId, key, deps.rollDice, now);
        return { roll: toRallyRollDto(roll), game: await gameView(tx, user, game, now) };
      });
    }),
  ];
}
