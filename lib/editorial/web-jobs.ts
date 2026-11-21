import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {editionKeys,editions} from '../../config/editions';
import {editionSchema} from '../schemas/edition';
import {publicationCatalog} from '../publications/catalog';
import {benchmarkRuns} from './benchmarks';
import {sourceLibrary,sourceChoices} from './library';
import {resolveRegeneration,regenerateOneStory} from './regeneration';
import {produceEditions} from '../pipeline/editorial';
import {hash} from '../pipeline/state.mjs';
import {NvidiaProvider,type TextModelProvider,type GenerationRequest} from '../providers/text';
import {webBudget} from './web-budget';
import {WEB_PREFIX,type DocumentStore} from './web-store';
import {webGenerationSchema,type WebJob,type WebRelease,type Checkpoint} from './web-types';
import {learningTermKey} from '../content/vocabulary.mjs';
import {isLengthReminder} from './readability';
import {newsRoundKey,type NewsRound} from './news-config';
import {readNewsArticle,extractNewsFact,assembleNewsFact,NewsEvidenceError} from './news';
import {authorizedBackfill} from './backfill';
import {promptExecutionHash as executionHash,resolvePromptSnapshot} from './prompt-snapshot';
import {publicationEditions} from './event-date';
import {imageFailureCode,retryableImageError} from './image-retry';
import {recoverStructuredReply} from '../pipeline/recover-structured';

export const jobKey=(id:string)=>WEB_PREFIX+'job:'+z.uuid().parse(id);
export const releaseKey=(date:string)=>WEB_PREFIX+'release:'+z.iso.date().parse(date);
export const jobFingerprint=(job:WebJob)=>hash({editions:job.editions,reviews:job.reviews,facts:job.facts,pdfs:job.pdfs});
const promptFiles=async()=>({writer:await readFile('prompts/writer.v2.txt','utf8'),reviewer:await readFile('prompts/reviewer.v1.txt','utf8')});
function event(job:WebJob,message:string){job.events.push({at:new Date().toISOString(),message});job.events=job.events.slice(-120);}
export async function saveJob(store:DocumentStore,job:WebJob){const old=job.version;job.version++;job.updatedAt=new Date().toISOString();if(!await store.compare(jobKey(job.id),old,job)){job.version=old;throw Error('JOB_CONFLICT');}}

