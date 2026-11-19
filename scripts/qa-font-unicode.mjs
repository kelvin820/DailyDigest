import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {chromium} from 'playwright';
import {localServer} from '../lib/pdf/local-server.mjs';
const run=promisify(execFile),directory=resolve('output/qa-font-unicode'),source='public/fonts/NotoSans-Regular.ttf';
const original=await readFile(source),probe='原住民的 人民 中子星';
await mkdir(resolve(directory,'fonts'),{recursive:true});await copyFile(source,resolve(directory,'fonts/probe.ttf'));
await run(process.env.DD_PYTHON||'python',['scripts/prepare-print-font.py',resolve(directory,'fonts')]);
await writeFile(resolve(directory,'index.html'),`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Probe;src:url('fonts/probe.ttf')}p{font:18pt Probe}</style><p>${probe}</p>`);
const server=await localServer(directory),browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});
try{const page=await browser.newPage();await page.goto(server.origin+'/index.html');await page.evaluate(()=>document.fonts.ready);
 const pdf=resolve(directory,'unicode.pdf');await page.pdf({path:pdf});
 await run(process.env.DD_PYTHON||'python',['-c',"import sys,re,unicodedata;from pypdf import PdfReader;n=lambda s:re.sub(r'\\s+','',unicodedata.normalize('NFKC',s));assert n(sys.argv[2]) in n(''.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))",pdf,probe]);
 assert.deepEqual(await readFile(source),original);await writeFile(resolve(directory,'verification.json'),JSON.stringify({status:'passed',probe,sourceFontUnchanged:true,actualPdfTextVerified:true}));
 await run(process.env.DD_PYTHON||'python',['scripts/subset-preview-fonts.py',directory]);console.log('PASS: actual PDF preserves Chinese words; original source font unchanged.');
}finally{await browser.close();await server.close();}
