// Visual check: serves the production build (mock mode) with `vite preview` and captures
// every screen in light and dark at 390×844, plus a few at 1280 wide.
//   pnpm --filter @7gs/web build && pnpm --filter @7gs/web screenshots
// Output: apps/web/.screenshots/*.png (gitignored). Set BASE_URL to use a running server.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, '.screenshots');
mkdirSync(outDir, { recursive: true });

const port = 4179;
let server = null;
let base = process.env.BASE_URL;
if (!base) {
  base = `http://localhost:${port}`;
  // Own process group, so the whole tree (npx → vite) can be stopped at the end.
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });
  await waitFor(base);
}

function stopServer() {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} never came up`);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    // Fall back to the preinstalled binary if the pinned revision can't be found.
    return await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

const browser = await launch();
const written = [];

async function session(theme, width = 390, height = 844) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { context, page, errors };
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
}

async function open(page, path, scenario) {
  const url = new URL(path, base);
  if (scenario) url.searchParams.set('demo', scenario);
  await page.goto(url.toString());
  await page.waitForSelector('.app__main, .signin', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.state--loading'), null, { timeout: 15000 });
  await settle(page);
}

async function shot(page, name, theme, { fullPage = true } = {}) {
  const file = resolve(outDir, `${name}-${theme}.png`);
  await page.screenshot({ path: file, fullPage });
  written.push(file);
}

async function dismissJumbotron(page) {
  const btn = page.locator('.jumbotron__close');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(150);
  }
}

async function noHorizontalScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.warn(`⚠ horizontal overflow of ${overflow}px on ${label}`);
}

for (const theme of ['light', 'dark']) {
  const { context, page, errors } = await session(theme);

  // Today, mid-series: last night's W celebration first, then the live game.
  await open(page, '/', 'midseason');
  await shot(page, '01-today-jumbotron', theme, { fullPage: false });
  await dismissJumbotron(page);
  await shot(page, '02-today-live', theme);
  await noHorizontalScroll(page, 'today');

  // Check off the last must-hit: projection flips to W in hand.
  await page.getByRole('button', { name: 'Check off Deep work block' }).click();
  await page.waitForSelector('.jumbotron');
  await settle(page);
  await shot(page, '03-today-w-in-hand', theme, { fullPage: false });
  await dismissJumbotron(page);

  // Series strip: W, L (forfeit), PPD → Sat, W (rally), live, doubleheader, upcoming.
  await open(page, '/series');
  await shot(page, '04-series', theme);
  await noHorizontalScroll(page, 'series');
  await page.getByRole('button', { name: /^Game 4,/ }).click();
  await page.waitForSelector('.boxscore');
  await settle(page);
  await shot(page, '05-series-boxscore', theme, { fullPage: false });

  // Film Room: rotation, starter editor with warnings, roster with IL.
  await open(page, '/film-room');
  await shot(page, '06-filmroom-rotation', theme);
  await open(page, '/film-room/starters/2');
  await shot(page, '07-starter-editor', theme);
  await open(page, '/film-room?tab=roster');
  await shot(page, '08-filmroom-roster', theme);
  await noHorizontalScroll(page, 'roster');
  await page.getByRole('button', { name: /Guitar practice/ }).click();
  await page.waitForSelector('.il-box');
  await settle(page);
  await shot(page, '09-task-sheet-il', theme, { fullPage: false });

  // Season.
  await open(page, '/season');
  await shot(page, '10-season', theme);
  await noHorizontalScroll(page, 'season');

  // Doubleheader Saturday at clinch: pregame game 1 and the editor, rainout dialog.
  await open(page, '/', 'doubleheader');
  await dismissJumbotron(page);
  await shot(page, '11-today-doubleheader', theme);
  await page.getByRole('button', { name: 'Edit lineup' }).click();
  await settle(page);
  await shot(page, '12-lineup-editor', theme);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Rainout' }).click();
  await page.waitForSelector('.radios');
  await settle(page);
  await shot(page, '13-rainout-sheet', theme, { fullPage: false });
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Game 2/ }).click();
  await settle(page);
  await shot(page, '14-today-doubleheader-game2', theme);
  await open(page, '/series');
  await shot(page, '15-series-clinch', theme);

  // Rally Cap morning: odds before rolling, then the roll.
  await open(page, '/', 'rally');
  await shot(page, '16-today-rally-card', theme);
  await page.getByRole('button', { name: /Rally Cap/ }).first().click();
  await page.waitForSelector('.odds');
  await settle(page);
  await shot(page, '17-rally-odds', theme, { fullPage: false });
  await page.getByRole('button', { name: 'Roll the dice' }).click();
  await page.waitForSelector('.rally-result__call:not(:empty)');
  await page.waitForFunction(() => document.querySelector('.rally-result__call')?.textContent !== 'Rolling…');
  await settle(page);
  await shot(page, '18-rally-result', theme, { fullPage: false });
  await dismissJumbotron(page);

  // Off days.
  await open(page, '/', 'preseason');
  await shot(page, '19-today-spring-training', theme);
  await open(page, '/season');
  await shot(page, '20-season-spring-training', theme);
  await open(page, '/', 'offseason');
  await shot(page, '21-today-review-week', theme);

  // Sign-in (sign out from the Season screen's clubhouse).
  await open(page, '/season', 'midseason');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForSelector('.signin');
  await settle(page);
  await shot(page, '22-sign-in', theme);
  await page.getByLabel('Email').fill('rookie@example.com');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await page.getByRole('button', { name: 'Sign in now' }).waitFor();
  await settle(page);
  await shot(page, '23-sign-in-sent', theme);
  await page.getByRole('button', { name: 'Sign in now' }).click();
  await page.waitForSelector('.addtask');
  await settle(page);
  await shot(page, '24-new-user-roster', theme);

  if (errors.length) console.warn(`⚠ ${theme}: page errors:\n  ${errors.join('\n  ')}`);
  await context.close();
}

// Wide layout.
for (const theme of ['light', 'dark']) {
  const { context, page } = await session(theme, 1280, 900);
  await open(page, '/', 'midseason');
  await dismissJumbotron(page);
  await shot(page, '30-wide-today', theme);
  await open(page, '/series');
  await shot(page, '31-wide-series', theme);
  await context.close();
}

await browser.close();
stopServer();
console.log(`Wrote ${written.length} screenshots to ${outDir}`);
process.exit(0);