export async function createWebJob(store:DocumentStore,id:string,raw:unknown){
 jobKey(id);const input=webGenerationSchema.parse(raw),existing=await store.get<WebJob>(jobKey(id));
 if(existing){if(hash(existing.input)!==hash(input))throw Error('IDEMPOTENCY_CONFLICT');return existing;}
 if(!process.env.LLM_API_KEY?.trim())throw Error('LLM_NOT_CONFIGURED');
 const prompts=await promptFiles(),now=new Date().toISOString(),model=process.env.WRITER_MODEL||'nvidia/nemotron-3-ultra-550b-a55b',reviewerModel=process.env.REVIEWER_MODEL||model;
 let facts:WebJob['facts'],context:WebJob['context'],issueDate:string,reviews:WebJob['reviews']=[];
 if(input.kind==='generate'){
  issueDate=input.issueDate;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(issueDate>today)throw Error('FUTURE_ISSUE_DATE');
  const choices=sourceChoices(issueDate);
  facts=input.sourceIds.map(id=>{if(!choices.some(s=>s.id===id))throw Error('SOURCE_OUTSIDE_ISSUE_WINDOW');return structuredClone(sourceLibrary.find(s=>s.id===id)!.fact);});
 }else if(input.kind==='news'){
  if(input.campaignId)await authorizedBackfill(store,input.campaignId,input.issueDate);
  const round=await store.get<NewsRound>(newsRoundKey(input.roundId));
  if(!round||round.status!=='ready'||round.issueDate!==input.issueDate||input.sourceIds.some(id=>!round.candidates.some(c=>c.id===id)))throw Error('INVALID_NEWS_SELECTION');
  issueDate=round.issueDate;facts=[];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(issueDate>today)throw Error('FUTURE_ISSUE_DATE');
 }else{
  const request=input.request;
  if(request.base.kind==='benchmark'&&z.uuid().safeParse(request.base.id).success){
   const parent=await store.get<WebJob>(jobKey(request.base.id));
   if(!parent||parent.status!=='needs_review'||jobFingerprint(parent)!==request.base.fingerprint)throw Error('STALE_REGENERATION_BASE');
   context={request,facts:structuredClone(parent.facts),drafts:parent.editions.flatMap(i=>i.articles.map(article=>({storyId:article.storyId,edition:i.edition,article:structuredClone(article),writerMs:0,reviewerMs:0,writerCalls:0,reviewerCalls:0,errors:[],assessment:null,firstPass:false,reused:true}))),model,issueDate:parent.issueDate,index:parent.facts.findIndex(f=>f.story_id===request.storyId),fact:parent.facts.find(f=>f.story_id===request.storyId)!};
   if(context.index<0)throw Error('UNKNOWN_REGENERATION_STORY');
   // Route web snapshots through the same source-window and replacement checks.
   const packet={...publicationCatalog.packets[0],id:'2000-01-01-r1',fingerprint:request.base.fingerprint,facts:parent.facts,editions:parent.editions,issueDate:parent.issueDate,production:{...publicationCatalog.packets[0].production,model}};
   const resolved=resolveRegeneration({...request,base:{kind:'packet',id:packet.id,fingerprint:packet.fingerprint}},{packets:[packet],benchmarks:[],library:sourceLibrary});
   context={...resolved,request};reviews=parent.reviews;
  }else{
   context=resolveRegeneration(request,{packets:publicationCatalog.packets,benchmarks:benchmarkRuns,library:sourceLibrary});
   reviews=request.base.kind==='packet'?publicationCatalog.packets.find(p=>p.id===request.base.id)!.reviews:context.drafts.flatMap(d=>d.assessment?[{...d.assessment,storyId:d.storyId,edition:d.edition}]:[]);
  }
  facts=context.facts;issueDate=context.issueDate;context.model=model;
 }
 const imageSnapshots:WebJob['imageSnapshots']={};
 for(const fact of facts)for(const edition of editionKeys){
  const packet=[...publicationCatalog.packets].sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt)).find(p=>p.facts.some(f=>f.story_id===fact.story_id&&f.event_key===fact.event_key&&f.sources[0].url===fact.sources[0].url));
  const image=packet?.editions.find(i=>i.edition===edition)?.articles.find(a=>a.storyId===fact.story_id)?.image;
  if(image)imageSnapshots[edition+':'+fact.story_id]=structuredClone(image);
 }
 const job:WebJob={version:1,id,createdAt:now,updatedAt:now,issueDate,revision:Math.floor(Date.now()/1000),status:'pending',kind:input.kind==='news'?'generate':input.kind,input,facts,context,model,reviewerModel,promptHash:executionHash(prompts),promptSnapshot:prompts,imageSnapshots,checkpoints:{},activeStep:null,lease:null,editions:[],drafts:[],reviews,pdfs:[],error:null,events:[{at:now,message:'已儲存生成要求與來源快照'}],usage:{calls:0,inputTokens:0,outputTokens:0}};
 if(input.kind==='news'){
  const round=(await store.get<NewsRound>(newsRoundKey(input.roundId)))!;
  job.intakeCandidates=input.sourceIds.map(id=>structuredClone(round.candidates.find(c=>c.id===id)!));job.execution='workflow';job.imageStates={};if(input.campaignId)job.campaignId=input.campaignId;
 }
 if(!await store.create(jobKey(id),job))return createWebJob(store,id,raw);return job;
}

