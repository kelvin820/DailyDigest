import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const origin=process.env.DD_LIVE_ORIGIN||'https://daily-digest-wine-two.vercel.app';
const catalog=JSON.parse(await readFile('content/publications/catalog.json','utf8'));
const reports=JSON.parse(await readFile('content/benchmarks/index.json','utf8')).runs;
const current=[...catalog.releases].sort((a,b)=>b.editions[0].issueDate.localeCompare(a.editions[0].issueDate)||b.editions[0].revision-a.editions[0].revision)[0];
const directory='output/live-editorial-review';await mkdir(directory,{recursive:true});
for(const edition of ['elementary','junior','senior']){
 const response=await fetch(origin+'/api/issues/latest?edition='+edition);assert.equal(response.status,200);
 const data=await response.json();assert.deepEqual(data.issue,current.editions.find(i=>i.edition===edition));
}
const downloaded=[];
for(const report of reports)for(const file of report.pdfFiles){
 const response=await fetch(origin+file.path);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.equal((await PDFDocument.load(bytes)).getPageCount(),file.pages);downloaded.push({path:file.path,pages:file.pages,sha256:file.sha256});
}
const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
const browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined,...(proxy?{proxy:{server:proxy}}:{})});
const errors=[];
try{
 // The managed workspace proxy's CA is not in Chromium's store. Node fetch above
 // independently verifies TLS and the bytes of every public review PDF.
 const page=await browser.newPage({ignoreHTTPSErrors:!!proxy});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);assert.ok(await page.getByRole('link',{name:'出刊審核',exact:true}).isVisible());
 await page.getByRole('link',{name:'出刊審核',exact:true}).click();await page.waitForURL('**/review');assert.equal(new URL(page.url()).pathname,'/review');
 for(const report of reports){
  for(const width of [375,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/review/benchmarks/'+report.id);
   for(const round of report.rounds){
    await page.getByLabel('比較輪次').selectOption(String(round.number));
    for(const [name,key]of [['小學版','elementary'],['國中版','junior'],['高中版','senior']]){
     await page.getByRole('button',{name:new RegExp(name)}).click();assert.equal(await page.locator('.article').count(),4);
     const text=await page.locator('.review-paper').innerText();for(const draft of round.drafts.filter(d=>d.edition===key&&d.article))assert.ok(text.includes(draft.article.headline));
    }
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('input[type=password]').count(),0);assert.equal(await page.locator('.review-publish').count(),0);
   await page.screenshot({path:`${directory}/${report.id}-${width}.png`});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(directory+'/report.json',JSON.stringify({status:'passed',origin,currentPublishedPacket:current.packetId,publishedFingerprint:current.fingerprint,comparisons:reports.map(r=>r.id),verifiedPDFs:downloaded,pageErrors:errors,browserProxyCertificateException:!!proxy,nodeTlsAndPdfHashesVerified:true},null,2));
 console.log('PASS: live public review, all rounds and levels, PDF hashes and unchanged published issue.');
}finally{await browser.close();}
