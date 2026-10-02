// Renders the PWA icons from one SVG drawing: a scoreboard numeral tile "7" above
// seven series bulbs (four lit). Run with `pnpm --filter @7gs/web icons`.
// Uses Playwright's Chromium (PLAYWRIGHT_BROWSERS_PATH); no network needed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => resolve(root, 'public', p);

const GREEN = '#123d2a';
const DEEP = '#0c2a1c';
const INK = '#0f1412';
const CHALK = '#f5f0e3';
const GOLD = '#f3d27a';

/** The mark, centered on (256, 256) at `scale`. */
function mark(scale) {
  const bulbs = Array.from({ length: 7 }, (_, i) => {
    const lit = i < 4;
    return `<circle cx="${136 + i * 40}" cy="420" r="14" fill="${lit ? GOLD : DEEP}" stroke="${lit ? GOLD : CHALK}" stroke-opacity="${lit ? 1 : 0.35}" stroke-width="3"/>`;
  }).join('');
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -264)">
    <rect x="146" y="92" width="220" height="276" rx="26" fill="${INK}"/>
    <rect x="146" y="92" width="220" height="276" rx="26" fill="none" stroke="${CHALK}" stroke-opacity=".12" stroke-width="4"/>
    <polygon points="186,128 330,128 330,170 254,334 204,334 278,172 186,172" fill="${CHALK}"/>
    <rect x="146" y="228" width="220" height="5" fill="#000" opacity=".65"/>
    ${bulbs}
  </g>`;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${body}</svg>`;

// Rounded "any" icon, with a chalk pinstripe frame like the scoreboard panel.
const rounded = svg(`<rect width="512" height="512" rx="112" fill="${GREEN}"/>
  <rect x="22" y="22" width="468" height="468" rx="92" fill="none" stroke="${CHALK}" stroke-opacity=".22" stroke-width="6"/>
  ${mark(1)}`);

// Full-bleed variants keep the mark inside the maskable safe zone (inner 80% circle).
const fullBleed = (scale) => svg(`<rect width="512" height="512" fill="${GREEN}"/>${mark(scale)}`);

const targets = [
  { file: 'icons/icon-192.png', size: 192, art: rounded },
  { file: 'icons/icon-512.png', size: 512, art: rounded },
  { file: 'icons/icon-maskable-512.png', size: 512, art: fullBleed(0.74) },
  { file: 'icons/apple-touch-icon.png', size: 180, art: fullBleed(0.86) },
];

mkdirSync(out('icons'), { recursive: true });
writeFileSync(out('favicon.svg'), rounded);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, art } of targets) {
    await page.setViewportSize({ width: size, height: size });
    const src = `data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}`;
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
    await page.waitForFunction(() => document.images[0]?.complete);
    await page.screenshot({ path: out(file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`wrote public/${file}`);
  }
} finally {
  await browser.close();
}
