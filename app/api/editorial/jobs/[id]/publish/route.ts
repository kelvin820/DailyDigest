import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {editionKeys} from '../../../../../../config/editions';
import {revalidatePath} from 'next/cache';
import {json} from '../../../../../../lib/api';
import {requireEditor,editorOrigin} from '../../../../../../lib/editorial/web-auth';
import {documentStore} from '../../../../../../lib/editorial/web-store';
import {publishWebJob,jobKey,jobFingerprint,canPublishWebJob,releaseKey} from '../../../../../../lib/editorial/web-jobs';
import type {WebJob,WebRelease} from '../../../../../../lib/editorial/web-types';
import {verifyWebPdfs} from '../../../../../../lib/editorial/web-files';
import {dispatchWebPdfs} from '../../../../../../lib/pdf/dispatch';
import {publicationEditions} from '../../../../../../lib/editorial/event-date';
import {webError,requestBody} from '../../../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const maxDuration=240;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
 editorOrigin(req);await requireEditor();const input=z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),reviewed:z.literal(true)}).strict().parse(await requestBody(req));
 const store=documentStore(),id=(await params).id,job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 if(!canPublishWebJob(job)||jobFingerprint(job)!==input.fingerprint)throw Error('PUBLICATION_CHECKS_FAILED');
 const previous=await store.get<WebRelease>(releaseKey(job.issueDate));if(previous?.jobId===id)return json({released:true,date:previous.issueDate});
 await verifyWebPdfs(job);
 const releasedAt=new Date().toISOString(),final=structuredClone(job);final.editions=publicationEditions(job,releasedAt);
 const folder='published-'+randomUUID();final.pdfs=[];
 for(const edition of editionKeys)final.pdfs.push(...await dispatchWebPdfs(final,edition,folder,input.fingerprint));
 const release=await publishWebJob(store,id,input.fingerprint,input.reviewed,{pdfs:final.pdfs,releasedAt});
 revalidatePath('/');revalidatePath('/issues');revalidatePath('/issues/'+release.issueDate);return json({released:true,date:release.issueDate});
}catch(e){return webError(e);}}
