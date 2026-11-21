import {randomUUID} from 'node:crypto';
import {editionKeys,type Edition} from '../../config/editions';
import {hash} from '../pipeline/state.mjs';
import {jobKey,jobFingerprint,releaseKey,saveJob} from './web-jobs';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import type {WebJob,WebRelease,WebPdf} from './web-types';
import {publicationEditions,verifiedNewsDates} from './event-date';
import {audienceConceptPrompt} from '../media/audience';

export async function rebuildDraftPdfs(store:DocumentStore,id:string){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status!=='needs_review'||job.editions.length!==3||job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('PDF_RETRY_NOT_READY');
 job.pdfs=[];job.status='pending';job.error=null;job.events.push({at:new Date().toISOString(),message:'套用新版 PDF 版面，保留正文、複核與模型用量'});await saveJob(store,job);return job;
}

export async function retryFilteredImages(store:DocumentStore,id:string){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 const slots=Object.entries(job.imageStates??{}).filter(([,state])=>state==='failed').map(([key])=>key),allowed=editionKeys.flatMap(e=>job.facts.map(f=>e+':'+f.story_id));
 if(job.input.kind!=='news'||job.status!=='needs_review'||job.editions.length!==3||job.activeStep||job.lease&&job.lease.expiresAt>Date.now()||!slots.length||slots.length>12||slots.some(s=>!allowed.includes(s)||job.imageErrors?.[s]&&job.imageErrors[s]!=='IMAGE_CONTENT_FILTERED'))throw Error('IMAGE_RETRY_NOT_READY');
 if(job.campaignId){const {campaignKey}=await import('./backfill');
  await changeDocument<import('./backfill').BackfillCampaign>(store,campaignKey(job.campaignId),()=>{throw Error('NOT_FOUND');},c=>{if(c.status!=='running'||c.jobs[job.issueDate]!==job.id)throw Error('BACKFILL_NOT_AUTHORIZED');c.limits.images=Math.max(c.limits.images,112);});
 }
 job.imageErrors??={};job.imageFallbackSlots??=[];
 for(const slot of slots){job.imageErrors[slot]='IMAGE_CONTENT_FILTERED';if(!job.imageFallbackSlots.includes(slot))job.imageFallbackSlots.push(slot);delete job.imageStates![slot];}
 job.pdfs=[];job.status='pending';job.error=null;job.events.push({at:new Date().toISOString(),message:'根據已核對的供應商拒絕紀錄，改製一般主題概念插畫；保留正文與既有圖片'});
 await saveJob(store,job);return job;
}

export async function retryImagePromptLimit(store:DocumentStore,id:string,verifiedLegacyModel?:'black-forest-labs/flux.2-klein-4b'){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.input.kind!=='news'||job.status!=='needs_attention'||job.editions.length!==3||job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('IMAGE_RETRY_NOT_READY');
 const attempts=await store.list<{jobId:string;edition:string;storyId:string;model:string;error:string;prompt:string}>(WEB_PREFIX+'image-attempt:');
 const verified=attempts.filter(a=>a.jobId===id&&a.model==='black-forest-labs/flux.2-klein-4b'&&a.error==='IMAGE_HTTP_422'&&a.prompt.length>800).map(a=>a.edition+':'+a.storyId);
 if(verifiedLegacyModel)for(const edition of editionKeys)for(const fact of job.facts){const original=audienceConceptPrompt('Create a wide landscape conceptual editorial illustration for this factual story. Illustrate its central subject simply, without adding factual claims. '+fact.claims.filter(c=>c.must_keep).map(c=>c.text).join(' '),edition);if(original.length>800)verified.push(edition+':'+fact.story_id);}
 const slots=Object.entries(job.imageStates??{}).filter(([key,state])=>state==='failed'&&job.imageErrors?.[key]==='IMAGE_HTTP_422'&&verified.includes(key)&&(job.imageAttempts?.[key]??1)<3).map(([key])=>key);
 if(!slots.length)throw Error('IMAGE_RETRY_NOT_READY');
 job.imagePromptRecoverySlots=[...new Set([...(job.imagePromptRecoverySlots??[]),...slots])];for(const slot of slots)delete job.imageRetryAt?.[slot];
 job.status='pending';job.error=null;job.events.push({at:new Date().toISOString(),message:(verifiedLegacyModel?'管理員已核對舊部署模型與工作快照；':'')+'已核對原始 HTTP 422 與超過 800 字元的 prompt，套用精簡提示詞續製缺圖；保留稿件、圖片及每次用量'});await saveJob(store,job);return job;
}
type Render=(job:WebJob,edition:Edition,folder:string)=>Promise<WebPdf[]>;
export async function refreshApprovedPdfs(store:DocumentStore,id:string,render:Render){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 const key=releaseKey(job.issueDate),old=await store.get<WebRelease>(key);
 if(!old||old.jobId!==id||job.status!=='needs_review'||job.pdfs.length!==6)throw Error('PUBLICATION_CONFLICT');
 const approved=publicationEditions(job,old.releasedAt);
 // A layout-only refresh cannot publish different or unapproved text.
 const prior=verifiedNewsDates(old.editions,job.facts).map(e=>({...e,articles:e.articles.map(a=>{
  const next=approved.find(i=>i.edition===e.edition)?.articles.find(i=>i.storyId===a.storyId);
  return a.image.kind==='icon'&&next?.image.kind==='generated_illustration'?{...a,image:next.image}:a;
 })}));
 if(hash(approved)!==hash(prior))throw Error('REVIEW_VERSION_CHANGED');
 if(old.fingerprint===jobFingerprint(job)&&hash(approved)===hash(old.editions))return old;
 const final={...job,editions:approved,pdfs:[] as WebPdf[]},folder='published-'+randomUUID();
 for(const edition of editionKeys)final.pdfs.push(...await render(final,edition,folder));
 const release={...old,version:old.version+1,editions:approved,pdfs:final.pdfs,fingerprint:jobFingerprint(job),pdfLayoutUpdatedAt:new Date().toISOString()};
 if(!await store.compare(key,old.version,release))throw Error('PUBLICATION_CONFLICT');return release;
}
