import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {documentStore} from '../lib/editorial/web-store';
import {advanceWebJob,retryWebPdfs,retryPromptSnapshot,jobKey,canPublishWebJob,jobFingerprint} from '../lib/editorial/web-jobs';
import {scheduledPlan,prepareScheduledJob,recordNewsFailure,publishScheduledJob} from '../lib/editorial/news-schedule';
import type {WebJob,WebPdf} from '../lib/editorial/web-types';
import {editionKeys} from '../config/editions';
import {renderWebPdfs} from '../lib/pdf/vercel';
import {verifyWebPdfs} from '../lib/editorial/web-files';
import {campaignKey,prepareBackfillDay,reportBackfillDay,type BackfillCampaign} from '../lib/editorial/backfill';
import {changeDocument} from '../lib/editorial/web-store';
import {publicationEditions} from '../lib/editorial/event-date';
export async function loadDailyStep(date:string){'use step';return scheduledPlan(documentStore(),date);}
export async function prepareDailyStep(date:string){'use step';return prepareScheduledJob(documentStore(),date);}
prepareDailyStep.maxRetries=0;
export async function recordDailyFailureStep(date:string,code:string){'use step';await recordNewsFailure(documentStore(),date,code.replace(/https?:\/\/\S+/g,'[url]').slice(0,180));}
export async function advanceEditionStep(id:string){
 'use step';
 const store=documentStore();let job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status==='needs_attention'&&job.error==='GENERATION_PROMPTS_CHANGED')job=await retryPromptSnapshot(store,id);
 // PDF errors are safe to retry; an in-flight model request is never repeated.
 if(job.status==='needs_attention'&&job.editions.length===3&&!job.activeStep&&job.error?.startsWith('PDF_'))job=await retryWebPdfs(store,id);
 if(job.status!=='needs_attention')job=await advanceWebJob(store,id,{maxModelSteps:3});
 return {status:job.status,error:job.error};
}
advanceEditionStep.maxRetries=0;
export async function publicationStep(id:string){
 'use step';
 const job=await documentStore().get<WebJob>(jobKey(id));if(!job||!canPublishWebJob(job))throw Error('PUBLICATION_CHECKS_FAILED');
 await verifyWebPdfs(job);const releasedAt=new Date().toISOString(),final=structuredClone(job);final.editions=publicationEditions(job,releasedAt);final.pdfs=[];
 const folder='published-'+randomUUID();for(const edition of editionKeys)final.pdfs.push(...await renderWebPdfs(final,edition,undefined,folder));
 return {pdfs:final.pdfs,releasedAt,fingerprint:jobFingerprint(job)};
}
export async function publishDailyStep(id:string,publication:{pdfs:WebPdf[];releasedAt:string;fingerprint:string}){
 'use step';
 const release=await publishScheduledJob(documentStore(),id,{...publication,releasedAt:new Date().toISOString()});revalidatePath('/');revalidatePath('/issues');revalidatePath('/issues/'+release.issueDate);return release.issueDate;
}
export async function loadBackfillStep(id:string){'use step';const c=await documentStore().get<BackfillCampaign>(campaignKey(id));if(!c||c.status!=='running')throw Error('BACKFILL_NOT_AUTHORIZED');return c.dates.filter(date=>!c.reports.some(r=>r.date===date&&r.status==='published'&&r.imagesDone===12));}
export async function prepareBackfillStep(id:string,date:string){'use step';return prepareBackfillDay(documentStore(),id,date);}
prepareBackfillStep.maxRetries=0;
export async function reportBackfillStep(id:string,date:string,error?:string){'use step';await reportBackfillDay(documentStore(),id,date,error);}
export async function finishBackfillStep(id:string){'use step';return changeDocument<BackfillCampaign>(documentStore(),campaignKey(id),()=>{throw Error('NOT_FOUND');},c=>{c.status=c.reports.every(r=>r.status==='published'&&r.imagesDone===12)?'complete':'needs_attention';});}
