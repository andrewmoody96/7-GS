import { ApiError } from '@7gs/contracts';
import { describe, expect, it } from 'vitest';
import { loginTokens, sessions } from '../src/db/schema';
import { CHICAGO, TestApp, useTestDb } from './helpers';

const env = useTestDb();

describe('magic-link auth', () => {
  it('signs in with a dev token, creates the user in their zone and sets the session cookie', async () => {
    // 22:00 on Oct 1 in Chicago is already Oct 2 in UTC: start_date must be the local date.
    const t = new TestApp(env.db, '2026-10-02T03:00:00Z');
    const link = await t.ok('requestMagicLink', { body: { email: 'Pat.Smith@Example.com' } });
    expect(link.sent).toBe(true);
    expect(link.devToken).toEqual(expect.any(String));
    expect(t.log.lines.some((l) => l.meta?.devToken === link.devToken && l.meta?.email === 'pat.smith@example.com')).toBe(true);

    const verified = await t.call('verifyMagicLink', { body: { token: link.devToken, timezone: CHICAGO } });
    if (!verified.ok) throw new Error('verify failed');
    expect(verified.data.isNewUser).toBe(true);
    expect(verified.data.me).toMatchObject({
      email: 'pat.smith@example.com',
      displayName: 'pat.smith',
      timezone: CHICAGO,
      startDate: '2026-10-01',
      today: '2026-10-01',
      defaultLockTime: null,
      position: { phase: 'preseason', seasonNumber: 1, openingDay: '2026-10-05', daysUntilOpeningDay: 4 },
      allowances: { month: '2026-10', rallyTokens: 0, rainouts: 0, ironManBonusHeld: false },
    });

    const cookie = verified.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^7gs_session=[A-Za-z0-9_-]{40,};/);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);

    // Both the cookie and a Bearer token work.
    const session = /7gs_session=([^;]+)/.exec(cookie)?.[1] ?? '';
    const viaCookie = await t.ok('getMe', { cookie: `7gs_session=${session}` });
    const viaBearer = await t.ok('getMe', { token: session });
    expect(viaCookie.id).toBe(verified.data.me.id);
    expect(viaBearer.id).toBe(verified.data.me.id);
  });

  it('only stores hashes of login tokens and sessions', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const link = await t.ok('requestMagicLink', { body: { email: 'hash2@example.com' } });
    const { token } = await t.signIn('hash@example.com', CHICAGO);
    const hashes = (await env.db.select({ idHash: sessions.idHash }).from(sessions)).map((r) => r.idHash);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).not.toBe(token);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    const stored = await env.db.select({ tokenHash: loginTokens.tokenHash }).from(loginTokens);
    expect(stored).toHaveLength(2);
    expect(stored.map((r) => r.tokenHash)).not.toContain(link.devToken);
  });

  it('rejects used, expired and unknown links', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const link = await t.ok('requestMagicLink', { body: { email: 'once@example.com' } });
    await t.ok('verifyMagicLink', { body: { token: link.devToken, timezone: CHICAGO } });
    const reused = await t.fails('verifyMagicLink', { body: { token: link.devToken, timezone: CHICAGO } }, 401);
    expect(reused.code).toBe('UNAUTHORIZED');

    const late = await t.ok('requestMagicLink', { body: { email: 'once@example.com' } });
    t.clock.advanceMinutes(15);
    expect((await t.fails('verifyMagicLink', { body: { token: late.devToken, timezone: CHICAGO } }, 401)).code).toBe(
      'UNAUTHORIZED',
    );
    expect(
      (await t.fails('verifyMagicLink', { body: { token: 'x'.repeat(43), timezone: CHICAGO } }, 401)).code,
    ).toBe('UNAUTHORIZED');
  });

  it('signs a returning user into the same account without touching their zone', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const first = await t.signIn('back@example.com', CHICAGO);
    t.clock.advanceDays(3);
    const second = await t.signIn('BACK@example.com', 'Asia/Tokyo');
    expect(second.isNewUser).toBe(false);
    expect(second.userId).toBe(first.userId);
    const me = await t.ok('getMe', { token: second.token });
    expect(me.timezone).toBe(CHICAGO);
    expect(me.startDate).toBe('2026-10-02');
  });

  it('requires a valid session everywhere except the auth endpoints', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    expect(await t.fails('getToday', {}, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await t.fails('getMe', { token: 'nope' }, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await t.fails('listTasks', { headers: { authorization: 'Basic abc' } }, 401)).toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(await t.fails('logout', {}, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('logs out by deleting the session and clearing the cookie', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await t.signIn('bye@example.com', CHICAGO);
    const result = await t.call('logout', { token });
    expect(result.ok && result.data).toEqual({ ok: true });
    expect(result.headers.get('set-cookie')).toMatch(/7gs_session=;.*Max-Age=0/);
    expect(await t.fails('getMe', { token }, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('keeps sessions alive for 30 days after the last use (sliding)', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await t.signIn('slide@example.com', CHICAGO);
    t.clock.advanceDays(20);
    const touched = await t.call('getMe', { cookie: `7gs_session=${token}` });
    expect(touched.ok).toBe(true);
    expect(touched.headers.get('set-cookie')).toMatch(/Max-Age=2592000/);
    t.clock.advanceDays(20); // 40 days after sign-in, 20 after the last use
    await t.ok('getMe', { token });
    t.clock.advanceDays(31);
    expect(await t.fails('getMe', { token }, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('validates bodies against the contracts', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const badEmail = await t.fails('requestMagicLink', { body: { email: 'not-an-email' } }, 400);
    expect(badEmail.code).toBe('VALIDATION_FAILED');
    expect(badEmail.issues?.[0]?.path).toBe('email');

    const link = await t.ok('requestMagicLink', { body: { email: 'tz@example.com' } });
    const badZone = await t.fails('verifyMagicLink', { body: { token: link.devToken, timezone: 'Mars/Olympus' } }, 400);
    expect(badZone.issues?.[0]?.path).toBe('timezone');

    const notJson = await t.fails('requestMagicLink', { rawBody: '{', headers: { 'content-type': 'application/json' } }, 400);
    expect(notJson.code).toBe('VALIDATION_FAILED');
  });

  it('answers unknown routes with a NOT_FOUND ApiError', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const res = await t.app.request('/v1/nope');
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('prunes expired links and sessions when the finalizer runs', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    await t.ok('requestMagicLink', { body: { email: 'prune@example.com' } });
    const { token } = await t.signIn('prune@example.com', CHICAGO);
    t.clock.advanceMinutes(16);
    expect((await t.finalize()).expiredCredentialsDeleted).toBe(2); // both links
    t.clock.advanceDays(31);
    expect((await t.finalize()).expiredCredentialsDeleted).toBe(1); // the session
    expect(await env.db.select().from(sessions)).toEqual([]);
    expect(await t.fails('getMe', { token }, 401)).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
