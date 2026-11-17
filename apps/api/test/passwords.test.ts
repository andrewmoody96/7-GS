import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/passwords';
import { asSession, CHICAGO, rowsOf, TestApp, useTestDb } from './helpers';

const env = useTestDb();

async function storedHash(t: TestApp, email: string): Promise<string | null> {
  const [row] = rowsOf<{ password_hash: string | null }>(await t.db.execute(sql`SELECT password_hash FROM users WHERE email = ${email}`));
  return row?.password_hash ?? null;
}

/** Ask for an email, then verify its link: a session, or the password step. */
async function viaEmail(t: TestApp, email: string) {
  const link = await t.ok('requestMagicLink', { body: { email } });
  return t.ok('verifyMagicLink', { body: { token: link.devToken!, timezone: CHICAGO } });
}

describe('password hashing', () => {
  it('stores a salted scrypt hash, never the password', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toContain('correct horse battery');
    expect(a).not.toBe(b); // a fresh salt each time
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('Correct horse battery', a)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('optional password', () => {
  it('is set, changed with the current one, and removed', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await t.signIn('pw@example.com', CHICAGO);
    expect((await t.ok('getMe', { token })).hasPassword).toBe(false);
    expect((await t.fails('setPassword', { token, body: { password: 'short' } }, 400)).code).toBe('VALIDATION_FAILED');

    expect((await t.ok('setPassword', { token, body: { password: 'first password' } })).hasPassword).toBe(true);
    expect(await storedHash(t, 'pw@example.com')).toMatch(/^scrypt\$/);
    // Changing it needs the current one.
    expect((await t.fails('setPassword', { token, body: { password: 'second password' } }, 400)).issues?.[0]?.path).toBe('current');
    await t.ok('setPassword', { token, body: { current: 'first password', password: 'second password' } });
    expect(await t.fails('removePassword', { token, body: { current: 'first password' } }, 400)).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await t.ok('removePassword', { token, body: { current: 'second password' } })).hasPassword).toBe(false);
    expect(await storedHash(t, 'pw@example.com')).toBeNull();
  });

  it('adds a password step to sign-in, with 5 tries', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    const { token } = await t.signIn('two-step@example.com', CHICAGO);
    await t.ok('setPassword', { token, body: { password: 'my long password' } });

    // The email alone no longer signs in: no cookie, just a challenge.
    const link = await t.ok('requestMagicLink', { body: { email: 'two-step@example.com' } });
    const step = await t.call('verifyMagicLink', { body: { token: link.devToken!, timezone: CHICAGO } });
    if (!step.ok) throw new Error('verify failed');
    expect(step.data).toMatchObject({ passwordRequired: true, email: 'two-step@example.com' });
    expect(step.headers.get('set-cookie') ?? '').not.toMatch(/7gs_session=[^;]/);
    const challenge = 'challenge' in step.data ? step.data.challenge : '';

    const wrong = await t.fails('verifyPassword', { body: { challenge, password: 'nope' } }, 401);
    expect(wrong.message).toMatch(/4 tries left/);
    const ok = await t.call('verifyPassword', { body: { challenge, password: 'my long password' } });
    if (!ok.ok) throw new Error('password step failed');
    expect(ok.data).toMatchObject({ isNewUser: false, me: { email: 'two-step@example.com', hasPassword: true } });
    expect(ok.headers.get('set-cookie')).toMatch(/7gs_session=/);
    // Single use.
    expect((await t.fails('verifyPassword', { body: { challenge, password: 'my long password' } }, 401)).code).toBe('UNAUTHORIZED');

    // Five wrong passwords spend the challenge, even if the right one comes next.
    const again = await viaEmail(t, 'two-step@example.com');
    const second = 'challenge' in again ? again.challenge : '';
    for (let i = 0; i < 5; i++) await t.fails('verifyPassword', { body: { challenge: second, password: 'nope' } }, 401);
    expect((await t.fails('verifyPassword', { body: { challenge: second, password: 'my long password' } }, 401)).message).toMatch(
      /new email/,
    );
  });

  it('leaves email-only accounts signing in as before', async () => {
    const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
    expect(asSession(await viaEmail(t, 'plain@example.com')).me.hasPassword).toBe(false);
  });
});
