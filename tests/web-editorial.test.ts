import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWebJob,advanceWebJob,retryWebPdfs,importReviewPacket,jobKey,jobFingerprint,canPublishWebJob,publishWebJob,releaseKey} from '../lib/editorial/web-jobs';
import {changeDocument,type DocumentStore,WEB_PREFIX} from '../lib/editorial/web-store';
import {webBudget} from '../lib/editorial/web-budget';
import type {WebJob} from '../lib/editorial/web-types';
import type {TextModelProvider,GenerationRequest} from '../lib/providers/text';
import {publicationCatalog} from '../lib/publications/catalog';
import {sourceLibrary} from '../lib/editorial/library';

class MemoryStore implements DocumentStore {
 rows=new Map<string,unknown>();
 async get<T>(key:string){return structuredClone(this.rows.get(key) as T??null);}
 async create<T extends {version:number}>(key:string,value:T){if(this.rows.has(key))return false;this.rows.set(key,structuredClone(value));return true;}
 async compare<T extends {version:number}>(key:string,version:number,value:T){if((this.rows.get(key) as T)?.version!==version)return false;this.rows.set(key,structuredClone(value));return true;}
 async list<T>(prefix:string){return [...this.rows].filter(([k])=>k.startsWith(prefix)).map(([,v])=>structuredClone(v) as T);}
}
const base=publicationCatalog.packets.find(p=>p.id==='2026-11-19-r5')!;
const request=()=>({kind:'regenerate',request:{version:1,base:{kind:'packet',id:base.id,fingerprint:base.fingerprint},storyId:base.facts[0].story_id,mode:'rewrite',category:base.facts[0].primary_category,editions:['junior'],direction:'保留真實來源，讓敘事清楚。'}});
function testProvider(){let calls=0;const provider:TextModelProvider={async generateStructured<T>(r:GenerationRequest<T>){calls++;const old=base.editions.find(i=>i.edition==='junior')!.articles[0];const output=r.task==='review'?{factual_status:'pass',level_fit:'suitable',suitability:'pass',issues:[],publish_recommendation:'pass',readership:{interest:4,information:4,readability:4,reason:'Synthetic test',suggestion:''}}:{headline:'A Saved Review Draft',body_paragraphs:old.bodyParagraphs,vocabulary:old.vocabulary,used_claim_ids:base.facts[0].claims.filter(c=>c.must_keep).map(c=>c.claim_id),omitted_optional_claim_ids:[],editorial_flags:[]};return {data:r.schema.parse(output),usage:{input_tokens:1,output_tokens:1}};}};return{provider,count:()=>calls};}
const render:NonNullable<Parameters<typeof advanceWebJob>[2]>['render']=async(job,edition)=>['color','ink'].map(mode=>({path:`web-editorial/${job.id}/${edition}-${mode}.pdf`,edition,mode:mode as 'color'|'ink',pages:2,sha256:'a'.repeat(64)}));

test('PDF recovery preserves paid model results and refuses jobs with unknown model usage',async()=>{
 process.env.LLM_API_KEY='synthetic-key';const store=new MemoryStore(),id=randomUUID(),api=testProvider();
 await createWebJob(store,id,request());await advanceWebJob(store,id,{provider:api.provider});
 const ready=await advanceWebJob(store,id,{provider:api.provider});assert.equal(api.count(),2);
 const failed=await advanceWebJob(store,id,{render:async()=>{throw Error('PDF_BROWSER_FAILED');}});assert.equal(failed.status,'needs_attention');
 await retryWebPdfs(store,id);for(let i=0;i<3;i++)await advanceWebJob(store,id,{provider:api.provider,render});
 const done=(await store.get<WebJob>(jobKey(id)))!;assert.equal(done.status,'needs_review');assert.equal(api.count(),2);assert.deepEqual(done.editions,ready.editions);
 done.status='needs_attention';done.activeStep='unknown';store.rows.set(jobKey(id),done);
 await assert.rejects(()=>retryWebPdfs(store,id),/PDF_RETRY_NOT_READY/);
});

