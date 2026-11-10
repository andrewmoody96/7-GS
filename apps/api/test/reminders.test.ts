import type { GameDto } from '@7gs/contracts';
import { createECDH, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { Agent, createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { Mailer } from '../src/deps';
import { reminderSends } from '../src/db/schema';
import { createWebPusher, MemoryPusher } from '../src/push';
import { CHICAGO, createTasks, TestApp, useTestDb } from './helpers';

const env = useTestDb();

const SUB = { endpoint: 'https://push.example.com/device-1', keys: { p256dh: 'BKey', auth: 'auth' } };

// Chicago, sign-up Friday 2026-10-02; Opening Day Monday 2026-10-05. Every day: Gym (2,
// must-hit) and Read; runs to win 3.
async function setup() {
  const pusher = new MemoryPusher();
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z', { pusher });
  const { token } = await t.signIn('remind@example.com', CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        threshold: 3,
        minTasks: null,
        lockTime: null,
        lineup: [
          { taskId: ids.Gym!, position: 1, required: true },
          { taskId: ids.Read!, position: 2, required: false },
        ],
        bench: [],
      },
    });
  }
  return { t, token, pusher };
}

function entry(game: GameDto, name: string) {
  const found = game.entries.find((e) => e.taskName === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found;
}

const kinds = (pusher: MemoryPusher) => pusher.sent.map((s) => s.message.tag.split('-')[0]);

describe('reminder settings', () => {
  it('starts with everything on but email, and counts devices', async () => {
    const { t, token } = await setup();
    expect(await t.ok('getReminders', { token })).toEqual({
      evening: true,
      eveningAt: '20:00',
      lastCall: true,
      rally: true,
      plan: true,
      email: false,
      emailAvailable: false,
      pushKey: 'BMemoryPushPublicKeyForTests',
      devices: 0,
    });
    expect((await t.ok('subscribePush', { token, body: SUB })).devices).toBe(1);
    expect((await t.ok('subscribePush', { token, body: SUB })).devices).toBe(1);
    const updated = await t.ok('updateReminders', { token, body: { eveningAt: '19:30', plan: false } });
    expect(updated).toMatchObject({ eveningAt: '19:30', plan: false, evening: true });
    expect((await t.ok('unsubscribePush', { token, body: { endpoint: SUB.endpoint } })).devices).toBe(0);
  });
});

describe('sending reminders', () => {
  it('sends nothing without a device or email', async () => {
    const { t, token, pusher } = await setup();
    t.at('2026-10-05', '20:30', CHICAGO);
    await t.ok('getToday', { token });
    expect(await t.reminders()).toEqual({ usersChecked: 0, sent: 0 });
    expect(pusher.sent).toHaveLength(0);
  });

  it('checks in once in the evening while the game is not won, then gives last call for open must-hits', async () => {
    const { t, token, pusher } = await setup();
    await t.ok('subscribePush', { token, body: SUB });
    t.at('2026-10-05', '19:00', CHICAGO);
    await t.ok('getToday', { token });
    await t.reminders();
    expect(pusher.sent).toHaveLength(0);

    t.at('2026-10-05', '20:05', CHICAGO);
    await t.reminders();
    await t.reminders(); // never twice
    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0]!.message).toMatchObject({
      title: 'Game 1 isn’t won yet',
      body: '3 more runs and 1 must-hit to win today.',
      url: '/',
    });

    // Read done, Gym (the must-hit) still open at 10:35 p.m.
    const game = (await t.ok('getToday', { token })).games[0]!;
    await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: entry(game, 'Read').id },
      body: { clientAt: t.clock.now().toISOString() },
    });
    t.at('2026-10-05', '22:35', CHICAGO);
    await t.reminders();
    expect(pusher.sent).toHaveLength(2);
    expect(pusher.sent[1]!.message).toMatchObject({ title: 'Last call', body: 'Gym is still open. Must-hits close at midnight.' });
  });

  it('stays quiet once the game is won', async () => {
    const { t, token, pusher } = await setup();
    await t.ok('subscribePush', { token, body: SUB });
    t.at('2026-10-05', '18:00', CHICAGO);
    const game = (await t.ok('getToday', { token })).games[0]!;
    for (const name of ['Gym', 'Read']) {
      await t.ok('completeEntry', {
        token,
        params: { gameId: game.id, entryId: entry(game, name).id },
        body: { clientAt: t.clock.now().toISOString() },
      });
    }
    for (const time of ['20:05', '22:35']) {
      t.at('2026-10-05', time, CHICAGO);
      await t.reminders();
    }
    expect(pusher.sent).toHaveLength(0);
  });

  it('offers a Rally Cap the morning after an appealable loss', async () => {
    const { t, token, pusher } = await setup();
    await t.ok('subscribePush', { token, body: SUB });
    await t.ok('updateReminders', { token, body: { evening: false, lastCall: false } });
    t.at('2026-10-05', '09:00', CHICAGO);
    const game = (await t.ok('getToday', { token })).games[0]!;
    // Read done, Gym missed: a forfeit, which a Rally Cap can appeal.
    await t.ok('completeEntry', {
      token,
      params: { gameId: game.id, entryId: entry(game, 'Read').id },
      body: { clientAt: t.clock.now().toISOString() },
    });
    t.at('2026-10-06', '08:30', CHICAGO);
    await t.finalize();
    await t.reminders();
    expect(kinds(pusher)).toEqual(['rally']);
    expect(pusher.sent[0]!.message.body).toContain('Roll a Rally Cap before noon');

    // The same reminder in the hockey theme: only the words change.
    await t.ok('updateMe', { token, body: { theme: 'hockey' } });
    t.at('2026-10-06', '08:45', CHICAGO);
    await env.db.delete(reminderSends);
    await t.reminders();
    expect(pusher.sent[1]!.message).toMatchObject({ title: 'Coach’s challenge available' });
    expect(pusher.sent[1]!.message.body).toContain('Use a coach’s challenge before noon');
    // Not after the window.
    t.at('2026-10-06', '12:30', CHICAGO);
    await env.db.delete(reminderSends);
    await t.reminders();
    expect(pusher.sent).toHaveLength(2);
  });

  it('nudges to plan next week on Friday, and on Sunday only if the card is unopened', async () => {
    const { t, token, pusher } = await setup();
    await t.ok('subscribePush', { token, body: SUB });
    await t.ok('updateReminders', { token, body: { evening: false, lastCall: false, rally: false } });
    t.at('2026-10-09', '09:30', CHICAGO);
    await t.reminders();
    expect(pusher.sent.map((s) => s.message.title)).toEqual(['Next week’s lineups are open']);
    expect(pusher.sent[0]!.message.url).toBe('/team/lineups');

    t.at('2026-10-11', '18:30', CHICAGO);
    await t.ok('getWeek', { token, params: { startDate: '2026-10-12' } }).catch(() => undefined);
    await t.reminders();
    // Opening the card on Sunday (it opens from Friday) means no Sunday nudge.
    expect(pusher.sent).toHaveLength(1);
  });

  it('sends the Sunday nudge when next week was never opened', async () => {
    const { t, token, pusher } = await setup();
    await t.ok('subscribePush', { token, body: SUB });
    await t.ok('updateReminders', { token, body: { evening: false, lastCall: false, rally: false } });
    t.at('2026-10-11', '18:30', CHICAGO);
    await t.reminders();
    expect(pusher.sent.map((s) => s.message.title)).toEqual(['Tomorrow starts a new series']);
  });

  it('forgets a device the browser dropped', async () => {
    const { t, token, pusher } = await setup();
    await t.ok('subscribePush', { token, body: SUB });
    pusher.gone.add(SUB.endpoint);
    expect(await t.ok('sendTestReminder', { token })).toEqual({ devices: 0, email: false });
    expect((await t.ok('getReminders', { token })).devices).toBe(0);
  });

  it('emails reminders when email is on and a provider is set up', async () => {
    const mailed: { email: string; subject: string }[] = [];
    const mailer: Mailer = {
      async sendMagicLink() {},
      async sendMessage(email, message) {
        mailed.push({ email, subject: message.subject });
      },
    };
    const { t, token, pusher } = await setup();
    // Sign-in above used the no-email shortcut; switch email on for the reminders.
    (t.deps as { mailer: Mailer | null }).mailer = mailer;
    expect((await t.ok('getReminders', { token })).emailAvailable).toBe(true);
    await t.ok('updateReminders', { token, body: { email: true } });
    t.at('2026-10-05', '20:05', CHICAGO);
    await t.ok('getToday', { token });
    await t.reminders();
    expect(pusher.sent).toHaveLength(0);
    expect(mailed).toEqual([{ email: 'remind@example.com', subject: 'Game 1 isn’t won yet' }]);
  });
});

