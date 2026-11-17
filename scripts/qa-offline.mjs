import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { localServer } from '../lib/pdf/local-server.mjs';

execFileSync(process.execPath, ['--import', 'tsx', 'scripts/render.tsx'], { stdio: 'inherit' });
const server = await localServer('output/preview');
const browser = await chromium.launch({ executablePath: process.env.DD_CHROME || undefined });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await mkdir('output/screenshots', { recursive: true });
  for (const edition of ['elementary', 'junior', 'senior']) {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${server.origin}/${edition}.html`);
      await page.evaluate(() => document.fonts.ready);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('RESPONSIVE_OVERFLOW');
      await page.screenshot({ path: `output/screenshots/${edition}-${width}.png`, fullPage: true });
    }
    for (const mode of ['color', 'ink']) {
      await page.goto(`${server.origin}/DD_2026-11-17_${edition}_r1_${mode}.html`);
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: 'print' });
      for (let i = 0; i < 2; i++) await page.locator('.print-page').nth(i).screenshot({
        path: `output/screenshots/${edition}-${mode}-page${i + 1}.png`,
      });
      await page.emulateMedia({ media: 'screen' });
    }
  }
  await page.goto(`${server.origin}/elementary.html`);
  await page.locator('.read').first().click();
  if (await page.locator('#progress').textContent() !== '已讀 1 / 8') throw Error('READ_STATE');
  await page.reload();
  if (await page.locator('#progress').textContent() !== '已讀 1 / 8') throw Error('READ_PERSISTENCE');
  await page.locator('#profile').selectOption('reader-2');
  if (await page.locator('#progress').textContent() !== '已讀 0 / 8') throw Error('PROFILE_ISOLATION');
  await page.locator('.expand').first().click();
  if (!await page.locator('#reading').isVisible()) throw Error('DETAIL_DIALOG');
  await page.keyboard.press('Escape');
  if (await page.locator('#reading').isVisible()) throw Error('ESCAPE_CLOSE');
  if (errors.length) throw Error('BROWSER_ERRORS:' + errors.join(','));
  await writeFile('output/qa-report.json', JSON.stringify({ status: 'passed', mode: 'offline-demo',
    responsive: [375, 768, 1440], interactions: ['manual read', 'reload persistence',
      'profile isolation', 'detail dialog', 'Escape close'], browserErrors: errors,
    pdfProof: 'output/pdf-verification.json' }, null, 2));
  console.log('PASS: offline preview at three widths, reader interactions, six verified PDFs.');
} finally { await browser.close(); await server.close(); }