test('reviewed archive imports preserve exact content and produce PDF-only jobs without requiring a model key',async()=>{
 delete process.env.LLM_API_KEY;const store=new MemoryStore(),id=randomUUID();
 const job=await importReviewPacket(store,id,base.id,base.fingerprint);assert.deepEqual(job.editions,base.editions);assert.deepEqual(job.reviews,base.reviews);
 assert.equal((await importReviewPacket(store,id,base.id,base.fingerprint)).id,id);
 const noModel:TextModelProvider={async generateStructured(){throw Error('MODEL_MUST_NOT_RUN');}};
 for(let i=0;i<3;i++)await advanceWebJob(store,id,{provider:noModel,render});
 assert.equal((await store.get<WebJob>(jobKey(id)))!.status,'needs_review');
 await assert.rejects(()=>importReviewPacket(store,randomUUID(),base.id,'a'.repeat(64)),/STALE_REGENERATION_BASE/);
});

test('database snapshots survive worker invocations, rewriting only the selected level; repeat requests are idempotent',async()=>{
 process.env.LLM_API_KEY='synthetic-key';const store=new MemoryStore(),id=randomUUID(),api=testProvider(),original=JSON.stringify(publicationCatalog);
 const created=await createWebJob(store,id,request());
 assert.equal((await createWebJob(store,id,request())).id,created.id);
 let job=await advanceWebJob(store,id,{provider:api.provider,render});assert.equal(api.count(),1);assert.equal(job.activeStep,null);
 assert.equal(job.status,'running');assert.equal(Object.keys(job.checkpoints).length,1);
 job=await advanceWebJob(store,id,{provider:api.provider,render});assert.equal(api.count(),2);assert.equal(job.editions.length,3);
 for(let n=0;n<3;n++)job=await advanceWebJob(store,id,{provider:api.provider,render});
 assert.equal(job.status,'needs_review');assert.equal(job.pdfs.length,6);assert.equal(api.count(),2);
 await advanceWebJob(store,id,{provider:api.provider,render});assert.equal(api.count(),2);
 assert.equal(job.editions[1].articles[0].headline,'A Saved Review Draft');
 assert.deepEqual(job.editions[0].articles,base.editions[0].articles);assert.deepEqual(job.editions[1].articles.slice(1),base.editions[1].articles.slice(1));
 assert.equal(JSON.stringify(publicationCatalog),original);
 assert.equal(canPublishWebJob(job),true);assert.equal(await store.get(releaseKey(job.issueDate)),null);
 await assert.rejects(()=>publishWebJob(store,id,'0'.repeat(64),true),/REVIEW_VERSION_CHANGED/);
 await assert.rejects(()=>publishWebJob(store,id,jobFingerprint(job),false),/REVIEW_VERSION_CHANGED/);
 const released=await publishWebJob(store,id,jobFingerprint(job),true);assert.equal(released.jobId,id);assert.ok(released.editions.every(i=>i.publishedAt&&!i.reviewCopy));
 assert.equal((await publishWebJob(store,id,jobFingerprint(job),true)).releasedAt,released.releasedAt);
 assert.equal((await store.get<WebJob>(jobKey(id)))!.editions[0].publishedAt,null);
});

test('expired in-flight requests stop for reconciliation instead of spending again; live leases prevent concurrent execution',async()=>{
 process.env.LLM_API_KEY='synthetic-key';const store=new MemoryStore(),id=randomUUID(),api=testProvider();const job=await createWebJob(store,id,request());
 job.activeStep='unconfirmed';job.lease={owner:randomUUID(),expiresAt:Date.now()+10000};store.rows.set(jobKey(id),job);
 assert.equal((await advanceWebJob(store,id,{provider:api.provider})).status,'pending');assert.equal(api.count(),0);
 job.lease.expiresAt=0;store.rows.set(jobKey(id),job);
 const stopped=await advanceWebJob(store,id,{provider:api.provider});assert.equal(stopped.status,'needs_attention');assert.equal(stopped.error,'USAGE_RECONCILIATION_REQUIRED');assert.equal(api.count(),0);
});

