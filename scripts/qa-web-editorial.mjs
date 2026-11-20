// Isolated end-to-end proof: real Next.js API + browser + PDF engine, with
// synthetic local Supabase and model responses. Never reads real credentials.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
const catalog=JSON.parse(await readFile('content/publications/catalog.json','utf8')),base=catalog.packets.find(p=>p.id==='2026-11-19-r5');
const rows=new Map(),files=new Map(),checks=[],browserErrors=[];let logs='',app,browser,modelCalls=0;
await mkdir('output/web-editorial',{recursive:true});await mkdir('.runtime',{recursive:true});
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const db=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local'),chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks);
  if((url.pathname.startsWith('/rest/')||url.pathname.startsWith('/storage/'))&&!(req.method==='GET'&&url.pathname.startsWith('/storage/v1/object/sign/')&&url.searchParams.get('token')==='synthetic')){
   if(req.headers.apikey!=='sb_secret_synthetic-database-key'||req.headers.authorization)return json(res,{code:'PGRST301'},401);
  }
  if(url.pathname==='/rest/v1/app_settings'){
   const key=url.searchParams.get('key'),version=url.searchParams.get('value->>version');
   let found=[...rows].filter(([k,v])=>(!key||key.startsWith('eq.')&&k===key.slice(3)||key.startsWith('like.')&&k.startsWith(key.slice(5,-1)))&&(!version||String(v.version)===version.slice(3)));
   if(req.method==='GET'){const data=found.map(([,value])=>({value}));if(req.headers.accept?.includes('object+json'))return data.length?json(res,data[0]):json(res,{code:'PGRST116',details:'The result contains 0 rows'},406);return json(res,data);}
   const value=JSON.parse(bytes.toString());
   if(req.method==='POST'){if(rows.has(value.key))return json(res,{code:'23505'},409);rows.set(value.key,value.value);return json(res,{},201);}
   if(req.method==='PATCH'){for(const [k] of found)rows.set(k,value.value);return json(res,found.map(([key])=>({key})));}
  }
  if(url.pathname.startsWith('/storage/v1/object/')){
   let path=decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
   if(path.startsWith('sign/')){
    path=path.slice(5);
    if(req.method==='POST')return json(res,{signedURL:'/object/sign/'+path+'?token=synthetic'});
   }
   if(req.method==='POST'){files.set(path,bytes);return json(res,{Key:path});}
   if(files.has(path)){res.writeHead(200,{'Content-Type':'application/pdf'});res.end(files.get(path));return;}
   return json(res,{error:'missing'},404);
  }
  if(url.pathname==='/model-call'){modelCalls++;return json(res,{});}
  json(res,{error:'unknown'},404);
 }catch(e){json(res,{error:e.message},500);}
});
await new Promise(r=>db.listen(0,'127.0.0.1',r));const dbOrigin='http://127.0.0.1:'+db.address().port;
const preload=resolve('.runtime/editorial-model-preload.mjs');
await writeFile(preload,`const base=${JSON.stringify(base)};const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{if(String(input)==='https://integrate.api.nvidia.com/v1/chat/completions'){await original('${dbOrigin}/model-call');const b=JSON.parse(init.body),system=b.messages[0].content,data=JSON.parse(b.messages[1].content).untrusted_data;const review=!system.includes('Audience edition:'),edition=system.match(/Audience edition: ([a-z]+)/)?.[1]||'elementary',old=base.editions.find(i=>i.edition===edition).articles.find(a=>a.storyId===data.fact.story_id);const result=review?{factual_status:'pass',level_fit:'suitable',suitability:'pass',issues:[],publish_recommendation:'pass',readership:{interest:4,information:4,readability:4,reason:'Synthetic model response for integration QA',suggestion:''}}:{headline:'A Database Saved Newspaper Story',body_paragraphs:old.bodyParagraphs,vocabulary:old.vocabulary,used_claim_ids:data.fact.claims.filter(c=>c.must_keep).map(c=>c.claim_id),omitted_optional_claim_ids:[],editorial_flags:[]};return Response.json({id:'synthetic',usage:{prompt_tokens:100,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});}return original(input,init);};`);
const origin='http://127.0.0.1:4331';
app=spawn(process.execPath,['--import',pathToFileURL(preload).href,'node_modules/next/dist/bin/next','start','--port','4331','--hostname','127.0.0.1'],{env:{...process.env,DEMO_MODE:'false',READING_MODE:'public',APP_URL:origin,EDITOR_ACTION_SECRET:'synthetic-editor-secret-for-local-qa',LLM_API_KEY:'synthetic-model-key',NEXT_PUBLIC_SUPABASE_URL:dbOrigin,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_synthetic-database-key',DD_CHROME:process.env.DD_CHROME||'',VERCEL:''},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',d=>logs+=d);app.stderr.on('data',d=>logs+=d);
try{
 for(let i=0;;i++){try{if((await fetch(origin+'/api/editorial/status')).ok)break;}catch{}if(i>=100)throw Error('START_FAILED');await delay(200);}
 const unauth=await fetch(origin+'/api/editorial/jobs');assert.equal(unauth.status,401);checks.push('Unauthenticated job reads refused');
 const setupDenied=await fetch(origin+'/api/editorial/setup',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'initialize',confirmedProjectUrl:'https://abcdefghijklmnopqrst.supabase.co',reviewed:true})});assert.equal(setupDenied.status,401);assert.equal(rows.size,0);checks.push('Database initialization refuses anonymous requests before connecting to PostgreSQL');
 browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>browserErrors.push(e.message));
 await page.goto(origin+'/editor/setup');await page.getByLabel('編輯室管理密碼',{exact:true}).fill('incorrect-password');const setupLogin=page.waitForResponse(r=>r.url().endsWith('/api/editorial/setup'));await page.getByRole('button',{name:'檢查新資料庫',exact:true}).click();assert.equal((await setupLogin).status(),401);await page.locator('p[role="alert"]').waitFor();assert.equal(rows.size,0);
 await page.setViewportSize({width:375,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'output/web-editorial/database-setup-375.png',fullPage:true});
 await page.goto(origin+'/editor');await page.getByLabel('管理密碼',{exact:true}).fill('synthetic-editor-secret-for-local-qa');const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/editorial/session')&&r.request().method()==='POST');await page.getByRole('button',{name:'解鎖',exact:true}).click();const login=await loginResponse;assert.equal(login.status(),200,await login.text());await page.getByRole('heading',{name:'製作新一期'}).waitFor();
 for(const width of [375,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`output/web-editorial/desk-${width}.png`,fullPage:true});}
 checks.push('Editor unlock, source picker and responsive layouts');
 await page.goto(origin+'/review/'+base.id);const detail=page.locator('.story-regeneration').first();await detail.locator('summary').first().click();await detail.getByLabel('重生範圍').selectOption('current');await detail.getByLabel('想改善的地方').fill('請保留來源事實，改寫開頭。');await detail.getByRole('button',{name:'重新生成並儲存新稿'}).click();await page.waitForURL('**/editor/jobs/*');
 await page.getByRole('heading',{name:/待你審閱/}).waitFor({timeout:180000});
 const id=new URL(page.url()).pathname.split('/').at(-1),jobResponse=await page.request.get(origin+'/api/editorial/jobs/'+id),data=await jobResponse.json();
 assert.equal(data.job.status,'needs_review');assert.equal(data.job.pdfs.length,6);assert.equal(modelCalls,2);assert.equal(data.job.usage.calls,2);assert.ok(data.canPublish);assert.equal(files.size,6);
 assert.deepEqual(data.job.editions[1].articles,base.editions[1].articles);assert.deepEqual(data.job.editions[0].articles.slice(1),base.editions[0].articles.slice(1));checks.push('Browser → API → two model calls → database checkpoints → six backend PDFs');
 const notPublished=await fetch(origin+'/api/issues/latest?edition=elementary').then(r=>r.json());assert.equal(notPublished.issue.articles[0].headline,base.editions[0].articles[0].headline);
 const privatePdf=await fetch(origin+`/api/editorial/files?id=${id}&edition=elementary&mode=color`);assert.equal(privatePdf.status,401);checks.push('Draft isolated from public home and downloads');
 await page.reload();await page.getByRole('heading',{name:/待你審閱/}).waitFor();assert.equal(modelCalls,2);checks.push('Refresh restores the stored result without repeating model calls');
 for(const edition of ['elementary','junior','senior'])for(const mode of ['color','ink']){const pdf=await page.request.get(origin+`/api/editorial/files?id=${id}&edition=${edition}&mode=${mode}`);assert.equal(pdf.status(),200);const bytes=await pdf.body();assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);await writeFile(`output/web-editorial/${edition}-${mode}.pdf`,bytes);}
 await page.screenshot({path:'output/web-editorial/review-1440.png',fullPage:true});await page.getByLabel('我已檢查這個版本的三版內容與 PDF').check();await page.getByRole('button',{name:'審核通過並發布'}).click();await page.getByText('已儲存發布紀錄，').waitFor();
 await page.goto(origin+'/?edition=elementary');await page.getByRole('heading',{name:'A Database Saved Newspaper Story'}).waitFor();
 const publicPdf=await fetch(origin+`/api/issues/${base.issueDate}/pdf?edition=elementary&mode=color`);assert.equal(publicPdf.status,200);checks.push('Web approval writes release snapshot; public home, calendar and PDF read the database');
 await page.goto(origin+'/issues');await page.getByRole('link',{name:base.issueDate+' 已出刊',exact:true}).waitFor();assert.deepEqual(browserErrors,[]);
 await writeFile('output/web-editorial/verification.json',JSON.stringify({mode:'synthetic-local-services-real-next-browser-and-pdf',checks,modelCalls,files:files.size,browserErrors},null,2));console.log('PASS:',checks.join('; '));
}catch(e){const pages=browser?.contexts().flatMap(c=>c.pages())||[];if(pages[0]){await pages[0].screenshot({path:'output/web-editorial/failure.png',fullPage:true});await writeFile('output/web-editorial/failure.txt',await pages[0].locator('body').innerText());}await writeFile('output/web-editorial/failure.log',logs+'\n'+e.stack);throw e;}finally{await browser?.close();app?.kill();db.close();}
