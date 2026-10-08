import { chromium } from 'playwright';
const OUT = process.env.OUT;
let b; try { b = await chromium.launch(); } catch { b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
for (const [W, THEME] of [[390, 'dark'], [390, 'light'], [320, 'dark']]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Chicago', colorScheme: THEME });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:5174/'); await page.waitForTimeout(1800);
  await page.keyboard.press('Escape');
  const tag = `${W}-${THEME}`;
  await page.screenshot({ path: `${OUT}/a-today-${tag}.png`, fullPage: true });
  await page.goto('http://localhost:5174/film-room'); await page.waitForTimeout(1500);
  const holds = page.locator('.ilholds').first();
  if (await holds.count()) { await holds.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/b-card-holds-${tag}.png` }); }
  await page.goto('http://localhost:5174/film-room?tab=roster'); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/c-roster-${tag}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(tag, 'holds', await holds.count(), 'overflow', overflow, 'errors', errs);
  await ctx.close();
}
await b.close();