test('database compare-and-swap shares daily budgets across concurrent jobs, with unknown usage preserved',async()=>{
 const store=new MemoryStore(),day='2099-01-01';process.env.MAX_MODEL_CALLS='2';
 const ports=[webBudget(store,'one',async()=>{},day),webBudget(store,'two',async()=>{},day),webBudget(store,'three',async()=>{},day)];
 const attempts=await Promise.allSettled(ports.map(p=>p.reserve(10,10)));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,2);
 assert.equal((await store.get<{calls:number}>(WEB_PREFIX+'usage:'+day))!.calls,2);
 const ticket=(attempts[0] as PromiseFulfilledResult<unknown>).value;await ports[0].fail(ticket);
 process.env.MAX_MODEL_CALLS='10';await assert.rejects(()=>Promise.resolve(ports[0].reserve(10,10)),/USAGE_RECONCILIATION_REQUIRED/);
 delete process.env.MAX_MODEL_CALLS;
 const key=WEB_PREFIX+'concurrency';await Promise.all([1,2,3,4].map(()=>changeDocument(store,key,()=>({version:0,count:0}),v=>{v.count++;})));assert.equal((await store.get<{count:number}>(key))!.count,4);
});

test('new edition freezes four actual sources and refuses stale, missing or repeated selections before any model call',async()=>{
 process.env.LLM_API_KEY='synthetic-key';const store=new MemoryStore();
 const ids=base.facts.map(f=>f.story_id);assert.ok(ids.every(id=>sourceLibrary.some(s=>s.id===id)));
 const job=await createWebJob(store,randomUUID(),{kind:'generate',issueDate:'2026-11-19',sourceIds:ids,direction:'Use concrete facts.'});
 assert.equal(job.facts.length,4);assert.equal(job.status,'pending');assert.equal(job.usage.calls,0);
 await assert.rejects(()=>createWebJob(store,randomUUID(),{kind:'generate',issueDate:'2026-12-20',sourceIds:ids}));
 await assert.rejects(()=>createWebJob(store,randomUUID(),{kind:'generate',issueDate:'2026-11-19',sourceIds:[ids[0],ids[0],ids[1],ids[2]]}));
 const failed=structuredClone(job);failed.status='needs_review';assert.equal(canPublishWebJob(failed),false);
});

test('four-story generation can batch three durable steps and retains the same 24 model calls',async()=>{
 process.env.LLM_API_KEY='synthetic-key';const store=new MemoryStore(),id=randomUUID();let calls=0;
 const provider:TextModelProvider={async generateStructured<T>(r:GenerationRequest<T>){
  calls++;const data=r.data as {fact:typeof base.facts[number]},edition=r.system.match(/Audience edition: ([a-z]+)/)?.[1]||'elementary';
  const old=base.editions.find(i=>i.edition===edition)!.articles.find(a=>a.storyId===data.fact.story_id)!;
  const response=r.task==='review'?{factual_status:'pass',level_fit:'suitable',suitability:'pass',issues:[],publish_recommendation:'pass'}:{headline:old.headline,body_paragraphs:old.bodyParagraphs,vocabulary:old.vocabulary,used_claim_ids:data.fact.claims.filter(c=>c.must_keep).map(c=>c.claim_id),omitted_optional_claim_ids:[],editorial_flags:[]};
  return{data:r.schema.parse(response) as T,usage:{input_tokens:1,output_tokens:1}};
 }};
 let job=await createWebJob(store,id,{kind:'generate',issueDate:'2026-11-19',sourceIds:base.facts.map(f=>f.story_id),direction:'Keep source facts.'});
 let invocations=0;for(;invocations<15&&job.status!=='needs_review';invocations++)job=await advanceWebJob(store,id,{provider,render,maxModelSteps:3});
 assert.equal(invocations,11);
 assert.equal(job.error,null);assert.equal(job.status,'needs_review');assert.equal(calls,24);assert.equal(job.reviews.length,12);assert.equal(canPublishWebJob(job),true);
 for(const issue of job.editions)for(const article of issue.articles)assert.deepEqual(article.image,job.imageSnapshots[issue.edition+':'+article.storyId]);
 const before=calls;await advanceWebJob(store,id,{provider,render});assert.equal(calls,before);
});
