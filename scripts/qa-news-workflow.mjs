// Real browser, Next.js, Workflow durable runtime and PDF engine. External
// RSS, models and Supabase are deterministic synthetic services, never real keys.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
const base=JSON.parse(await readFile('content/publications/catalog.json','utf8')).packets.find(p=>p.id==='2026-11-19-r5');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const rows=new Map(),files=new Map(),counts={select:0,facts:0,write:0,review:0,images:0},errors=[];let app,browser,logs='',pdfUploadRejectedOnce=false;
await mkdir('output/news-workflow',{recursive:true});await mkdir('.runtime',{recursive:true});
const fixtureImage=await sharp({create:{width:640,height:420,channels:3,background:'#f3e3c2'}}).composite([{input:Buffer.from('<svg width="640" height="420"><circle cx="200" cy="180" r="120" fill="#648f75"/><path d="M0 300L640 170V420H0Z" fill="#8aa7bd"/></svg>')}]).png().toBuffer();
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const db=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),parts=[];for await(const p of req)parts.push(p);const bytes=Buffer.concat(parts);
 if(url.pathname==='/calls'){const c=JSON.parse(bytes);counts[c.type]++;return json(res,{count:counts[c.type]});}
 if(url.pathname==='/rest/v1/app_settings'){
  assert.equal(req.headers.apikey,'sb_secret_news-test');assert.equal(req.headers.authorization,undefined);
  const key=url.searchParams.get('key'),version=url.searchParams.get('value->>version');
  const found=[...rows].filter(([k,v])=>(!key||key.startsWith('eq.')&&k===key.slice(3)||key.startsWith('like.')&&k.startsWith(key.slice(5,-1)))&&(!version||String(v.version)===version.slice(3)));
  if(req.method==='GET'){const out=found.map(([,value])=>({value}));return req.headers.accept?.includes('object+json')?out.length?json(res,out[0]):json(res,{code:'PGRST116'},406):json(res,out);}
  const body=JSON.parse(bytes);if(req.method==='POST'){if(rows.has(body.key))return json(res,{code:'23505'},409);rows.set(body.key,body.value);return json(res,{},201);}
  if(req.method==='PATCH'){for(const [k] of found)rows.set(k,body.value);return json(res,found.map(([key])=>({key})));}
 }
 if(url.pathname.startsWith('/storage/v1/object/')){
  let path=decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
  if(path.startsWith('sign/')){path=path.slice(5);if(req.method==='POST')return json(res,{signedURL:'/object/sign/'+path+'?token=synthetic'});}
  if(req.method==='POST'){if(path.endsWith('.pdf')&&!pdfUploadRejectedOnce){pdfUploadRejectedOnce=true;return json(res,{error:'synthetic transient storage failure'},503);}files.set(path,bytes);return json(res,{Key:path});}
  if(files.has(path)){res.writeHead(200,{'Content-Type':path.endsWith('.pdf')?'application/pdf':path.endsWith('.webp')?'image/webp':'image/jpeg'});return res.end(files.get(path));}
  return json(res,{error:'not found'},404);
 }
 json(res,{error:'not found'},404);
}catch(e){json(res,{error:e.message},500);}});
await new Promise(r=>db.listen(0,'127.0.0.1',r));const dbOrigin='http://127.0.0.1:'+db.address().port,origin='http://127.0.0.1:4332';
const preload=resolve('.runtime/news-model-preload.mjs');
await writeFile(preload,`
import https from 'node:https';import dns from 'node:dns/promises';import {syncBuiltinESMExports} from 'node:module';import{EventEmitter}from'node:events';import{Readable}from'node:stream';
const OriginalDate=Date,clockOffset=${Date.parse(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T12:00:00+08:00')-Date.now()};function TestDate(...args){if(!new.target)return new OriginalDate(OriginalDate.now()+clockOffset).toString();return args.length?new OriginalDate(...args):new OriginalDate(OriginalDate.now()+clockOffset);}TestDate.prototype=OriginalDate.prototype;TestDate.now=()=>OriginalDate.now()+clockOffset;TestDate.parse=OriginalDate.parse;TestDate.UTC=OriginalDate.UTC;globalThis.Date=TestDate;
const base=${JSON.stringify(base)},image=${JSON.stringify(fixtureImage.toString('base64'))},hosts=['feeds.bbci.co.uk','www.bbc.com','www.bbc.co.uk','www.theguardian.com','www.smithsonianmag.com','globalvoices.org'];
const oldLookup=dns.lookup,oldRequest=https.request,realFetch=globalThis.fetch;
dns.lookup=async function(host,...args){if(hosts.includes(host))return [{address:'93.184.216.34',family:4}];return oldLookup.call(this,host,...args);};
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
https.request=function(input,options,callback){const u=new URL(input),host=options?.headers?.Host||u.hostname;if(!hosts.includes(host))return oldRequest.call(this,input,options,callback);const emitter=new EventEmitter();emitter.end=()=>queueMicrotask(()=>{
 let text,mime='text/html';if(u.pathname==='/robots.txt'){text='User-agent: *\\nAllow: /';mime='text/plain';}
 else if(!u.pathname.includes('/fixture/')){const domain=host==='feeds.bbci.co.uk'?'www.bbc.com':host;const group=domain.includes('bbc')?0:domain.includes('guardian')?1:domain.includes('smithsonian')?2:3;text='<rss><channel>'+Array.from({length:12},(_,i)=>{const n=group*100+i;return '<item><title>Fixture reported story '+n+'</title><link>https://'+domain+'/fixture/'+n+'</link><pubDate>'+new Date(Date.now()-3600000-i*1000).toUTCString()+'</pubDate><description>A concrete recent discovery reported with verifiable details.</description></item>';}).join('')+'</channel></rss>';mime='application/rss+xml';}
 else{const n=Number(u.pathname.split('/').at(-1)),index=Math.floor(n/100)%4,evidence=base.facts[index].sources.map(s=>s.evidence).join(' ');text='<html><head><meta name="author" content="Fixture Contributor"></head><body><article>'+evidence.split('\\n').filter(Boolean).map(p=>'<p>'+escape(p)+'</p>').join('')+'<p>This synthetic article exists only to verify the application workflow and storage behavior.</p></article></body></html>';}
 const response=Readable.from([Buffer.from(text)]);response.statusCode=200;response.headers={'content-type':mime};callback(response);
 });return emitter;};syncBuiltinESMExports();
globalThis.fetch=async function(input,init){const url=String(input);
 if(url.startsWith('https://ai.api.nvidia.com/v1/genai/')){const receipt=await realFetch('${dbOrigin}/calls',{method:'POST',body:JSON.stringify({type:'images'})}).then(r=>r.json());if(receipt.count===1)return Response.json({artifacts:[{finishReason:'CONTENT_FILTERED'}]});return Response.json({artifacts:[{base64:image,finishReason:'SUCCESS'}]});}
 if(url==='https://integrate.api.nvidia.com/v1/chat/completions'){
  const request=JSON.parse(init.body),system=request.messages[0].content,data=JSON.parse(request.messages[1].content).untrusted_data;let result,type;
  if(system.startsWith('You are the DayDay newspaper assignment editor')){
   type='select';const picked=[],seen=new Set();for(const c of data.candidates){if(!seen.has(c.publisher)){picked.push(c);seen.add(c.publisher);}}for(const c of data.candidates){if(picked.length>=10)break;if(!picked.some(p=>p.id===c.id))picked.push(c);}
   result={stories:picked.map((c,i)=>({id:c.id,titleZh:'測試故事 '+c.title.split(' ').at(-1),summaryZh:'有根據的近期故事摘要。',whyZh:'具體、有趣且與生活相關。',category:['science','nature','culture','technology'][i%4],eventKey:'fixture-event-'+c.id,score:95-i})),recommendedIds:picked.slice(0,4).map(c=>c.id)};
  }else if(system.startsWith('Extract a small factual brief')){
   type='facts';const n=Number(data.title.split(' ').at(-1)),index=Math.floor(n/100)%4,quotes=data.articleText.slice(0,180),claims=base.facts[index].claims.slice(0,2);
   result={claims:claims.map((c,i)=>({text:c.text,quote:quotes,core:i===0,status:c.status})),eventDate:null,uncertainties:[],sensitivity:'low'};
  }else{
   const edition=system.match(/Audience edition: ([a-z]+)/)?.[1],index=base.facts.findIndex(f=>f.claims.some(c=>c.text===data.fact.claims[0].text));
   if(edition){type='write';const article=base.editions.find(i=>i.edition===edition).articles[Math.max(0,index)];result={headline:article.headline,body_paragraphs:article.bodyParagraphs,vocabulary:article.vocabulary,used_claim_ids:data.fact.claims.filter(c=>c.must_keep).map(c=>c.claim_id),omitted_optional_claim_ids:[],editorial_flags:[]};}
   else{type='review';result={factual_status:'pass',level_fit:'suitable',suitability:'pass',issues:[],publish_recommendation:'pass'};}
  }
  await realFetch('${dbOrigin}/calls',{method:'POST',body:JSON.stringify({type})});return Response.json({id:'synthetic-news',usage:{prompt_tokens:100,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
 }return realFetch(input,init);
};`);
app=spawn(process.execPath,['--import',pathToFileURL(preload).href,'node_modules/next/dist/bin/next','start','--port','4332','--hostname','127.0.0.1'],{env:{...process.env,APP_URL:origin,CRON_SECRET:'synthetic-news-cron-key-for-qa',EDITOR_ACTION_SECRET:'synthetic-news-editor-password-for-qa',LLM_API_KEY:'synthetic-news-model',NEXT_PUBLIC_SUPABASE_URL:dbOrigin,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_news-test',WORKFLOW_LOCAL_BASE_URL:origin,WORKFLOW_LOCAL_DATA_DIR:resolve('.runtime/news-workflow-'+randomUUID()),WORKFLOW_TARGET_WORLD:'local',VERCEL:'',PORT:'4332'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',d=>logs+=d);app.stderr.on('data',d=>logs+=d);
try{
 for(let i=0;;i++){try{if((await fetch(origin+'/api/editorial/status')).ok)break;}catch{}if(i>100)throw Error('START_FAILED');await delay(200);}
 browser=await chromium.launch({executablePath:process.env.DD_CHROME||undefined});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await fetch(origin+'/api/internal/pdf',{method:'POST',body:'{}'})).status,401);assert.equal((await fetch(origin+'/api/editorial/news')).status,401);assert.equal((await fetch(origin+'/api/cron/daily')).status,401);
 await page.goto(origin+'/editor');await page.getByLabel('管理密碼',{exact:true}).fill('synthetic-news-editor-password-for-qa');await page.getByRole('button',{name:'解鎖',exact:true}).click();
 await page.locator('.news-story').nth(9).waitFor({timeout:120000});assert.equal(await page.locator('.news-story').count(),10);assert.equal(counts.select,1);
 await page.getByRole('button',{name:'LLM 幫我選四篇'}).click();await page.getByText('四篇選題已儲存，可立即生成。',{exact:true}).waitFor();
 const check=page.locator('.news-story input').first();await check.click();await page.getByText('選擇已儲存；未選滿四篇時，排程由 LLM 自動選題。',{exact:true}).waitFor();assert.equal(await check.isChecked(),false);await check.click();await page.getByText('四篇選題已儲存，可立即生成。',{exact:true}).waitFor();assert.equal(await check.isChecked(),true);
 console.log('PASS: source pool, ten-story shortlist and persisted manual selection');
 for(const width of [375,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'output/news-workflow/shortlist-'+width+'.png',fullPage:true});}
 await page.getByRole('button',{name:'以這四篇生成三種程度'}).click();await page.waitForURL('**/editor/jobs/*',{timeout:120000});const id=page.url().split('/').at(-1);await page.close();
 console.log('Closed browser page; checking background execution');
 let job;
 for(let i=0;i<180;i++){
  const response=await context.request.get(origin+'/api/editorial/jobs/'+id);assert.equal(response.status(),200);job=(await response.json()).job;
  if(job.status==='needs_attention')throw Error('JOB_FAILED:'+job.error);
  if(job.status==='needs_review')break;
  await delay(2000);
 }
 assert.equal(job.status,'needs_review');assert.equal(job.facts.length,4);assert.equal(job.pdfs.length,6);assert.equal(counts.select,1);assert.equal(counts.facts,4);assert.equal(counts.write,12);assert.equal(counts.review,12);assert.equal(counts.images,13);assert.equal(Object.values(job.imageStates).filter(s=>s==='done').length,12);
 console.log('PASS: background completed twelve stories, twelve images and six PDFs');
 const currentNews=await context.request.get(origin+'/api/editorial/news').then(r=>r.json());const earlier=await context.request.post(origin+'/api/editorial/news',{headers:{origin},data:{action:'settings',settings:{...currentNews.settings,selectionTime:'00:00',publishTime:'02:00'}}});assert.equal(earlier.status(),200,await earlier.text());
 const before={...counts},body={action:'schedule',issueDate:today};
 const schedule=await context.request.post(origin+'/api/editorial/news',{headers:{origin},data:body});assert.equal(schedule.status(),200,await schedule.text());const run=(await schedule.json()).runId;
 const again=await context.request.post(origin+'/api/editorial/news',{headers:{origin},data:body});assert.equal((await again.json()).runId,run);
 let release;
 for(let i=0;i<90;i++){release=[...rows.values()].find(r=>r.issueDate===today&&r.approvalMethod==='scheduled_auto');if(release)break;await delay(2000);}
 assert.ok(release,'Scheduled automatic release did not complete');assert.equal(release.jobId,id);assert.deepEqual(counts,before);assert.equal(release.pdfs.length,6);
 const publicIssue=await fetch(origin+'/api/issues/latest?edition=junior').then(r=>r.json());assert.equal(publicIssue.issue.reviewCopy,false);assert.equal(publicIssue.issue.articles.length,4);
 for(const image of publicIssue.issue.articles.map(a=>a.image)){assert.equal((await fetch(origin+image.rendition.webPath)).status,200);}
 for(const file of release.pdfs){const r=await fetch(origin+'/api/issues/'+today+'/pdf?edition='+file.edition+'&mode='+file.mode);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);await writeFile('output/news-workflow/'+file.edition+'-'+file.mode+'.pdf',bytes);}
 assert.ok(pdfUploadRejectedOnce);assert.ok([...rows.keys()].some(k=>k.includes('pdf:render:')));assert.deepEqual(errors,[]);await writeFile('output/news-workflow/verification.json',JSON.stringify({syntheticExternalServices:true,realBrowser:true,realWorkflow:true,realPdf:true,privatePdfWorker:true,recoveredPdfUpload:true,shortlist:10,manualSelectionSaved:true,continuedAfterPageClosed:true,automaticRelease:true,idempotentSchedule:true,counts,files:files.size,browserErrors:errors},null,2));
 console.log('PASS: pool → LLM shortlist → manual selection → closed page → durable workflow → 12 stories + 12 images + six PDFs → idempotent automatic release → public assets and downloads');
}catch(e){await writeFile('output/news-workflow/failure.log',logs+'\n'+e.stack);await writeFile('output/news-workflow/failure-state.json',JSON.stringify({counts,jobs:[...rows.values()].filter(r=>r.checkpoints)},null,2));throw e;}
finally{await browser?.close();app?.kill();db.close();}
