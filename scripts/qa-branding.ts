// Local visual verification only: no model requests, cloud storage or publication.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {chromium} from 'playwright';
import {renderWebPdfs} from '../lib/pdf/vercel';
import type {WebJob} from '../lib/editorial/web-types';
import type {EditionView} from '../lib/schemas/edition';
const origin='http://127.0.0.1:4326',output='output/branding-qa';
await mkdir(output,{recursive:true});
let logs='',browser;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','4326'],{env:{...process.env,DEMO_MODE:'false',READING_MODE:'preview',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
server.stdout?.on('data',d=>logs+=d);server.stderr?.on('data',d=>logs+=d);
const issues:EditionView[]=[],errors:string[]=[],pdfs=[],views=[];
try{
 for(let i=0;;i++){try{if((await fetch(origin)).ok)break;}catch{}if(i>100||server.exitCode!==null)throw Error('START_FAILED:'+logs);await setTimeout(200);}
 browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const edition of ['elementary','junior','senior'] as const){
  const response=await fetch(origin+'/api/issues/latest?edition='+edition);assert.equal(response.status,200);
  const {issue}=await response.json();issues.push(issue);
  for(const width of [375,768,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/?edition='+edition);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('.brand-home .brand-dark').count(),1);assert.equal(await page.locator('footer .brand-light').count(),1);
   assert.equal(await page.locator('.article').count(),4);
   assert.ok(await page.locator('.brand-home .brand-logo').evaluate((img:HTMLImageElement)=>img.naturalWidth>0));
   await page.screenshot({path:output+'/'+edition+'-'+width+'.png',fullPage:true});views.push({edition,width});
  }
 }
 await page.setViewportSize({width:375,height:1000});await page.goto(origin+'/editor');
 assert.equal(await page.locator('.editor-brand .brand-mark').count(),1);
 await page.screenshot({path:output+'/editor-mobile.png',fullPage:true});
 const icon=await fetch(origin+'/icon.png');assert.equal(icon.status,200);
 await browser.close();browser=undefined;
 const job={id:'branding-local-check',editions:issues,pdfs:[]} as unknown as WebJob;
 for(const issue of issues)pdfs.push(...await renderWebPdfs(job,issue.edition,async(path,bytes)=>{await writeFile(output+'/'+path.split('/').at(-1),bytes);}));
 assert.equal(pdfs.length,6);assert.deepEqual(errors,[]);
 await writeFile(output+'/verification.json',JSON.stringify({status:'passed',views,pdfs,errors,cloudWrites:false,modelCalls:0},null,2));
 console.log('PASS: nine responsive reader views, editor branding, favicon, six isolated backend PDFs; no cloud writes or model calls.');
}finally{await browser?.close();server.kill('SIGTERM');await writeFile(output+'/server.log',logs);}
