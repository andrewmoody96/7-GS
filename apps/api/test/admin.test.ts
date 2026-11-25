import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { configureAdmins } from '../src/services/users';
import { CHICAGO, rowsOf, TestApp, useTestDb } from './helpers';

const env = useTestDb();
const adminConfig = { cookieSecure: false, validateResponses: true, adminEmails: ['boss@example.com'] };

// Other test files create apps without admins; don't leak this list into them.
afterAll(() => configureAdmins([]));

async function lastSeen(t: TestApp, email: string): Promise<string | null> {
  const [row] = rowsOf<{ last_seen_at: Date | string | null }>(
    await t.db.execute(sql`SELECT last_seen_at FROM users WHERE email = ${email}`),
  );
  return row?.last_seen_at ? new Date(row.last_seen_at).toISOString() : null;
}

describe('last seen', () => {
  it('records signed-in use, at most once an hour', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await t.signIn('seen@example.com', CHICAGO);
    await t.ok('getMe', { token });
    expect(await lastSeen(t, 'seen@example.com')).toBe('2026-10-02T15:00:00.000Z');

    t.clock.set('2026-10-02T15:40:00Z');
    await t.ok('getMe', { token });
    expect(await lastSeen(t, 'seen@example.com')).toBe('2026-10-02T15:00:00.000Z'); // within the hour

    t.clock.set('2026-10-02T16:05:00Z');
    await t.ok('getToday', { token });
    expect(await lastSeen(t, 'seen@example.com')).toBe('2026-10-02T16:05:00.000Z');
  });
});

describe('admin: accounts', () => {
  it('lists every account for an ADMIN_EMAILS address, most recently active first', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z', { config: adminConfig });
    const boss = await t.signIn('boss@example.com', CHICAGO);
    t.clock.set('2026-10-03T09:00:00Z');
    const pat = await t.signIn('pat@example.com', CHICAGO);
    await t.ok('updateMe', { token: pat.token, body: { displayName: 'Pat’s Picks' } });
    const bossPhoto = `data:image/jpeg;base64,${'A'.repeat(64)}`;

    expect((await t.ok('getMe', { token: pat.token })).isAdmin).toBe(false);
    t.clock.set('2026-10-03T11:00:00Z'); // the boss checks in later, so is the most recent
    expect((await t.ok('getMe', { token: boss.token })).isAdmin).toBe(true);

    // The admin pages need a password, entered on this device.
    expect(await t.fails('listAccounts', { token: boss.token }, 409)).toMatchObject({ reason: 'PASSWORD_NOT_SET' });
    await t.ok('setPassword', { token: boss.token, body: { password: 'correct horse battery' } });
    expect(await t.fails('listAccounts', { token: boss.token }, 409)).toMatchObject({ reason: 'ADMIN_LOCKED' });
    expect(await t.fails('unlockAdmin', { token: boss.token, body: { password: 'wrong guess' } }, 400)).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await t.ok('unlockAdmin', { token: boss.token, body: { password: 'correct horse battery' } });

    await t.ok('putAvatar', { token: boss.token, body: { image: bossPhoto } });
    const { accounts } = await t.ok('listAccounts', { token: boss.token });
    // Each account with its team photo (for its badge), and no last sign-in.
    expect(accounts.find((a) => a.email === 'boss@example.com')).toMatchObject({ avatar: bossPhoto });
    expect(accounts.find((a) => a.email === 'pat@example.com')).not.toHaveProperty('lastSignInAt');
    expect(accounts.map((a) => a.email)).toEqual(['boss@example.com', 'pat@example.com']);
    expect(accounts.find((a) => a.email === 'pat@example.com')).not.toHaveProperty('devices');
    expect(accounts.find((a) => a.email === 'pat@example.com')).toMatchObject({
      displayName: 'Pat’s Picks',
      avatar: null,
      createdAt: '2026-10-03T09:00:00.000Z',
      lastSeenAt: '2026-10-03T09:00:00.000Z',
      theme: 'baseball',
    });
  });

  it('stays unlocked on that device for 12 hours', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z', { config: adminConfig });
    const boss = await t.signIn('boss@example.com', CHICAGO);
    await t.ok('setPassword', { token: boss.token, body: { password: 'correct horse battery' } });
    await t.ok('unlockAdmin', { token: boss.token, body: { password: 'correct horse battery' } });
    t.clock.set('2026-10-03T02:59:00Z');
    await t.ok('listAccounts', { token: boss.token });
    t.clock.set('2026-10-03T03:00:00Z');
    expect(await t.fails('listAccounts', { token: boss.token }, 409)).toMatchObject({ reason: 'ADMIN_LOCKED' });
  });

  it('is a plain 404 for everyone else', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z', { config: adminConfig });
    const { token } = await t.signIn('nosy@example.com', CHICAGO);
    await t.ok('setPassword', { token, body: { password: 'let me in please' } });
    expect((await t.fails('unlockAdmin', { token, body: { password: 'let me in please' } }, 404)).code).toBe('NOT_FOUND');
    expect((await t.fails('listAccounts', { token }, 404)).code).toBe('NOT_FOUND');
  });
});
