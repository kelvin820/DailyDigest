import {json} from '../../../../../lib/api';
import {requireEditor,editorOrigin} from '../../../../../lib/editorial/web-auth';
import {documentStore} from '../../../../../lib/editorial/web-store';
import {advanceWebJob,retryWebPdfs,jobKey,jobFingerprint,canPublishWebJob} from '../../../../../lib/editorial/web-jobs';
import type {WebJob} from '../../../../../lib/editorial/web-types';
import {webError} from '../../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=240;
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{await requireEditor();const job=await documentStore().get<WebJob>(jobKey((await params).id));if(!job)throw Error('NOT_FOUND');return json({job,fingerprint:jobFingerprint(job),canPublish:canPublishWebJob(job)});}catch(e){return webError(e);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{editorOrigin(req);await requireEditor();const job=await advanceWebJob(documentStore(),(await params).id);return json({job,fingerprint:jobFingerprint(job),canPublish:canPublishWebJob(job)});}catch(e){return webError(e);}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{editorOrigin(req);await requireEditor();const job=await retryWebPdfs(documentStore(),(await params).id);return json({job,fingerprint:jobFingerprint(job),canPublish:canPublishWebJob(job)});}catch(e){return webError(e);}}