describe('push keys', () => {
  it('generates the key pair once and keeps it in the database', async () => {
    const first = await createWebPusher(env.db, 'https://example.com').publicKey();
    const again = await createWebPusher(env.db, 'https://example.com').publicKey();
    expect(first).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(again).toBe(first);
  });
});

describe('the real push sender', () => {
  it('delivers an encrypted, VAPID-signed message to a push service, and reports a dropped device', async () => {
    const received: { auth: string | undefined; encoding: string | undefined; ttl: string | undefined; bytes: number }[] = [];
    let status = 201;
    // A throwaway certificate: real push services are HTTPS only.
    const dir = mkdtempSync(join(tmpdir(), 'push-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
    const tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
    const server = createServer(tls, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        received.push({
          auth: req.headers.authorization,
          encoding: req.headers['content-encoding'] as string | undefined,
          ttl: req.headers.ttl as string | undefined,
          bytes: Buffer.concat(chunks).length,
        });
        res.writeHead(status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      // A browser's subscription keys: a P-256 public key and a 16-byte auth secret.
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      const target = {
        endpoint: `https://127.0.0.1:${port}/push/abc`,
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      };
      const pusher = createWebPusher(env.db, 'https://example.com', { agent: new Agent({ ca: tls.cert }) });
      const message = { title: 'Hi', body: 'There', url: '/', tag: 't' };
      expect(await pusher.send(target, message)).toBe('sent');
      expect(received[0]).toMatchObject({ encoding: 'aes128gcm', ttl: '14400' });
      expect(received[0]!.auth).toMatch(/^vapid t=.+, k=.+/);
      expect(received[0]!.bytes).toBeGreaterThan(100);
      status = 410;
      expect(await pusher.send(target, message)).toBe('gone');
    } finally {
      server.close();
    }
  });
});