class NextStep extends Error {}
export async function retryWebGeneration(store:DocumentStore,id:string){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status!=='needs_attention'||job.editions.length||job.activeStep||!Object.keys(job.checkpoints).length||!(job.error==='GENERATION_FAILED'||job.error==='MODEL_SCHEMA_INVALID'||job.error?.startsWith('NEEDS_REVIEW:')))throw Error('GENERATION_RETRY_NOT_READY');
 if(job.lease&&job.lease.expiresAt>Date.now())throw Error('JOB_CONFLICT');
 job.status='pending';job.error=null;event(job,'保留成功回應，依具體稿件檢查繼續；新模型步驟會計入用量');await saveJob(store,job);return job;
}
export async function retryWebPdfs(store:DocumentStore,id:string){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status!=='needs_attention'||job.editions.length!==3||job.activeStep||job.error==='USAGE_RECONCILIATION_REQUIRED')throw Error('PDF_RETRY_NOT_READY');
 if(job.lease&&job.lease.expiresAt>Date.now())throw Error('JOB_CONFLICT');
 job.editions.forEach(i=>editionSchema.parse(i));job.status='pending';job.error=null;
 event(job,'保留已儲存稿件，只重試尚未完成的 PDF，不再呼叫模型');await saveJob(store,job);return job;
}
export async function importReviewPacket(store:DocumentStore,id:string,packetId:string,fingerprint:string){
 const packet=publicationCatalog.packets.find(p=>p.id===packetId&&p.fingerprint===fingerprint);if(!packet)throw Error('STALE_REGENERATION_BASE');
 jobKey(id);const old=await store.get<WebJob>(jobKey(id));if(old){if(old.context||hash(old.editions)!==hash(packet.editions))throw Error('IDEMPOTENCY_CONFLICT');return old;}
 const now=new Date().toISOString(),prompts=await promptFiles();
 const job:WebJob={version:1,id,createdAt:now,updatedAt:now,issueDate:packet.issueDate,revision:packet.revision,status:'pending',kind:'generate',input:{kind:'generate',issueDate:packet.issueDate,sourceIds:packet.facts.map(f=>f.story_id),direction:''},facts:structuredClone(packet.facts),editions:structuredClone(packet.editions),reviews:structuredClone(packet.reviews),drafts:[],pdfs:[],model:packet.production.model,reviewerModel:packet.production.model,promptHash:executionHash(prompts),promptSnapshot:prompts,imageSnapshots:{},checkpoints:{},activeStep:null,lease:null,error:null,usage:{calls:0,inputTokens:0,outputTokens:0},events:[{at:now,message:'已匯入審核稿與模型複核，使用現有正文製作 PDF，不呼叫模型'}]};
 job.editions.forEach(i=>editionSchema.parse(i));if(!await store.create(jobKey(id),job))throw Error('JOB_CONFLICT');return job;
}
export type WorkerOptions={provider?:TextModelProvider;maxModelSteps?:number;render?:(job:WebJob,edition:typeof editionKeys[number])=>Promise<WebJob['pdfs']>};
export async function retryPromptSnapshot(store:DocumentStore,id:string){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status!=='needs_attention'||job.error!=='GENERATION_PROMPTS_CHANGED'||job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('PROMPT_RETRY_NOT_READY');
 job.promptSnapshot=resolvePromptSnapshot(job.promptHash,await promptFiles(),job.promptSnapshot);
 job.status='pending';job.error=null;event(job,'已核對並還原原始提示詞換行格式，沿用已完成的生成結果');await saveJob(store,job);return job;
}
export async function advanceWebJob(store:DocumentStore,id:string,options:WorkerOptions={}){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status==='needs_review'||job.status==='needs_attention')return job;
 if(job.lease&&job.lease.expiresAt>Date.now())return job;
 const owner=randomUUID();job.lease={owner,expiresAt:Date.now()+280000};job.status='running';
 await saveJob(store,job);
 try{
  if(job.activeStep)throw Error('USAGE_RECONCILIATION_REQUIRED');
  const current=await promptFiles(),prompts=job.editions.length?current:resolvePromptSnapshot(job.promptHash,current,job.promptSnapshot);
  if(!job.editions.length)job.promptSnapshot=prompts;
  let calls=0;const batchStarted=Date.now(),maxSteps=Math.max(1,Math.min(3,options.maxModelSteps??1));
  const budget=webBudget(store,id,async(input,output)=>{job.usage.calls++;job.usage.inputTokens+=input;job.usage.outputTokens+=output;},undefined,job.campaignId?{id:job.campaignId,issueDate:job.issueDate}:undefined);
  const live=options.provider??new NvidiaProvider(process.env.LLM_API_KEY?.trim()||'',budget,async raw=>{
   const key='invalid:'+job.activeStep+':'+raw.attempt,value={status:'success' as const,inputHash:hash({task:raw.task,model:raw.model}),output:raw,outputHash:hash(raw)};
   const prior=job.checkpoints[key];if(prior&&prior.outputHash!==value.outputHash)job.checkpoints['archived:'+key+':'+prior.outputHash]=prior;
   job.checkpoints[key]=value;event(job,'已保存無法解析的模型回覆，保留用量與診斷');await saveJob(store,job);
  });
  const provider:TextModelProvider={cacheIdentity:'vercel-web-v1',async generateStructured<T>(req:GenerationRequest<T>){
   const key=hash({task:req.task,system:req.system,data:req.data,model:req.model});
   const recovered=recoverStructuredReply(job.checkpoints,key,req);if(recovered){event(job,'已依目前驗證規則恢復原先付費回覆，不重複呼叫模型');return recovered;}
   if(calls>=maxSteps||calls>0&&Date.now()-batchStarted>=30000)throw new NextStep();calls++;
   const target=(req.data as {target?:string})?.target||req.system.match(/Audience edition: ([a-z]+)/)?.[1]||'';
   job.activeStep=key;event(job,'開始'+(req.task==='facts'?'來源核對':req.task==='review'?'模型複核':(req.data as {glossaryRepair?:boolean})?.glossaryRepair?'修訂學習單字':'寫稿')+(target?' · '+target:''));await saveJob(store,job);
   return live.generateStructured({...req,timeoutMs:45000});
  }};
  const checkpoint=async(key:string,value:Checkpoint)=>{const previous=job.checkpoints[key];if(previous&&previous.outputHash!==value.outputHash)job.checkpoints['archived:'+key+':'+previous.outputHash]=previous;job.checkpoints[key]=value;job.activeStep=null;event(job,'完成 '+key);if(!key.includes(':accepted:'))await saveJob(store,job);};
  if(job.input.kind==='news'&&job.facts.length<4){
   const candidate=job.intakeCandidates!.find(c=>!job.facts.some(f=>f.story_id==='news-'+c.id.slice(0,24)))!;
   const replaceUnavailable=async(code:string)=>{
    if(job.input.kind!=='news'||!job.input.autoSelect)throw Error(code);
    job.rejectedNewsIds??=[];job.rejectedNewsIds.push(candidate.id);
    const round=await store.get<NewsRound>(newsRoundKey(job.input.roundId));
    const next=[...(job.additionalNewsCandidates??[]),...(round?.candidates??[])].find(c=>!job.intakeCandidates!.some(i=>i.id===c.id)&&!job.rejectedNewsIds!.includes(c.id));
    if(!next)throw Error('NEWS_POOL_EXHAUSTED');
    job.intakeCandidates=job.intakeCandidates!.map(c=>c.id===candidate.id?next:c);event(job,'來源不可用，改選 shortlist 中的另一篇 · '+next.title);await saveJob(store,job);
   };
   const key='intake:'+candidate.id,cached=job.checkpoints[key];let fact:WebJob['facts'][number];
   if(cached){if(cached.inputHash!==hash(candidate)||cached.outputHash!==hash(cached.output))throw Error('CHECKPOINT_CHANGED');fact=cached.output as typeof fact;}
   else{
    let read:Awaited<ReturnType<typeof readNewsArticle>>;
    try{read=await readNewsArticle(candidate);}catch{await replaceUnavailable('NEWS_ARTICLE_UNAVAILABLE');return job;}
    if(job.campaignId){const grant=await authorizedBackfill(store,job.campaignId,job.issueDate),end=Date.parse(job.issueDate+'T23:59:59.999+08:00'),start=Math.max(end-2*86400000+1,Date.parse(grant.dates[0]+'T00:00:00+08:00')),at=Date.parse(read.publishedAt||candidate.publishedAt);if(at<start||at>end||read.modifiedAt&&Date.parse(read.modifiedAt)>end){await replaceUnavailable('HISTORICAL_SOURCE_CHANGED');return job;}}
    const rejected=job.checkpoints['intake-rejected:'+candidate.id];
    if(rejected&&(rejected.inputHash!==hash(candidate)||rejected.outputHash!==hash(rejected.output)))throw Error('CHECKPOINT_CHANGED');
    try{fact=rejected?assembleNewsFact(candidate,read,rejected.output):await extractNewsFact(candidate,read,provider,job.model);}catch(error){
     if(!(error instanceof NewsEvidenceError))throw error;
     await checkpoint('intake-rejected:'+candidate.id,{status:'success',inputHash:hash(candidate),outputHash:hash(error.draft),output:error.draft});
     await replaceUnavailable('NEWS_EVIDENCE_MISMATCH');return job;
    }
    await checkpoint(key,{status:'success',inputHash:hash(candidate),outputHash:hash(fact),output:fact});
   }
   if(fact.sensitivity==='high'){await replaceUnavailable('NEWS_SENSITIVE_STORY');return job;}
   job.facts.push(fact);event(job,'已核對來源 '+job.facts.length+' / 4 · '+candidate.title);await saveJob(store,job);
  }else if(!job.editions.length){
   if(job.input.kind!=='regenerate'){
    const result=await produceEditions({facts:job.facts,issueDate:job.issueDate,revision:job.revision,provider,
     writerModel:job.model,reviewerModel:job.reviewerModel,storyCount:4,lengthPolicy:'advisory',direction:job.input.direction,prompts,
     store:{get:async key=>job.checkpoints[key],set:async(key,value)=>checkpoint(key,value as Checkpoint)}});
    job.editions=result.editions.map(i=>({...i,reviewCopy:true,articles:i.articles.map(a=>({...a,image:job.imageSnapshots[i.edition+':'+a.storyId]||a.image}))}));job.reviews=result.reviews;
   }else{
    const context=structuredClone(job.context!);
    const drafts=await regenerateOneStory(context,{provider,writer:prompts.writer,reviewer:prompts.reviewer,reviewerModel:job.reviewerModel,
     measure:async<T>(key:string,input:unknown,run:()=>Promise<T>)=>{
      const previous=job.checkpoints[key];if(previous){if(previous.inputHash!==hash(input)||previous.outputHash!==hash(previous.output))throw Error('CHECKPOINT_CHANGED');return previous.output as {reply:T;ms:number;calls:number};}
      const start=Date.now(),reply=await run(),output={reply,ms:Date.now()-start,calls:1};
      await checkpoint(key,{status:'success',inputHash:hash(input),outputHash:hash(output),output});return output;
     }});
    job.drafts=drafts;job.editions=editionKeys.map(edition=>{const c=editions[edition];return {schemaVersion:'1.0',issueDate:job.issueDate,revision:job.revision,edition,targetCefr:c.cefr,templateVersion:'newspaper-grid-2',storyCount:4,publishedAt:null,isDemo:false,reviewCopy:true,vocabularyPolicy:'tiered-v1',lengthPolicy:'advisory',readingRules:{min:c.min,max:c.max,avg:c.avg,maxSentence:c.sentenceMax},articles:drafts.filter(d=>d.edition===edition).map(d=>d.article!)};});
    job.reviews=drafts.flatMap(d=>{const r=d.assessment??job.reviews.find(r=>r.storyId===d.storyId&&r.edition===d.edition);return r?[{...r,storyId:d.storyId,edition:d.edition}]:[];});
   }
   job.editions.forEach(i=>editionSchema.parse(i));event(job,'三版稿件已儲存，開始製作 PDF');await saveJob(store,job);
  }else if(job.input.kind==='news'&&job.input.imageGeneration&&Object.values(job.imageStates??{}).filter(s=>s==='done').length<12){
   const slots=editionKeys.flatMap(edition=>job.facts.map(fact=>({edition,fact,key:edition+':'+fact.story_id}))),eligible=slots.filter(s=>job.imageStates?.[s.key]==='failed'&&(job.imageAttempts?.[s.key]??1)<3&&(retryableImageError(job.imageErrors?.[s.key]??'IMAGE_FAILED')||job.imageErrors?.[s.key]==='IMAGE_HTTP_422'&&job.imagePromptRecoverySlots?.includes(s.key)));
   const slot=slots.find(s=>!job.imageStates?.[s.key])??eligible.find(s=>(job.imageRetryAt?.[s.key]??0)<=Date.now());
   if(!slot){const later=eligible.map(s=>job.imageRetryAt?.[s.key]??0).filter(t=>t>Date.now());if(later.length){job.waitUntil=Math.min(...later);return job;}throw Error('AI_IMAGES_INCOMPLETE');}
   delete job.waitUntil;job.imageAttempts??={};job.imageAttempts[slot.key]=(job.imageAttempts[slot.key]??(job.imageStates?.[slot.key]==='failed'?1:0))+1;
   job.imageStates??={};job.imageStates[slot.key]='running';event(job,'開始 AI 配圖 · '+slot.edition+' · '+slot.fact.story_id);await saveJob(store,job);
   try{
    const image=await (await import('./web-images')).generateWebImage(store,job,slot.edition,slot.fact);
    job.imageSnapshots[slot.key]=image;job.editions.find(i=>i.edition===slot.edition)!.articles.find(a=>a.storyId===slot.fact.story_id)!.image=image;job.imageStates[slot.key]='done';event(job,'完成'+(image.caption?.startsWith('主題')?'主題概念插畫':'配圖')+' · '+slot.edition);
   }catch(error){const code=imageFailureCode(error);job.imageStates[slot.key]='failed';job.imageErrors??={};job.imageErrors[slot.key]=code;job.imageRetryAt??={};job.imageRetryAt[slot.key]=Date.now()+5*60000;event(job,'AI 配圖尚未完成 · '+slot.edition+' · '+code);console.warn('news_image_failed',{jobId:id,slot:slot.key,code});}
   await saveJob(store,job);
  }else{
   const edition=editionKeys.find(e=>job.pdfs.filter(p=>p.edition===e).length!==2);
   if(edition){
    const rendered=options.render?await options.render(job,edition):await (await import('../pdf/vercel')).renderWebPdfs(job,edition,undefined,'',async file=>{job.pdfs=job.pdfs.filter(p=>p.path!==file.path).concat(file);event(job,'完成 '+editions[edition].label+' '+(file.mode==='color'?'彩色':'省墨')+' PDF');await saveJob(store,job);});
    for(const file of rendered)job.pdfs=job.pdfs.filter(p=>p.path!==file.path).concat(file);
    event(job,'完成 '+editions[edition].label+' 彩色與省墨 PDF');await saveJob(store,job);
   }
   if(job.pdfs.length===6){job.status='needs_review';event(job,'生成完成，等待人工審閱與核准');}
  }
 }catch(e){
  if(!(e instanceof NextStep)){job.status='needs_attention';job.error=e instanceof Error&&(/^[A-Z0-9_:.-]{1,180}$/.test(e.message)||/^NEEDS_REVIEW:[A-Za-z0-9_-]{1,100}:(elementary|junior|senior)$/.test(e.message))?e.message:job.editions.length===3?'PDF_RUNTIME_FAILED':'GENERATION_FAILED';if(job.error==='MODEL_SCHEMA_INVALID')job.activeStep=null;event(job,'暫停：'+job.error);console.error('editorial_job_failed',{jobId:id,code:job.error});if(job.editions.length===3&&e instanceof Error)console.error('pdf_worker_failed',{jobId:id,detail:e.message.replace(/https?:\/\/\S+/g,'[url]').slice(0,1400),stack:e.stack?.split('\n').slice(0,5).join('\n')});}
 }finally{job.lease=null;await saveJob(store,job);}
 return job;
}

