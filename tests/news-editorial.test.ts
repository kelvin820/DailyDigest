import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseNewsFeed,validateShortlist,refreshNewsRound,selectNews,extractNewsFact,originalQuote} from '../lib/editorial/news';
import {defaultNewsSettings,newsSources,newsSettingsSchema,newsRoundKey,newsPlanKey,saveNewsSettings,scheduleTimes,type NewsCandidate,type NewsRound,type NewsPlan} from '../lib/editorial/news-config';
import {prepareScheduledJob,publishScheduledJob} from '../lib/editorial/news-schedule';
import {importReviewPacket,advanceWebJob,jobKey,jobFingerprint,releaseKey} from '../lib/editorial/web-jobs';
import type {WebJob,WebRelease} from '../lib/editorial/web-types';
import type {DocumentStore} from '../lib/editorial/web-store';
import type {TextModelProvider} from '../lib/providers/text';
import {publicationCatalog} from '../lib/publications/catalog';
import {createBackfill,previousSevenDays,campaignKey,type BackfillCampaign} from '../lib/editorial/backfill';
import {webBudget} from '../lib/editorial/web-budget';
import {parseGuardianArchive,articleDates} from '../lib/editorial/news-archive';
class Memory implements DocumentStore{
 rows=new Map<string,unknown>();
 async get<T>(key:string){return structuredClone(this.rows.get(key)??null) as T|null;}
 async create<T extends {version:number}>(key:string,value:T){if(this.rows.has(key))return false;this.rows.set(key,structuredClone(value));return true;}
 async compare<T extends {version:number}>(key:string,version:number,value:T){if((this.rows.get(key) as T)?.version!==version)return false;this.rows.set(key,structuredClone(value));return true;}
 async list<T>(prefix:string){return [...this.rows].filter(([k])=>k.startsWith(prefix)).map(([,v])=>structuredClone(v) as T);}
}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const candidates=():NewsCandidate[]=>Array.from({length:10},(_,i)=>({id:String(i).padStart(64,'a'),sourceId:'bbc-world',publisher:'BBC',title:'Interesting reported story '+i,url:'https://www.bbc.com/news/articles/'+i,publishedAt:new Date(Date.now()-3600000).toISOString(),excerpt:'A verified discovery and its concrete details.',category:['world','culture','nature'][i%3] as NewsCandidate['category']}));
const rank=(items:NewsCandidate[])=>({stories:items.map((c,i)=>({id:c.id,titleZh:'故事 '+i,summaryZh:'有來源的新聞摘要',whyZh:'具體而有趣的發現',category:c.category,eventKey:'distinct-event-'+i,score:90-i})),recommendedIds:items.slice(0,4).map(c=>c.id)});
async function readyRound(store:Memory){const id=randomUUID(),items=candidates(),round:NewsRound={version:1,id,issueDate:today(),createdAt:new Date().toISOString(),settings:structuredClone(defaultNewsSettings),status:'ready',candidates:items.map((c,i)=>({...c,...rank(items).stories[i]})),recommendedIds:items.slice(0,4).map(c=>c.id),failures:[],usage:{calls:1,inputTokens:50,outputTokens:50}};await store.create(newsRoundKey(id),round);return round;}

