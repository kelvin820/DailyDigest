import {randomUUID} from 'node:crypto';
import {editionKeys,type Edition} from '../../config/editions';
import {hash} from '../pipeline/state.mjs';
import {jobKey,jobFingerprint,releaseKey,saveJob} from './web-jobs';
import type {DocumentStore} from './web-store';
import type {WebJob,WebRelease,WebPdf} from './web-types';
import {publicationEditions,verifiedNewsDates} from './event-date';

export async function rebuildDraftPdfs(store:DocumentStore,id:string){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(job.status!=='needs_review'||job.editions.length!==3||job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('PDF_RETRY_NOT_READY');
 job.pdfs=[];job.status='pending';job.error=null;job.events.push({at:new Date().toISOString(),message:'套用新版 PDF 版面，保留正文、複核與模型用量'});await saveJob(store,job);return job;
}
type Render=(job:WebJob,edition:Edition,folder:string)=>Promise<WebPdf[]>;
export async function refreshApprovedPdfs(store:DocumentStore,id:string,render:Render){
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 const key=releaseKey(job.issueDate),old=await store.get<WebRelease>(key);
 if(!old||old.jobId!==id||job.status!=='needs_review'||job.pdfs.length!==6)throw Error('PUBLICATION_CONFLICT');
 const approved=publicationEditions(job,old.releasedAt);
 // A layout-only refresh cannot publish different or unapproved text.
 if(hash(approved)!==hash(verifiedNewsDates(old.editions,job.facts)))throw Error('REVIEW_VERSION_CHANGED');
 if(old.fingerprint===jobFingerprint(job)&&hash(approved)===hash(old.editions))return old;
 const final={...job,editions:approved,pdfs:[] as WebPdf[]},folder='published-'+randomUUID();
 for(const edition of editionKeys)final.pdfs.push(...await render(final,edition,folder));
 const release={...old,version:old.version+1,editions:approved,pdfs:final.pdfs,fingerprint:jobFingerprint(job),pdfLayoutUpdatedAt:new Date().toISOString()};
 if(!await store.compare(key,old.version,release))throw Error('PUBLICATION_CONFLICT');return release;
}
