import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
const catalog=JSON.parse(await readFile('content/publications/catalog.json','utf8'));
const dates=[...new Set(catalog.releases.map(r=>r.editions[0].issueDate))].sort().reverse();
const current=[...catalog.releases].sort((a,b)=>b.editions[0].issueDate.localeCompare(a.editions[0].issueDate)||b.editions[0].revision-a.editions[0].revision)[0];
const origin='http://127.0.0.1:4320';let logs='',browser;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','4320','--hostname','127.0.0.1'],{env:{...process.env,DEMO_MODE:'false',READING_MODE:'',APP_URL:origin},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const checks=[],errors=[];
try{
 for(let i=0;;i++){try{if((await fetch(origin,{redirect:'manual'})).status===200)break;}catch{/* startup */}if(i===100)throw Error('APP_START_FAILED:'+logs);await setTimeout(100);}
 browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await mkdir('output/publication-qa',{recursive:true});
 for(const width of [375,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/issues');
  assert.equal(await page.getByRole('link',{name:/\d{4}-\d{2}-\d{2} 已出刊/}).count(),dates.filter(d=>d.slice(0,7)===(dates[0]||new Date().toISOString()).slice(0,7)).length);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`output/publication-qa/calendar-${width}.png`,fullPage:true});
  if(dates.length){await page.getByRole('link',{name:dates[0]+' 已出刊',exact:true}).click();await page.waitForURL('**/issues/'+dates[0]);assert.equal(await page.locator('.article').count(),4);}
 }
 for(const edition of ['elementary','junior','senior']){
  const data=await fetch(origin+'/api/issues/latest?edition='+edition).then(r=>r.json());
  assert.equal(data.issue.articles.length,4);assert.equal(data.issue.reviewCopy,!current);
  if(current)assert.equal(data.issue.issueDate,current.editions[0].issueDate);
  for(const mode of ['color','ink']){const pdf=await fetch(`${origin}/api/issues/${data.issue.issueDate}/pdf?edition=${edition}&mode=${mode}`);assert.equal(pdf.status,200);assert.ok((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount()>=1);}
 }
 for(const p of catalog.packets){
  for(const width of [375,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/review/'+p.id);assert.equal(await page.locator('.article').count(),4);
   for(const name of ['國中版','高中版','小學版']){await page.getByRole('button',{name:new RegExp(name)}).click();assert.equal(await page.locator('.article').count(),4);await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));});}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('input[type=password]').count(),0);
   await page.screenshot({path:`output/publication-qa/review-${p.id}-${width}.png`,fullPage:true});
  }
 }
 await page.goto(origin+'/login');assert.equal(await page.locator('input[type=password]').count(),0);
 const blocked=await fetch(origin+'/api/admin/jobs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,409);
 assert.deepEqual(errors,[]);checks.push('published-only calendar, old issue navigation, default public reader, six PDFs, public review tabs and protected writes');
 await writeFile('output/publication-qa/report.json',JSON.stringify({status:'passed',checks,publishedDates:dates,reviewPackets:catalog.packets.length,pageErrors:errors},null,2));
 console.log('PASS: publication reader, calendar, public review, PDFs and write protection.');
}finally{await browser?.close();server.kill('SIGTERM');}