test('live RSS rejects private/unapproved URLs, entities and stale/future articles; descriptions are inert text',()=>{
 const at=new Date(),date=at.toUTCString(),source=newsSources[0];
 const entry=(url:string,time=date)=>`<item><title>A real discovery</title><link>${url}</link><pubDate>${time}</pubDate><description><![CDATA[<b>Useful</b> details]]></description></item>`;
 const result=parseNewsFeed('<rss><channel>'+entry('https://www.bbc.com/news/articles/abc?utm_source=x')+entry('https://127.0.0.1/private')+entry('https://evil.example/article')+entry('https://www.bbc.com/news/old',new Date(at.valueOf()-9*86400000).toUTCString())+entry('https://www.bbc.com/news/future',new Date(at.valueOf()+86400000).toUTCString())+'</channel></rss>',source,at);
 assert.equal(result.length,1);assert.equal(result[0].url,'https://www.bbc.com/news/articles/abc');assert.equal(result[0].excerpt,'Useful details');
 assert.throws(()=>parseNewsFeed('<!DOCTYPE rss><rss/>',source),/UNSAFE_FEED/);
});
test('shortlist accepts only 8–10 real distinct events and four real recommendations',()=>{
 const items=candidates(),r=rank(items);assert.equal(validateShortlist(r,items,defaultNewsSettings).candidates.length,10);
 assert.throws(()=>validateShortlist({...r,recommendedIds:['invented',...r.recommendedIds.slice(1)]},items,defaultNewsSettings),/INVALID_NEWS_SELECTION/);
 const duplicate=structuredClone(r);duplicate.stories[1].eventKey=duplicate.stories[0].eventKey;assert.throws(()=>validateShortlist(duplicate,items,defaultNewsSettings),/INVALID_NEWS_SELECTION/);
 assert.equal(newsSettingsSchema.safeParse({...defaultNewsSettings,sourceIds:['unknown']}).success,false);
});
test('shortlist is saved in the database, repeated request does not call the model again, and source failures stay visible',async()=>{
 const store=new Memory(),items=candidates(),id=randomUUID();let calls=0;
 const provider:TextModelProvider={async generateStructured(r){calls++;return {data:r.schema.parse(rank(items)),usage:{input_tokens:10,output_tokens:10}};}};
 const collect=async()=>({candidates:items,failures:[{source:'unavailable feed',code:'SOURCE_HTTP_503'}]});
 const a=await refreshNewsRound(store,today(),id,{provider,collect}),b=await refreshNewsRound(store,today(),id,{provider,collect});
 assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.status,'ready');assert.equal(a.failures.length,1);assert.equal((await store.get<NewsPlan>(newsPlanKey(today())))!.roundId,id);
});
test('daily scheduling uses saved manual choices, otherwise LLM choices; an existing failed job is preserved without a second generation',async()=>{
 process.env.LLM_API_KEY='synthetic';
 for(const manual of [true,false]){
  const store=new Memory(),round=await readyRound(store),ids=round.candidates.slice(5,9).map(c=>c.id);
  await selectNews(store,today(),round.id,manual?ids:ids.slice(0,2));
  let refreshes=0;const plan=await prepareScheduledJob(store,today(),{refresh:async()=>{refreshes++;return readyRound(store);}});assert.equal(refreshes,manual?0:1);assert.equal(plan.skip,false);if(plan.skip)throw Error('Unexpected skip');
  const job=(await store.get<WebJob>(jobKey(plan.id)))!;assert.equal(job.input.kind,'news');assert.deepEqual(job.intakeCandidates!.map(c=>c.id),manual?ids:round.recommendedIds);assert.equal(job.execution,'workflow');assert.equal(job.usage.calls,0);
  job.status='needs_attention';job.activeStep='unknown-paid-request';store.rows.set(jobKey(job.id),job);
  const resumed=await prepareScheduledJob(store,today());assert.equal(resumed.skip,false);if(!resumed.skip)assert.equal(resumed.id,job.id);
 }
 const store=new Memory();await saveNewsSettings(store,{...defaultNewsSettings,autoEnabled:false});assert.deepEqual(await prepareScheduledJob(store,today()),{skip:true});
 assert.deepEqual(scheduleTimes('2026-11-21','12:00','09:00'),{publishAt:'2026-11-21T04:00:00.000Z',prepareAt:'2026-11-21T01:00:00.000Z'});
 assert.equal(defaultNewsSettings.selectionTime,'09:00');assert.equal(defaultNewsSettings.publishTime,'12:00');
 assert.equal(newsSettingsSchema.safeParse({...defaultNewsSettings,selectionTime:'12:00'}).success,false);
});
test('fact extraction rejects invented evidence and keeps unknown event dates unknown',async()=>{
 const c=candidates()[0],quote='Researchers reported a new finding after observing animals for several weeks.';
 const read={text:quote+' More details were reported in the study.',url:c.url,author:'',readAt:new Date().toISOString(),source:newsSources[0]};
 const provider=(evidence:string):TextModelProvider=>({async generateStructured(r){return {data:r.schema.parse({claims:[{text:'Researchers reported a finding.',quote:evidence,core:true,status:'reported'},{text:'The study involved animals.',quote:evidence,core:false,status:'reported'}],eventDate:null,uncertainties:[],sensitivity:'low'}),usage:{input_tokens:10,output_tokens:10}};}});
 const fact=await extractNewsFact(c,read,provider(quote),'synthetic');assert.equal(fact.event_date,null);assert.equal(fact.sources[0].evidence,quote);
 await assert.rejects(()=>extractNewsFact(c,read,provider('This invented quote does not occur anywhere in the actual article.'),'synthetic'),/NEWS_EVIDENCE_MISMATCH/);
});
test('typographic quote matching restores the exact original source span without accepting paraphrases',()=>{
 const original='Children’s exposure to wood-burning could be as significant as traffic exhaust.';
 assert.equal(originalQuote('😊 A source paragraph. '+original,"Children's exposure to wood-burning could be as significant as traffic exhaust."),original);
 const wrapped='Researchers reported a new finding\n\nafter several weeks of careful observations.';
 assert.equal(originalQuote(wrapped,'Researchers reported a new finding after several weeks of careful observations.'),wrapped);
 assert.equal(originalQuote(original,"Children's exposure to wood-burning is much greater than traffic exhaust."),null);
});
test('automatic release requires the exact generated version and all reviews, is labelled automatic, and cannot overwrite an existing issue',async()=>{
 const store=new Memory(),base=publicationCatalog.packets.find(p=>p.id==='2026-11-19-r5')!,id=randomUUID();await importReviewPacket(store,id,base.id,base.fingerprint);
 const render=async(job:WebJob,edition:'elementary'|'junior'|'senior')=>['color','ink'].map(mode=>({path:`web-editorial/${job.id}/${edition}-${mode}.pdf`,edition,mode:mode as 'color'|'ink',pages:1,sha256:'a'.repeat(64)}));
 for(let i=0;i<3;i++)await advanceWebJob(store,id,{render});
 const job=(await store.get<WebJob>(jobKey(id)))!,publication={pdfs:job.pdfs,releasedAt:new Date().toISOString(),fingerprint:jobFingerprint(job)};
 await assert.rejects(()=>publishScheduledJob(store,id,{...publication,fingerprint:'a'.repeat(64)}),/REVIEW_VERSION_CHANGED/);
 job.reviews[0].factual_status='needs_revision';store.rows.set(jobKey(id),job);await assert.rejects(()=>publishScheduledJob(store,id,{...publication,fingerprint:jobFingerprint(job)}),/PUBLICATION_CHECKS_FAILED/);
 job.reviews[0].factual_status='pass';store.rows.set(jobKey(id),job);
 const release=await publishScheduledJob(store,id,publication);assert.equal(release.approvalMethod,'scheduled_auto');assert.ok(release.editions.every(i=>!i.reviewCopy&&i.publishedAt));
 assert.equal((await publishScheduledJob(store,id,publication)).releasedAt,release.releasedAt);assert.equal((await store.get<WebRelease>(releaseKey(job.issueDate)))!.jobId,id);
});
test('historical week uses the seven previous Taipei dates and grants cannot raise the normal daily budget',async()=>{
 assert.deepEqual(previousSevenDays('2026-11-20'),['2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19']);
 const store=new Memory(),id=randomUUID(),grant=await createBackfill(store,id,'2026-11-20');assert.equal(grant.dates.length,7);
 await assert.rejects(()=>createBackfill(store,randomUUID(),'2026-11-20'),/BACKFILL_ALREADY_EXISTS/);
 const old=process.env.MAX_MODEL_CALLS;process.env.MAX_MODEL_CALLS='1';
 try{
  const normal=webBudget(store,'normal',async()=>{}),ticket=await normal.reserve(1,1);await normal.settle(ticket,{input_tokens:1,output_tokens:1});await assert.rejects(async()=>await normal.reserve(1,1),/BUDGET_EXCEEDED/);
  const scoped=webBudget(store,'historical',async()=>{},undefined,{id,issueDate:'2026-11-13'});for(let i=0;i<2;i++){const t=await scoped.reserve(1,1);await scoped.settle(t,{input_tokens:1,output_tokens:1});}
  await assert.rejects(async()=>await webBudget(store,'foreign-date',async()=>{},undefined,{id,issueDate:'2026-11-20'}).reserve(1,1),/BACKFILL_NOT_AUTHORIZED/);
  grant.status='complete';store.rows.set(campaignKey(id),grant);await assert.rejects(async()=>await scoped.reserve(1,1),/BACKFILL_NOT_AUTHORIZED/);
 }finally{if(old===undefined)delete process.env.MAX_MODEL_CALLS;else process.env.MAX_MODEL_CALLS=old;}
});
test('archive extraction keeps actual publication/modification metadata and rejects off-domain archive links',()=>{
 const card=(url:string)=>'<div class="fc-item"><h3 class="fc-item__title"><a href="'+url+'">A discovery</a></h3><div class="fc-item__standfirst">Verified details</div></div>';
 const cards=parseGuardianArchive(card('https://www.theguardian.com/science/2026/nov/13/discovery')+card('https://evil.example/science/2026/nov/13/discovery'),'2026-11-13','guardian-discovery','science');assert.equal(cards.length,1);
 const dates=articleDates('<meta property="article:published_time" content="2026-11-13T10:00:00Z"><meta property="article:modified_time" content="2026-11-14T10:00:00Z">');assert.equal(dates.publishedAt,'2026-11-13T10:00:00.000Z');assert.equal(dates.modifiedAt,'2026-11-14T10:00:00.000Z');
});
