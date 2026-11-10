// Web Push (notifications to phones and desktop browsers). The VAPID key pair comes from
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set; otherwise it's generated the first time
// it's needed and kept in app_settings, so there's nothing to configure.

import type { Agent } from 'node:https';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import type { Db } from './db/client';
import { appSettings } from './db/schema';

export interface PushMessage {
  title: string;
  body: string;
  /** Path the notification opens, e.g. "/" or "/team/lineups". */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Pusher {
  publicKey(): Promise<string>;
  /** "gone" = the browser dropped the subscription (404/410): forget it. */
  send(target: PushTarget, message: PushMessage): Promise<'sent' | 'gone'>;
}

interface Keys {
  publicKey: string;
  privateKey: string;
}

const SETTING = 'vapid_keys';

async function loadOrCreateKeys(db: Db): Promise<Keys> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTING));
  if (row) return JSON.parse(row.value) as Keys;
  const fresh = webpush.generateVAPIDKeys();
  // Two dynos racing: the first insert wins and both read it back.
  await db.insert(appSettings).values({ key: SETTING, value: JSON.stringify(fresh) }).onConflictDoNothing();
  const [saved] = await db.select().from(appSettings).where(eq(appSettings.key, SETTING));
  if (!saved) throw new Error('Could not save the push keys');
  return JSON.parse(saved.value) as Keys;
}

export function createWebPusher(
  db: Db,
  subject: string,
  env: { publicKey?: string; privateKey?: string; /** Tests: trust a local push service. */ agent?: Agent } = {},
): Pusher {
  let keys: Promise<Keys> | null =
    env.publicKey && env.privateKey ? Promise.resolve({ publicKey: env.publicKey, privateKey: env.privateKey }) : null;
  const getKeys = () => {
    keys ??= loadOrCreateKeys(db).catch((error: unknown) => {
      keys = null;
      throw error;
    });
    return keys;
  };
  return {
    async publicKey() {
      return (await getKeys()).publicKey;
    },
    async send(target, message) {
      const { publicKey, privateKey } = await getKeys();
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(message),
          { vapidDetails: { subject, publicKey, privateKey }, TTL: 4 * 60 * 60, urgency: 'normal', ...(env.agent ? { agent: env.agent } : {}) },
        );
        return 'sent';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';
        throw error;
      }
    },
  };
}

/** For tests and local runs: records what would have been sent. */
export class MemoryPusher implements Pusher {
  readonly sent: { target: PushTarget; message: PushMessage }[] = [];
  readonly gone = new Set<string>();
  async publicKey() {
    return 'BMemoryPushPublicKeyForTests';
  }
  async send(target: PushTarget, message: PushMessage) {
    if (this.gone.has(target.endpoint)) return 'gone' as const;
    this.sent.push({ target, message });
    return 'sent' as const;
  }
}
