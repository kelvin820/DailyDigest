import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { localServer } from '../lib/pdf/local-server.mjs';
import { checkPrintLayout } from '../lib/pdf/print-checks.mjs';

// Fault injection only in the test browser and .runtime; accepted PDFs are never overwritten.
const manifest=JSON.parse(await readFile('output/preview/render-manifest.json','utf8'));
const server=await localServer('output/preview');
const browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});
const checks=[];
try{
  const page=await browser.newPage();
  const url=server.origin+'/DD_2026-11-17_elementary_r1_color.html';
  await page.goto(url);await checkPrintLayout(page,13);
  await page.locator('.body-copy').first().evaluate(e=>{e.style.fontSize='8pt'});
  await assert.rejects(checkPrintLayout(page,13),/PDF_BODY_TOO_SMALL/);checks.push('undersize body refused');
  await page.goto(url);await page.locator('.print-article h2').first().evaluate(e=>{e.textContent='Long headline '.repeat(80)});
  await assert.rejects(checkPrintLayout(page,13),/PDF_OVERFLOW/);checks.push('long headline overflow refused');
  await page.goto(url);await page.locator('.print-article figure svg').first().evaluate(e=>e.remove());
  await assert.rejects(checkPrintLayout(page,13),/PDF_MISSING_IMAGE/);checks.push('missing image refused');
  await page.goto(url);await checkPrintLayout(page,13);
  await page.locator('.body-copy').first().evaluate(e=>{e.style.display='none'});
  await mkdir('.runtime/pdf-negative',{recursive:true});
  const path=resolve('.runtime/pdf-negative/missing-body.pdf');
  await page.pdf({path,format:'A4',printBackground:true,preferCSSPageSize:true});
  const bad=structuredClone(manifest);bad[0].path=path;bad[0].textVerified=false;
  const proof=resolve('.runtime/pdf-negative/render-manifest.json');
  await writeFile(proof,JSON.stringify(bad));
  assert.throws(()=>execFileSync(process.env.DD_PYTHON||'python',['scripts/verify-pdfs.py','--manifest',proof],
    {stdio:'pipe'}),error=>String(error.stderr).includes('missing body'));
  checks.push('actual PDF missing body refused by extraction');
  await writeFile('output/pdf-fault-verification.json',JSON.stringify({mode:'fault-injection-only',checks},null,2));
  console.log('PASS: tiny body, long headline overflow, missing image, missing PDF text all refused.');
}finally{await browser.close();await server.close()}
