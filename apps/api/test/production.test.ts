// Production hosting: configuration checks, email sign-in, the magic-link throttle,
// and serving the built web app next to /v1 on one origin.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';
import { databaseOptionsFromEnv } from '../src/db/client';
import type { AppConfig, Mailer } from '../src/deps';
import { clientAddress, RateLimiter } from '../src/http/rateLimit';
import { createMailer } from '../src/mailer';
import { CHICAGO, TestApp, useTestDb } from './helpers';

const env = useTestDb();
const NOW = '2026-10-06T15:00:00Z';
const base: AppConfig = { cookieSecure: false, validateResponses: true };

function webRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), '7gs-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>7-Game Series</title>');
  writeFileSync(join(dir, 'assets', 'index-DcoAphbN.js'), 'console.log(1)');
  writeFileSync(join(dir, 'sw.js'), 'self.skipWaiting()');
  return dir;
}

function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadConfig', () => {
  it('needs nothing in development', () => {
    const config = loadConfig({});
    expect(config.production).toBe(false);
    expect(config.database.kind).toBe('pglite');
    expect(config.email).toBeNull();
    expect(config.app).toMatchObject({ cookieSecure: false, allowDevLogin: true, webRoot: null, forceHttps: false });
  });

  it('refuses to start in production without a database or a way to sign in', () => {
    const problems = problemsOf(() => loadConfig({ NODE_ENV: 'production', SERVE_WEB: 'false' }));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/DATABASE_URL/);
    expect(problems[1]).toMatch(/RESEND_API_KEY or POSTMARK_API_TOKEN/);
  });

  it('requires EMAIL_FROM with a provider, and APP_URL for the links', () => {
    const problems = problemsOf(() =>
      loadConfig({ NODE_ENV: 'production', SERVE_WEB: 'false', DATABASE_URL: 'postgres://h/db', RESEND_API_KEY: 're_1' }),
    );
    expect(problems.join('\n')).toMatch(/EMAIL_FROM/);
    expect(
      problemsOf(() =>
        loadConfig({
          NODE_ENV: 'production',
          SERVE_WEB: 'false',
          DATABASE_URL: 'postgres://h/db',
          POSTMARK_API_TOKEN: 'pm',
          EMAIL_FROM: 'play@example.com',
          APP_URL: 'https://example.com/app',
        }),
      ).join('\n'),
    ).toMatch(/APP_URL must be an origin/);
  });

  it('checks the web build exists before serving it', () => {
    const problems = problemsOf(() =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://h/db', ALLOW_DEV_LOGIN: 'true', WEB_ROOT: '/nope' }),
    );
    expect(problems).toEqual([expect.stringMatching(/\/nope\/index\.html is missing/)]);
  });

  it('turns on the production defaults on Heroku', () => {
    const root = webRoot();
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '41234',
      DATABASE_URL: 'postgres://u:p@ec2.compute.amazonaws.com:5432/d1',
      POSTMARK_API_TOKEN: 'pm-token',
      EMAIL_FROM: '7-Game Series <play@example.com>',
      APP_URL: 'https://seven-gs.herokuapp.com/',
      WEB_ROOT: root,
    });
    expect(config.port).toBe(41234);
    expect(config.database).toEqual({ kind: 'postgres', url: 'postgres://u:p@ec2.compute.amazonaws.com:5432/d1', ssl: true });
    expect(config.email).toEqual({ provider: 'postmark', apiKey: 'pm-token', from: '7-Game Series <play@example.com>' });
    expect(config.app).toEqual({
      cookieSecure: true,
      validateResponses: false,
      logRequests: true,
      appUrl: 'https://seven-gs.herokuapp.com',
      webRoot: root,
      forceHttps: true,
      allowDevLogin: false,
      limitMagicLinks: true,
    });
  });

  it('leaves TLS to the URL when it sets sslmode, or to DATABASE_SSL', () => {
    expect(databaseOptionsFromEnv({ DATABASE_URL: 'postgres://h/d?sslmode=require' }, '/x', true)).toMatchObject({ ssl: false });
    expect(databaseOptionsFromEnv({ DATABASE_URL: 'postgres://h/d', DATABASE_SSL: 'false' }, '/x', true)).toMatchObject({ ssl: false });
    expect(databaseOptionsFromEnv({ DATABASE_URL: 'postgres://h/d', DATABASE_SSL: 'true' }, '/x', false)).toMatchObject({ ssl: true });
  });
});