export function canPublishWebJob(job:WebJob){
 if(job.status!=='needs_review'||job.editions.length!==3||job.pdfs.length!==6||job.reviews.length!==12||job.activeStep)return false;
 if(job.input.kind==='news'&&job.editions.some(e=>e.articles.some(a=>a.image.kind!=='generated_illustration')))return false;
 if(job.editions.some(i=>!editionSchema.safeParse(i).success)||job.drafts.some(d=>d.errors.some(e=>!isLengthReminder(e))))return false;
 if(new Set(job.reviews.map(r=>r.storyId+':'+r.edition)).size!==12)return false;
 for(const fact of job.facts){
  const terms=job.editions.flatMap(i=>i.articles.filter(a=>a.storyId===fact.story_id).flatMap(a=>a.vocabulary.map(v=>learningTermKey(v.term))));
  if(terms.length!==6||new Set(terms).size!==6)return false;
  if(job.reviews.filter(r=>r.storyId===fact.story_id).length!==3)return false;
 }
 return job.reviews.every(r=>r.factual_status==='pass'&&r.level_fit==='suitable'&&r.suitability==='pass'&&r.publish_recommendation==='pass'&&!r.issues.some(i=>i.severity!=='minor'));
}
export async function publishWebJob(store:DocumentStore,id:string,fingerprint:string,reviewed:boolean,publication?:{pdfs:WebJob['pdfs'];releasedAt:string;approvalMethod?:'scheduled_auto'}){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(!reviewed||jobFingerprint(job)!==fingerprint)throw Error('REVIEW_VERSION_CHANGED');
 if(!canPublishWebJob(job))throw Error('PUBLICATION_CHECKS_FAILED');
 const key=releaseKey(job.issueDate),old=await store.get<WebRelease>(key);
 if(old?.jobId===id)return old;
 if(old&&old.createdAt>=job.createdAt)throw Error('NEWER_ISSUE_ALREADY_RELEASED');
 const releasedAt=publication?.releasedAt??new Date().toISOString(),release:WebRelease={version:(old?.version??0)+1,jobId:id,fingerprint,issueDate:job.issueDate,createdAt:job.createdAt,releasedAt,approvalMethod:publication?.approvalMethod??'web_manual',editions:publicationEditions(job,releasedAt),pdfs:publication?.pdfs??job.pdfs};
 if(!(old?await store.compare(key,old.version,release):await store.create(key,release)))throw Error('PUBLICATION_CONFLICT');
 return release;
}
