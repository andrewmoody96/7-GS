import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { CHICAGO, rowsOf, TestApp, useTestDb } from './helpers';

const env = useTestDb();
// A 1×1 JPEG is enough to stand for a photo the device already resized.
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

async function signedUp(email: string) {
  const t = new TestApp(env.db, '2026-10-02T15:00:00Z');
  const { token, userId } = await t.signIn(email, CHICAGO);
  return { t, token, userId };
}

describe('team photo', () => {
  it('saves, replaces and removes it, and shows it on the account', async () => {
    const { t, token } = await signedUp('photo@example.com');
    expect((await t.ok('getMe', { token })).avatar).toBeNull();
    expect((await t.ok('putAvatar', { token, body: { image: PHOTO } })).avatar).toBe(PHOTO);
    expect((await t.ok('getMe', { token })).avatar).toBe(PHOTO);
    const png = PHOTO.replace('image/jpeg', 'image/png');
    expect((await t.ok('putAvatar', { token, body: { image: png } })).avatar).toBe(png);
    expect((await t.ok('deleteAvatar', { token })).avatar).toBeNull();
  });

  it('only takes small JPEG, PNG or WebP images', async () => {
    const { t, token } = await signedUp('photo-bad@example.com');
    const notImage = await t.fails('putAvatar', { token, body: { image: 'data:text/html;base64,PGgxPg==' } }, 400);
    expect(notImage.code).toBe('VALIDATION_FAILED');
    const huge = await t.fails('putAvatar', { token, body: { image: `data:image/png;base64,${'A'.repeat(200_100)}` } }, 400);
    expect(huge.code).toBe('VALIDATION_FAILED');
    expect((await t.ok('getMe', { token })).avatar).toBeNull();
  });

  it('goes with the account when it is deleted', async () => {
    const { t, token, userId } = await signedUp('photo-gone@example.com');
    await t.ok('putAvatar', { token, body: { image: PHOTO } });
    await t.ok('deleteMe', { token, body: { confirmEmail: 'photo-gone@example.com' } });
    const [row] = rowsOf<{ n: number }>(await t.db.execute(sql`SELECT count(*)::int AS n FROM user_avatars WHERE user_id = ${userId}`));
    expect(row?.n).toBe(0);
  });
});

describe('release notes seen', () => {
  it('remembers the newest notes the account has seen', async () => {
    const { t, token } = await signedUp('notes@example.com');
    expect((await t.ok('getMe', { token })).seenRelease).toBeNull();
    expect((await t.ok('updateMe', { token, body: { seenRelease: '2026-11-team-photo' } })).seenRelease).toBe('2026-11-team-photo');
    expect((await t.ok('getMe', { token })).seenRelease).toBe('2026-11-team-photo');
  });
});
