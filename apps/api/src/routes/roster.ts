import { Weekday } from '@7gs/contracts';
import type { Deps } from '../deps';
import { validationFailed } from '../errors';
import { route, type AnyRoute } from '../http/router';
import { listStarters, putStarter } from '../services/starters';
import {
  activateFromInjuredList,
  createTask,
  listTasks,
  placeOnInjuredList,
  retireTask,
  updateTask,
} from '../services/tasks';
import { inUserTx, userTx } from '../services/today';

function parseWeekday(raw: string): number {
  const parsed = Weekday.safeParse(/^\d+$/.test(raw) ? Number(raw) : Number.NaN);
  if (!parsed.success) throw validationFailed([{ path: 'weekday', message: 'Weekday must be 1 (Monday) to 7 (Sunday).' }]);
  return parsed.data;
}

export function rosterRoutes(deps: Deps): AnyRoute[] {
  const { db } = deps;
  return [
    route('listTasks', async ({ auth }) => ({ tasks: await listTasks(db, auth.user) })),

    route('createTask', ({ auth, body, now }) => createTask(db, auth.user, body, now), { status: 201 }),

    route('updateTask', ({ auth, params, body, now }) =>
      userTx(db, auth.user, (tx, user) => updateTask(tx, user, params.taskId, body, now)),
    ),

    route('retireTask', ({ auth, params, now }) => userTx(db, auth.user, (tx, user) => retireTask(tx, user, params.taskId, now))),

    route('placeOnInjuredList', ({ auth, params, now }) =>
      inUserTx(db, auth.user, now, async (tx, user) => ({ task: await placeOnInjuredList(tx, user, params.taskId, now) })),
    ),

    route('activateFromInjuredList', ({ auth, params, now }) =>
      userTx(db, auth.user, async (tx, user) => ({ task: await activateFromInjuredList(tx, user, params.taskId, now) })),
    ),

    route('listStarters', ({ auth, now }) =>
      userTx(db, auth.user, async (tx, user) => ({ starters: await listStarters(tx, user, now) })),
    ),

    route('putStarter', ({ auth, params, body, now }) => {
      const weekday = parseWeekday(params.weekday);
      return userTx(db, auth.user, (tx, user) => putStarter(tx, user, weekday, body, now));
    }),
  ];
}
