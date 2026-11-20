import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getNewsSettings,newsPlanKey,newsRoundKey,emptyNewsPlan,scheduleTimes,type NewsPlan,type NewsRound} from './news-config';
import {refreshNewsRound,selectNews} from './news';
import {changeDocument,type DocumentStore} from './web-store';
import {createWebJob,jobKey,releaseKey,jobFingerprint,canPublishWebJob,publishWebJob} from './web-jobs';
import type {WebJob,WebRelease,WebPdf} from './web-types';
import {authorizedBackfill} from './backfill';
export async function scheduledPlan(store:DocumentStore,date:string){
 z.iso.date().parse(date);const settings=await getNewsSettings(store);
 return {enabled:settings.autoEnabled,...scheduleTimes(date,settings.publishTime)};
}
export async function prepareScheduledJob(store:DocumentStore,date:string){
 const settings=await getNewsSettings(store);if(!settings.autoEnabled)return {skip:true as const};
 if(await store.get<WebRelease>(releaseKey(date)))return {skip:true as const};
 let plan=await store.get<NewsPlan>(newsPlanKey(date));
 if(plan?.jobId){const job=await store.get<WebJob>(jobKey(plan.jobId));if(job){await changeDocument<NewsPlan>(store,newsPlanKey(date),()=>emptyNewsPlan(date),p=>{p.lockedAt=new Date().toISOString();});return {skip:false as const,id:job.id};}}
 let round=plan?.roundId?await store.get<NewsRound>(newsRoundKey(plan.roundId)):null;
 const samePool=round&&JSON.stringify(round.settings)===JSON.stringify(settings);
 if(!round||round.status!=='ready'||Date.now()-Date.parse(round.createdAt)>18*3600000||!samePool){round=await refreshNewsRound(store,date);plan=await store.get<NewsPlan>(newsPlanKey(date));}
 const manual=plan?.roundId===round.id&&plan.selectedIds.length===4;
 const ids=manual?plan!.selectedIds:round.recommendedIds;
 if(ids.length!==4)throw Error('NEWS_POOL_TOO_SMALL');
 await selectNews(store,date,round.id,ids,manual?'manual':'llm');
 const id=randomUUID();await createWebJob(store,id,{kind:'news',issueDate:date,roundId:round.id,sourceIds:ids,direction:settings.direction,imageGeneration:true,autoSelect:!manual});
 await changeDocument<NewsPlan>(store,newsPlanKey(date),()=>emptyNewsPlan(date),p=>{p.jobId=id;p.lockedAt=new Date().toISOString();p.updatedAt=new Date().toISOString();p.error=null;});
 return {skip:false as const,id};
}
export async function recordNewsFailure(store:DocumentStore,date:string,code:string){await changeDocument<NewsPlan>(store,newsPlanKey(date),()=>emptyNewsPlan(date),p=>{p.error=code;p.updatedAt=new Date().toISOString();});}
export async function publishScheduledJob(store:DocumentStore,id:string,publication:{pdfs:WebPdf[];releasedAt:string;fingerprint:string}){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.campaignId)await authorizedBackfill(store,job.campaignId,job.issueDate);
 else if(!(await getNewsSettings(store)).autoEnabled)throw Error('AUTO_PUBLICATION_DISABLED');
 const old=await store.get<WebRelease>(releaseKey(job.issueDate));if(old?.jobId===id||old&&!job.campaignId)return old;
 if(jobFingerprint(job)!==publication.fingerprint)throw Error('REVIEW_VERSION_CHANGED');
 if(job.facts.some(f=>f.sensitivity!=='low')||!canPublishWebJob(job))throw Error('PUBLICATION_CHECKS_FAILED');
 return publishWebJob(store,id,jobFingerprint(job),true,{...publication,approvalMethod:'scheduled_auto'});
}
