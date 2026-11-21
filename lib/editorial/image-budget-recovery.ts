import{randomUUID}from'node:crypto';
import{changeDocument,WEB_PREFIX,type DocumentStore}from'./web-store';
import{jobKey,saveJob}from'./web-jobs';
import{campaignKey,type BackfillCampaign}from'./backfill';
import type{WebJob}from'./web-types';
import{editionKeys}from'../../config/editions';
export async function extendBackfillImages(store:DocumentStore,id:string,extraRequests:number,notes:string,actor:string){
 if(extraRequests<1||extraRequests>12||!Number.isInteger(extraRequests)||notes.trim().length<40)throw Error('IMAGE_BUDGET_REVIEW_REQUIRED');
 const job=await store.get<WebJob>(jobKey(id));if(!job?.campaignId||job.input.kind!=='news'||job.status!=='needs_attention'||job.editions.length!==3||job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('IMAGE_RETRY_NOT_READY');
 const grant=await store.get<BackfillCampaign>(campaignKey(job.campaignId)),ledger=await store.get<{slots:string[]}>(WEB_PREFIX+'image-budget:backfill:'+job.campaignId),slots=Object.entries(job.imageStates??{}).filter(([key,state])=>state==='failed'&&job.imageErrors?.[key]==='IMAGE_BUDGET_EXCEEDED'&&(job.imageAttempts?.[key]??1)<3).map(([key])=>key);
 const allowed=editionKeys.flatMap(e=>job.facts.map(f=>e+':'+f.story_id));if(!grant||grant.status!=='needs_attention'||grant.jobs[job.issueDate]!==id||!ledger||!slots.length||slots.length>extraRequests||slots.some(slot=>!allowed.includes(slot)))throw Error('IMAGE_BUDGET_REVIEW_REQUIRED');
 const target=Math.max(grant.limits.images,ledger.slots.length+extraRequests);if(target>140)throw Error('IMAGE_BUDGET_REVIEW_LIMIT');
 const audit={version:1,id:randomUUID(),at:new Date().toISOString(),jobId:id,campaignId:job.campaignId,actor,notes,usedRequests:ledger.slots.length,oldLimit:grant.limits.images,newLimit:target,missingImages:slots.length};await store.create(WEB_PREFIX+'image-budget-review:'+audit.id,audit);
 await changeDocument<BackfillCampaign>(store,campaignKey(job.campaignId),()=>{throw Error('NOT_FOUND');},c=>{if(c.status!=='needs_attention'||c.jobs[job.issueDate]!==id)throw Error('IMAGE_RETRY_NOT_READY');c.limits.images=Math.max(c.limits.images,target);});
 job.imageBudgetRecoverySlots=[...new Set([...(job.imageBudgetRecoverySlots??[]),...slots])];for(const slot of slots)delete job.imageRetryAt?.[slot];job.status='pending';job.error=null;job.events.push({at:audit.at,message:'已記錄試刊補圖額度 '+audit.oldLimit+' → '+target+' 次；保留所有既有圖片、失敗與預留，只補缺少的 '+slots.length+' 張'});await saveJob(store,job);return audit;
}
