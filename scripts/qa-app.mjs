import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

// Tests the built app. Fixtures are explicit; no cloud credentials or model calls.
const port = 4317;
let logs = '';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start',
  '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, DEMO_MODE: 'true', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
const origin = `http://127.0.0.1:${port}`;
let browser;
const errors = [], checks = [], externalRequests = [];
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* Startup only. */ }
    if (i === 100 || server.exitCode !== null) throw Error('APP_START_FAILED:' + logs);
    await setTimeout(100);
  }
  browser = await chromium.launch({ executablePath: process.env.DD_CHROME || undefined });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (new URL(req.url()).origin !== origin) externalRequests.push(req.url()); });
  await mkdir('output/app-screenshots', { recursive: true });
  for (const edition of ['elementary', 'junior', 'senior']) {
    const api = await fetch(origin + '/api/issues/latest?edition=' + edition);
    assert.equal(api.status, 200); assert.match(api.headers.get('cache-control'), /private.*no-store/);
    const { issue, freshness_status } = await api.json();
    assert.equal(freshness_status, 'demo'); assert.equal(issue.isDemo, true);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(origin + '/?edition=' + edition);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.article').count(), 8);
      assert.equal(await page.locator('.body-copy').allTextContents().then(x => x.join(' ')),
        issue.articles.map(a => a.bodyParagraphs.join(' ')).join(' '));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `output/app-screenshots/${edition}-${width}.png`, fullPage: true });
    }
    for (const mode of ['color', 'ink']) {
      const response = await fetch(`${origin}/api/issues/${issue.issueDate}/pdf?edition=${edition}&mode=${mode}`);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/pdf/);
      assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(), 2);
    }
  }
  checks.push('three editions at 375/768/1440; body equals API; six PDF downloads');
  await page.goto(origin + '/?edition=elementary');
  await page.getByRole('button', { name: '讀完了 ○' }).first().click();
  await page.waitForFunction(() => document.querySelector('progress')?.value === 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('progress')?.value === 1);
  await page.getByLabel('本機讀者', { exact: true }).selectOption('reader-2');
  await page.waitForFunction(() => document.querySelector('progress')?.value === 0);
  await page.getByLabel('本機讀者', { exact: true }).selectOption('reader-1');
  await page.waitForFunction(() => document.querySelector('progress')?.value === 1);
  for (let i = 0; i < 8 && await page.getByRole('button', { name: '讀完了 ○' }).count(); i++) {
    await page.getByRole('button', { name: '讀完了 ○' }).first().click();
  }
  await page.waitForFunction(() => document.querySelector('progress')?.value === 8);
  assert.equal(await page.getByText('今天的八則，讀完了！').count(), 1);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('progress')?.value === 0);
  await page.getByRole('button', { name: /國中版/ }).click();
  await page.waitForURL('**edition=junior');
  await page.goto(origin);
  await page.waitForURL('**edition=junior');
  const headline = await page.locator('.article h2').first().textContent();
  await page.getByRole('link', { name: /放大閱讀/ }).first().click();
  await page.waitForURL('**/stories/**');
  assert.equal(await page.locator('.article').count(), 1);
  assert.equal(await page.locator('.article h2').textContent(), headline);
  checks.push('manual completion, reload, profiles, reset, saved edition, same-payload detail');
  const restricted=await browser.newContext();
  await restricted.addInitScript(()=>Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('Synthetic quota refusal')}}));
  const restrictedPage=await restricted.newPage();await restrictedPage.goto(origin+'/?edition=elementary');
  await restrictedPage.getByRole('button',{name:'讀完了 ○'}).first().click();
  await restrictedPage.waitForFunction(()=>document.querySelector('progress')?.value===1);
  assert.equal(await restrictedPage.getByText(/瀏覽器未允許儲存/).count(),1);
  await restricted.close();checks.push('storage refusal keeps reading usable and shows persistence warning');
  await page.goto(origin + '/issues'); assert.match(await page.locator('body').textContent(), /DEMO/);
  assert.equal((await fetch(origin + '/api/issues/2026-02-30')).status, 400);
  assert.equal((await fetch(origin + '/api/issues/latest?edition=__proto__').then(r => r.json())).issue.edition, 'elementary');
  assert.equal((await fetch(origin + '/issues/2026-11-17/stories/no-such-story')).status, 404);
  for (const action of ['approve', 'revise']) {
    assert.equal((await fetch(`${origin}/api/admin/revisions/30000000-0000-4000-8000-000000000001/${action}`,
      { method: 'POST', headers: { Origin: 'https://foreign.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${origin}/api/admin/revisions/30000000-0000-4000-8000-000000000001/${action}`,
      { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: '{}' })).status, 409);
  }
  await page.goto(origin + '/admin/issues/2026-11-17');
  assert.equal(await page.locator('.admin-stories article').count(), 24);
  assert.equal(await page.getByRole('button', { name: '核准並發布這個版本' }).isDisabled(), true);
  await page.goto(origin+'/admin/settings');
  assert.equal(await page.getByRole('button',{name:'儲存發布模式'}).isDisabled(),true);
  checks.push('archive, invalid routes, malicious edition, foreign Origin, DEMO writes refused');
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  await writeFile('output/app-verification.json', JSON.stringify({ mode: 'next-production-build-demo',
    checks, browserErrors: errors, externalRequests, publishedLive: false }, null, 2));
  console.log('PASS: built Next.js reader/API/PDF/admin DEMO flows; no external requests.');
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await writeFile('output/app-server.log', logs);
}
