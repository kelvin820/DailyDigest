import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

// No user, model, cloud DB or storage credentials. Exercise default read-only mode.
const port=4318,origin=`http://127.0.0.1:${port}`;
let logs='',browser;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
  env:{...process.env,DEMO_MODE:'false',READING_MODE:'',APP_URL:origin,
    NEXT_PUBLIC_SUPABASE_URL:'https://supabase.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'unused',NEXT_TELEMETRY_DISABLED:'1'},
  stdio:['ignore','pipe','pipe'],
});
server.stdout.on('data',d=>{logs+=d;});server.stderr.on('data',d=>{logs+=d;});
const errors=[],externalRequests=[],checks=[];
try {
  for(let n=0;;n++){
    try{if((await fetch(origin,{redirect:'manual'})).status===200)break;}catch{/* startup */}
    if(n===100||server.exitCode!==null)throw Error('PREVIEW_START_FAILED:'+logs);
    await setTimeout(100);
  }
  await mkdir('output/preview-reader-qa',{recursive:true});
  browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(new URL(req.url()).origin!==origin)externalRequests.push(req.url());});
  let date,first;
  for(const edition of ['elementary','junior','senior']){
    const api=await fetch(`${origin}/api/issues/latest?edition=${edition}`);
    assert.equal(api.status,200);const {issue,freshness_status}=await api.json();
    assert.equal(freshness_status,'review');assert.equal(issue.reviewCopy,true);
    assert.equal(issue.isDemo,false);assert.equal(issue.publishedAt,null);assert.equal(issue.articles.length,4);
    date=issue.issueDate;if(!first)first=issue;
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:1000});await page.goto(`${origin}/?edition=${edition}`);
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
      assert.equal(await page.locator('.article').count(),4);
      assert.equal(await page.locator('.body-copy').allTextContents().then(a=>a.join(' ')),issue.articles.map(a=>a.bodyParagraphs.join(' ')).join(' '));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('input[type=password]').count(),0);
      assert.match(await page.locator('.notice').textContent(),/試閱刊.*尚未正式發布/);
      assert.doesNotMatch(await page.locator('.utility').textContent(),/登入|編輯室|試字/);
      await page.screenshot({path:`output/preview-reader-qa/${edition}-${width}.png`,fullPage:true});
    }
    for(const mode of ['color','ink']){
      const pdf=await fetch(`${origin}/api/issues/${date}/pdf?edition=${edition}&mode=${mode}`);
      assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);
      assert.equal((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount(),2);
    }
  }
  checks.push('three real-source four-story editions, nine viewports, all images and six two-page PDF downloads');
  await page.goto(origin+'/?edition=elementary');
  await page.getByRole('button',{name:'讀完了 ○'}).first().click();
  await page.waitForFunction(()=>document.querySelector('progress')?.value===1);
  await page.reload();await page.waitForFunction(()=>document.querySelector('progress')?.value===1);
  await page.getByLabel('本機讀者',{exact:true}).selectOption('reader-2');
  await page.waitForFunction(()=>document.querySelector('progress')?.value===0);
  await page.getByLabel('本機讀者',{exact:true}).selectOption('reader-1');
  await page.waitForFunction(()=>document.querySelector('progress')?.value===1);
  while(await page.getByRole('button',{name:'讀完了 ○'}).count())await page.getByRole('button',{name:'讀完了 ○'}).first().click();
  await page.waitForFunction(()=>document.querySelector('progress')?.value===4);
  assert.equal(await page.getByText('今天的四則，讀完了！').count(),1);
  await page.getByRole('button',{name:/國中版/}).click();await page.waitForURL('**edition=junior');
  await page.goto(origin);await page.waitForURL('**edition=junior');
  await page.getByRole('link',{name:/放大閱讀/}).first().click();await page.waitForURL('**/stories/**');
  assert.equal(await page.locator('.article').count(),1);
  await page.goto(origin+'/issues');assert.match(await page.locator('body').textContent(),/試閱刊/);
  for(const path of ['/login','/admin','/admin/settings',`/admin/issues/${date}`]){
    const response=await fetch(origin+path,{redirect:'manual'});
    assert.equal(response.status,307,path);assert.equal(response.headers.get('location'),'/',path);
  }
  await page.goto(origin+'/login');assert.equal(await page.locator('input[type=password]').count(),0);
  const id='30000000-0000-4000-8000-000000000001';
  for(const path of ['/api/admin/jobs','/api/admin/settings',`/api/admin/jobs/${id}/acknowledge`,
    ...['approve','revise','trial'].map(action=>`/api/admin/revisions/${id}/${action}`)]){
    const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,409,path);assert.equal((await response.json()).error,'PREVIEW_READ_ONLY',path);
  }
  assert.equal((await fetch(origin+'/api/issues/2026-02-30')).status,400);
  assert.equal((await fetch(origin+'/api/issues/2026-11-17')).status,404);
  assert.equal((await fetch(`${origin}/issues/${date}/stories/no-such-story`)).status,404);
  assert.ok(first);assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);
  checks.push('four-story progress, profiles, saved edition, detail, archive, old login redirect; all admin writes refused');
  await writeFile('output/preview-reader-qa/verification.json',JSON.stringify({status:'passed',checks,errors,externalRequests,published:false,databaseWritten:false},null,2));
  console.log('PASS: account-free four-story reading, API, images, PDFs, progress and blocked admin mutations.');
}finally{
  await browser?.close();server.kill('SIGTERM');
  await mkdir('output/preview-reader-qa',{recursive:true});
  await writeFile('output/preview-reader-qa/server.log',logs);
}
