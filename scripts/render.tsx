import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';
import {z} from 'zod';
import { PDFDocument } from 'pdf-lib';
import { editionKeys, editions } from '../config/editions';
import { demoIssue } from '../fixtures/issue';
import { renderPrint } from '../lib/render.mjs';
import { editionSchema, type EditionView } from '../lib/schemas/edition';
import { hash } from '../lib/pipeline/state.mjs';
import { localServer } from '../lib/pdf/local-server.mjs';
import { checkPrintLayout } from '../lib/pdf/print-checks.mjs';

export async function renderIssues(issues: EditionView[], outDir: string, options:{allowUncalibratedReviewDraft?:boolean}={}) {
  if (issues.length !== 3 || new Set(issues.map(p => p.edition)).size !== 3) throw Error('THREE_EDITIONS_REQUIRED');
  const quality=issues.map(p=>editionSchema.safeParse(p).success);
  issues.forEach((p,i)=>{if(quality[i])return;if(!options.allowUncalibratedReviewDraft||!p.reviewCopy||p.isDemo||p.publishedAt!==null)editionSchema.parse(p);else z.object(editionSchema.shape).strict().parse(p);});
  await mkdir(resolve(outDir, 'fonts'), { recursive: true });
  for (const font of ['NotoSans-Regular.ttf', 'Newsreader.ttf', 'NotoSansTC.ttf',
    'InstrumentSerif-Regular.ttf', 'LibreCaslonText.ttf', 'OldStandard-Bold.ttf', 'PlayfairDisplay.ttf']) {
    await copyFile(resolve('public/fonts', font), resolve(outDir, 'fonts', font));
  }
  for (const license of ['OFL.txt', 'Newsreader.ttf.license.txt', 'NotoSansTC.ttf.license.txt',
    'InstrumentSerif-OFL.txt', 'LibreCaslonText-OFL.txt', 'oldstandardtt-OFL.txt', 'playfairdisplay-OFL.txt']) {
    await copyFile(resolve('public/fonts', license), resolve(outDir, 'fonts', license));
  }
  await promisify(execFile)(process.env.DD_PYTHON || 'python', ['scripts/prepare-print-font.py',resolve(outDir,'fonts')],{timeout:60_000});
  const css = (await readFile('app/globals.css', 'utf8')).replaceAll('/fonts/', 'fonts/');
  const server = await localServer(outDir);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.DD_CHROME || undefined });
  const results = [];
  try {
    const page = await browser.newPage();
    // Print render cannot fetch arbitrary source pages, remote fonts, or model APIs.
    await page.route('**/*', route => new URL(route.request().url()).origin === server.origin ?
      route.continue() : route.abort());
    for (const issue of issues) {
      const payloadPath = resolve(outDir, issue.edition + '.json');
      await writeFile(payloadPath, JSON.stringify(issue, null, 2));
      for (const mode of ['color', 'ink'] as const) {
        const name = `DD_${issue.issueDate}_${issue.edition}_r${issue.revision}_${mode}`;
        await writeFile(resolve(outDir, name + '.html'), '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">' +
          '<style>' + css + '</style><body>' + renderPrint(issue, mode) + '</body></html>');
        await page.goto(`${server.origin}/${name}.html`);
        const layout = await checkPrintLayout(page, editions[issue.edition].minPrintSize, issue.storyCount ?? 8);
        const path = resolve(outDir, name + '.pdf');
        const pdf = await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true });
        const pages=(await PDFDocument.load(pdf)).getPageCount();if(pages<1)throw Error('PDF_PAGE_COUNT');
        results.push({ edition: issue.edition, mode, pages, pagination:issue.storyCount===4?'natural':'fixed',qualityValidated:quality[issues.indexOf(issue)], noOverflow: true,
          textVerified: false, fontsEmbedded: false, revision: issue.revision,
          issueDate: issue.issueDate, templateVersion: issue.templateVersion, contentHash: hash(issue),
          minimumBodyPt: editions[issue.edition].minPrintSize, layout, path, payloadPath });
      }
    }
  } finally { await browser.close(); await server.close(); }
  const manifestPath = resolve(outDir, 'render-manifest.json');
  await writeFile(manifestPath, JSON.stringify(results, null, 2));
  // Python verifies actual PDF text and fonts before any publication flag is true.
  await promisify(execFile)(process.env.DD_PYTHON || 'python', ['scripts/verify-pdfs.py', '--manifest', manifestPath],
    { timeout: 60_000 });
  return results.map(file => ({ ...file, textVerified: true, fontsEmbedded: true }));
}
if (process.argv[1]?.endsWith('render.tsx')) {
  await renderIssues(editionKeys.map(demoIssue), 'output/preview');
  console.log('Verified six DEMO PDFs: two pages, full text, embedded fonts, body sizes and layout.');
}

