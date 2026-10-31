// The invite list (ALLOWED_EMAILS) and deleting an account.

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseAllowedEmails } from '../src/config';
import type { AppConfig } from '../src/deps';
import { isEmailAllowed } from '../src/services/auth';
import { CHICAGO, createTasks, rowsOf, TestApp, useTestDb } from './helpers';

const env = useTestDb();
const base: AppConfig = { cookieSecure: false, validateResponses: true };

/** Tables with a user_id column; lineup_entries and day_template_tasks hang off games/templates. */
const USER_TABLES = [
  'sessions',
  'seasons',
  'series',
  'task_definitions',
  'day_templates',
  'games',
  'rally_tokens',
  'rally_rolls',
  'rainout_allowances',
  'il_holds',
];

async function countFor(t: TestApp, userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const [row] = rowsOf<{ n: number }>(
      await t.db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}" WHERE user_id = '${userId}'`)),
    );
    out[table] = row?.n ?? -1;
  }
  const [entries] = rowsOf<{ n: number }>(
    await t.db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM lineup_entries e JOIN games g ON g.id = e.game_id WHERE g.user_id = '${userId}'`),
    ),
  );
  out.lineup_entries = entries?.n ?? -1;
  return out;
}

/** A player with a roster, a full rotation and two played games. */
async function veteran(t: TestApp, email: string) {
  t.at('2026-10-02', '12:00', CHICAGO);
  const { token, userId } = await t.signIn(email, CHICAGO);
  const ids = await createTasks(t, token, [{ name: 'Gym', points: 2 }, { name: 'Read' }]);
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    await t.ok('putStarter', {
      token,
      params: { weekday },
      body: {
        name: `Day ${weekday}`,
        threshold: 2,
        minTasks: null,
        lockTime: null,
        lineup: [{ taskId: ids.Gym!, position: 1, required: true }],
        bench: [{ taskId: ids.Read!, position: 1 }],
      },
    });
  }
  for (const date of ['2026-10-05', '2026-10-06']) {
    t.at(date, '20:00', CHICAGO);
    const [game] = (await t.ok('getToday', { token })).games;
    const gym = game!.entries.find((e) => e.taskName === 'Gym')!;
    await t.ok('completeEntry', {
      token,
      params: { gameId: game!.id, entryId: gym.id },
      body: { clientAt: t.clock.now().toISOString() },
    });
  }
  t.at('2026-10-07', '00:45', CHICAGO);
  await t.finalize();
  return { token, userId };
}

describe('invite list', () => {
  it('parses addresses and domains, case-insensitively', () => {
    expect(parseAllowedEmails(undefined)).toBeNull();
    expect(parseAllowedEmails('  ')).toBeNull();
    const list = parseAllowedEmails(' Me@Example.com, @Family.org\nfriend@x.io ');
    expect(list).toEqual(['me@example.com', '@family.org', 'friend@x.io']);
    expect(isEmailAllowed(list, 'ME@example.com')).toBe(true);
    expect(isEmailAllowed(list, 'cousin@family.org')).toBe(true);
    expect(isEmailAllowed(list, 'cousin@notfamily.org')).toBe(false);
    expect(isEmailAllowed(list, 'someone@example.com')).toBe(false);
    expect(isEmailAllowed(null, 'anyone@anywhere.com')).toBe(true);
  });

  it('only sends sign-in links to invited addresses', async () => {
    const t = new TestApp(env.db, '2026-10-02T17:00:00Z', {
      config: { ...base, allowedEmails: ['me@example.com', '@family.org'] },
    });
    const refused = await t.fails('requestMagicLink', { body: { email: 'stranger@example.com' } }, 403);
    expect(refused).toMatchObject({ code: 'NOT_ELIGIBLE', reason: 'NOT_INVITED' });
    expect(refused.message).toMatch(/invite-only/);
    expect((await t.ok('requestMagicLink', { body: { email: 'Me@Example.com' } })).devToken).toEqual(expect.any(String));
    expect((await t.ok('requestMagicLink', { body: { email: 'kid@family.org' } })).devToken).toEqual(expect.any(String));
  });

  it('ends access for someone taken off the list', async () => {
    const open = new TestApp(env.db, '2026-10-02T17:00:00Z');
    const { token } = await open.signIn('friend@example.com', CHICAGO);
    const closed = new TestApp(env.db, '2026-10-02T17:00:00Z', { config: { ...base, allowedEmails: ['me@example.com'] } });
    const error = await closed.fails('getMe', { token }, 401);
    expect(error.message).toMatch(/invite list/);
    // Back on the list, the same session works again.
    const reopened = new TestApp(env.db, '2026-10-02T17:00:00Z', { config: { ...base, allowedEmails: ['@example.com'] } });
    expect((await reopened.ok('getMe', { token })).email).toBe('friend@example.com');
  });
});

describe('deleting an account', () => {
  it('needs the account’s email typed to confirm', async () => {
    const t = new TestApp(env.db, '2026-10-02T17:00:00Z');
    const { token } = await t.signIn('pat@example.com', CHICAGO);
    const error = await t.fails('deleteMe', { token, body: { confirmEmail: 'someone@example.com' } }, 400);
    expect(error.issues).toEqual([{ path: 'confirmEmail', message: expect.stringMatching(/exactly/) }]);
    await t.fails('deleteMe', { body: { confirmEmail: 'pat@example.com' } }, 401);
    expect((await t.ok('getMe', { token })).email).toBe('pat@example.com');
  });

  it('removes every row the user owns, ends their sessions, and leaves others alone', async () => {
    const t = new TestApp(env.db, '2026-10-02T17:00:00Z');
    const pat = await veteran(t, 'pat@example.com');
    const sam = await veteran(t, 'sam@example.com');
    const before = await countFor(t, pat.userId);
    expect(before.games).toBeGreaterThan(0);
    expect(before.lineup_entries).toBeGreaterThan(0);
    expect(before.series).toBeGreaterThan(0);
    const samBefore = await countFor(t, sam.userId);

    // A second device's session goes too.
    const link = await t.ok('requestMagicLink', { body: { email: 'pat@example.com' } });
    const other = await t.call('verifyMagicLink', { body: { token: link.devToken, timezone: CHICAGO } });
    const otherToken = /7gs_session=([^;]+)/.exec(other.headers.get('set-cookie') ?? '')?.[1];
    await t.ok('requestMagicLink', { body: { email: 'pat@example.com' } }); // an unused link

    const res = await t.call('deleteMe', { token: pat.token, body: { confirmEmail: '  PAT@example.com ' } });
    expect(res.ok).toBe(true);
    expect(res.headers.get('set-cookie')).toMatch(/7gs_session=;.*Max-Age=0/);

    expect(Object.values(await countFor(t, pat.userId)).every((n) => n === 0)).toBe(true);
    const [left] = rowsOf<{ users: number; tokens: number }>(
      await t.db.execute(
        sql`SELECT (SELECT count(*)::int FROM users WHERE email = 'pat@example.com') AS users,
                   (SELECT count(*)::int FROM login_tokens WHERE email = 'pat@example.com') AS tokens`,
      ),
    );
    expect(left).toEqual({ users: 0, tokens: 0 });
    await t.fails('getMe', { token: pat.token }, 401);
    await t.fails('getMe', { token: otherToken }, 401);

    expect(await countFor(t, sam.userId)).toEqual(samBefore);
    expect((await t.ok('getMe', { token: sam.token })).email).toBe('sam@example.com');
    // The finalizer carries on without them.
    t.at('2026-10-08', '00:45', CHICAGO);
    expect((await t.finalize()).failures).toBe(0);

    // Signing up again starts from scratch.
    const again = await t.signIn('pat@example.com', CHICAGO);
    expect(again.isNewUser).toBe(true);
    expect((await t.ok('listTasks', { token: again.token })).tasks).toEqual([]);
  });
});
