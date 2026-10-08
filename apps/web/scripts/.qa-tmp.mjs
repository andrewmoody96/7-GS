import { chromium } from 'playwright';
const OUT = process.env.OUT; const W = Number(process.env.W || 390); const THEME = process.env.THEME || 'dark';
let b; try { b = await chromium.launch(); } catch { b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Chicago', colorScheme: THEME });
await ctx.addInitScript(() => { Date.now = ((orig) => () => orig.call(Date) )(Date.now); });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5174/'); await page.waitForTimeout(2000);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
const bench = page.locator('section.bench').first();
if (await bench.count()) { await bench.scrollIntoViewIfNeeded(); await bench.screenshot({ path: `${OUT}/bench-${W}-${THEME}.png` }); }
await page.screenshot({ path: `${OUT}/today-${W}-${THEME}.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log('overflow', overflow, 'errors', errs);
await b.close();
