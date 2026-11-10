import type { Deps } from '../deps';
import { route, type AnyRoute } from '../http/router';
import {
  deliver,
  reminderSettings,
  removePushSubscription,
  savePushSubscription,
  updateReminderPrefs,
} from '../services/reminders';
import { userTx } from '../services/today';

export function reminderRoutes(deps: Deps): AnyRoute[] {
  const { db } = deps;
  return [
    route('getReminders', async ({ auth }) => {
      const key = await deps.pusher.publicKey();
      return userTx(db, auth.user, (tx, user) => reminderSettings(tx, deps, user, key));
    }),

    route('updateReminders', async ({ auth, body }) => {
      const key = await deps.pusher.publicKey();
      return userTx(db, auth.user, async (tx, user) => reminderSettings(tx, deps, await updateReminderPrefs(tx, user, body), key));
    }),

    route('subscribePush', async ({ auth, body, now }) => {
      const key = await deps.pusher.publicKey();
      return userTx(db, auth.user, async (tx, user) => {
        await savePushSubscription(tx, user, body, now);
        return reminderSettings(tx, deps, user, key);
      });
    }),

    route('unsubscribePush', async ({ auth, body }) => {
      const key = await deps.pusher.publicKey();
      return userTx(db, auth.user, async (tx, user) => {
        await removePushSubscription(tx, user, body.endpoint);
        return reminderSettings(tx, deps, user, key);
      });
    }),

    route('sendTestReminder', ({ auth }) =>
      deliver(deps, auth.user, {
        title: 'Reminders are on',
        body: 'This is how 7-Game Series will nudge you: an evening check-in, last call for must-hits, Rally Caps and planning the week.',
        url: '/team/settings',
        tag: 'test',
      }),
    ),
  ];
}