describe('createMailer', () => {
  function fakeFetch(status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(status === 200 ? '{}' : 'bad sender', { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('posts to Resend and Postmark with the link in both bodies', async () => {
    const link = 'https://seven.example/sign-in?token=abc&x=1';
    const resend = fakeFetch();
    await createMailer({ provider: 'resend', apiKey: 're_k', from: 'a@b.co' }, resend.fn).sendMagicLink('p@q.co', link);
    expect(resend.calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(resend.calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer re_k' });
    const rBody = JSON.parse(String(resend.calls[0]?.init.body));
    expect(rBody).toMatchObject({ from: 'a@b.co', to: ['p@q.co'], subject: 'Your 7-Game Series sign-in link' });
    expect(rBody.text).toContain(link);
    expect(rBody.html).toContain('href="https://seven.example/sign-in?token=abc&amp;x=1"');

    const postmark = fakeFetch();
    await createMailer({ provider: 'postmark', apiKey: 'pm', from: 'a@b.co' }, postmark.fn).sendMagicLink('p@q.co', link);
    expect(postmark.calls[0]?.url).toBe('https://api.postmarkapp.com/email');
    expect(postmark.calls[0]?.init.headers).toMatchObject({ 'x-postmark-server-token': 'pm' });
    expect(JSON.parse(String(postmark.calls[0]?.init.body))).toMatchObject({ From: 'a@b.co', To: 'p@q.co' });
  });

  it('throws when the provider rejects the email', async () => {
    const { fn } = fakeFetch(422);
    await expect(
      createMailer({ provider: 'resend', apiKey: 'k', from: 'a@b.co' }, fn).sendMagicLink('p@q.co', 'https://x'),
    ).rejects.toThrow(/resend rejected the email \(422\): bad sender/);
  });
});

describe('email sign-in', () => {
  function recordingMailer(fail = false): Mailer & { sent: { email: string; link: string }[] } {
    const sent: { email: string; link: string }[] = [];
    return {
      sent,
      async sendMagicLink(email, link) {
        if (fail) throw new Error('provider down');
        sent.push({ email, link });
      },
    };
  }

  it('emails a link on APP_URL and never returns the token', async () => {
    const mailer = recordingMailer();
    const t = new TestApp(env.db, NOW, { mailer, config: { ...base, appUrl: 'https://seven.example', allowDevLogin: false } });
    const res = await t.ok('requestMagicLink', { body: { email: 'Fan@Example.com' } });
    expect(res).toEqual({ sent: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.email).toBe('fan@example.com');
    const token = new URL(mailer.sent[0]!.link).searchParams.get('token');
    expect(mailer.sent[0]?.link).toMatch(/^https:\/\/seven\.example\/sign-in\?token=/);
    const verified = await t.ok('verifyMagicLink', { body: { token, timezone: CHICAGO } });
    expect(verified.me.email).toBe('fan@example.com');
  });

  it('reports a failed send instead of pretending', async () => {
    const t = new TestApp(env.db, NOW, { mailer: recordingMailer(true), config: { ...base, appUrl: 'https://seven.example' } });
    const error = await t.fails('requestMagicLink', { body: { email: 'fan@example.com' } }, 502);
    expect(error).toMatchObject({ reason: 'EMAIL_FAILED' });
    expect(t.log.lines.some((l) => l.message === 'Magic link email failed')).toBe(true);
  });

  it('never hands out a dev token when dev login is off', async () => {
    const t = new TestApp(env.db, NOW, { config: { ...base, allowDevLogin: false } });
    expect(await t.fails('requestMagicLink', { body: { email: 'fan@example.com' } }, 503)).toMatchObject({ reason: 'NO_MAILER' });
  });

  it('throttles links per address and per client', async () => {
    const t = new TestApp(env.db, NOW, { config: { ...base, limitMagicLinks: true } });
    const ask = (email: string, ip: string) =>
      t.call('requestMagicLink', { body: { email }, headers: { 'x-forwarded-for': `9.9.9.9, ${ip}` } });
    for (let i = 0; i < 5; i++) expect((await ask('fan@example.com', '1.1.1.1')).ok).toBe(true);
    const sixth = await ask('FAN@example.com', '2.2.2.2');
    expect(sixth.ok ? null : [sixth.status, sixth.error.code]).toEqual([429, 'RATE_LIMITED']);
    // A fresh window lets them back in.
    t.clock.set(new Date(Date.parse(NOW) + 15 * 60_000));
    expect((await ask('fan@example.com', '1.1.1.1')).ok).toBe(true);
  });

  it('limits a single client across addresses', () => {
    const limiter = new RateLimiter(2, 1000);
    const now = new Date(0);
    expect([limiter.take('a', now), limiter.take('a', now), limiter.take('a', now), limiter.take('b', now)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(clientAddress('6.6.6.6, 10.0.0.1')).toBe('10.0.0.1');
    expect(clientAddress(undefined)).toBe('unknown');
  });
});

describe('serving the web app', () => {
  function app(config: Partial<AppConfig> = {}) {
    return new TestApp(env.db, NOW, { config: { ...base, webRoot: webRoot(), ...config } }).app;
  }

  it('serves the shell for client routes and caches hashed assets forever', async () => {
    const web = app();
    const home = await web.request('/', { headers: { accept: 'text/html' } });
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<title>7-Game Series</title>');
    expect(home.headers.get('cache-control')).toBe('no-cache');

    const deep = await web.request('/film-room/starters/1?tab=x', { headers: { accept: 'text/html,*/*' } });
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('7-Game Series');

    const asset = await web.request('/assets/index-DcoAphbN.js');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await web.request('/sw.js')).headers.get('cache-control')).toBe('no-cache');
  });

  it('keeps /v1 and missing files as JSON 404s', async () => {
    const web = app();
    const api = await web.request('/v1/nope', { headers: { accept: 'text/html' } });
    expect(api.status).toBe(404);
    expect(await api.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    const gone = await web.request('/assets/index-0ldHashXy.js');
    expect(gone.status).toBe(404);
    expect(gone.headers.get('cache-control')).toBeNull();
    expect((await web.request('/v1/me')).status).toBe(401);
  });

  it('redirects plain HTTP to HTTPS and answers health checks', async () => {
    const web = app({ forceHttps: true });
    const res = await web.request('http://seven.example/season?x=1', { headers: { 'x-forwarded-proto': 'http' } });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://seven.example/season?x=1');
    const health = await web.request('http://seven.example/healthz', { headers: { 'x-forwarded-proto': 'https' } });
    expect(await health.json()).toEqual({ ok: true });
    expect(health.headers.get('strict-transport-security')).toBe('max-age=31536000');
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
