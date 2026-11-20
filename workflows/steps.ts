import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {documentStore} from '../lib/editorial/web-store';
import {advanceWebJob,retryWebPdfs,jobKey,canPublishWebJob,jobFingerprint} from '../lib/editorial/web-jobs';
import {scheduledPlan,prepareScheduledJob,recordNewsFailure,publishScheduledJob} from '../lib/editorial/news-schedule';
import type {WebJob,WebPdf} from '../lib/editorial/web-types';
import {editionKeys} from '../config/editions';
import {renderWebPdfs} from '../lib/pdf/vercel';
import {verifyWebPdfs} from '../lib/editorial/web-files';
export async function loadDailyStep(date:string){'use step';return scheduledPlan(documentStore(),date);}
export async function prepareDailyStep(date:string){'use step';return prepareScheduledJob(documentStore(),date);}
prepareDailyStep.maxRetries=0;
export async function recordDailyFailureStep(date:string,code:string){'use step';await recordNewsFailure(documentStore(),date,code.replace(/https?:\/\/\S+/g,'[url]').slice(0,180));}
export async function advanceEditionStep(id:string){
 'use step';
 const store=documentStore();let job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 // PDF errors are safe to retry; an in-flight model request is never repeated.
 if(job.status==='needs_attention'&&job.editions.length===3&&!job.activeStep&&job.error?.startsWith('PDF_'))job=await retryWebPdfs(store,id);
 if(job.status!=='needs_attention')job=await advanceWebJob(store,id,{maxModelSteps:3});
 return {status:job.status,error:job.error};
}
advanceEditionStep.maxRetries=0;
export async function publicationStep(id:string){
 'use step';
 const job=await documentStore().get<WebJob>(jobKey(id));if(!job||!canPublishWebJob(job))throw Error('PUBLICATION_CHECKS_FAILED');
 await verifyWebPdfs(job);const releasedAt=new Date().toISOString(),final=structuredClone(job);final.editions=final.editions.map(i=>({...i,reviewCopy:false,publishedAt:releasedAt}));final.pdfs=[];
 const folder='published-'+randomUUID();for(const edition of editionKeys)final.pdfs.push(...await renderWebPdfs(final,edition,undefined,folder));
 return {pdfs:final.pdfs,releasedAt,fingerprint:jobFingerprint(job)};
}
export async function publishDailyStep(id:string,publication:{pdfs:WebPdf[];releasedAt:string;fingerprint:string}){
 'use step';
 const release=await publishScheduledJob(documentStore(),id,{...publication,releasedAt:new Date().toISOString()});revalidatePath('/');revalidatePath('/issues');revalidatePath('/issues/'+release.issueDate);return release.issueDate;
}
