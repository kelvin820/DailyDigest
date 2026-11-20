import {json} from '../../../../../lib/api';
import {requireEditor,editorOrigin,validSetupAuthorization} from '../../../../../lib/editorial/web-auth';
import {documentStore,WEB_PREFIX} from '../../../../../lib/editorial/web-store';
import {startEdition} from '../../../../../lib/editorial/background';
import {advanceWebJob,retryWebPdfs,retryWebGeneration,jobKey,jobFingerprint,canPublishWebJob} from '../../../../../lib/editorial/web-jobs';
import type {WebJob} from '../../../../../lib/editorial/web-types';
import {webError} from '../../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=240;
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{await requireEditor();const job=await documentStore().get<WebJob>(jobKey((await params).id));if(!job)throw Error('NOT_FOUND');return json({job,fingerprint:jobFingerprint(job),canPublish:canPublishWebJob(job)});}catch(e){return webError(e);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
 editorOrigin(req);const automation=validSetupAuthorization(req.headers.get('authorization'));if(!automation)await requireEditor();
 const store=documentStore(),id=(await params).id;
 if(automation){const old=await store.get<WebJob>(jobKey(id));if(!old||old.editions.length!==3||old.activeStep)throw Error('FORBIDDEN');if(old.status==='needs_attention')await retryWebPdfs(store,id);}
 const current=await store.get<WebJob>(jobKey(id));if(current?.execution==='workflow'){
  const run=await store.get<{runId:string}>(WEB_PREFIX+'workflow:job:'+id);if(!run)await startEdition(store,id);
  return json({job:current,fingerprint:jobFingerprint(current),canPublish:canPublishWebJob(current)});
 }
 const job=await advanceWebJob(store,id,{maxModelSteps:3});return json({job,fingerprint:jobFingerprint(job),canPublish:canPublishWebJob(job)});
}catch(e){return webError(e);}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{editorOrigin(req);await requireEditor();const store=documentStore(),id=(await params).id,current=await store.get<WebJob>(jobKey(id));if(!current)throw Error('NOT_FOUND');const job=current.editions.length?await retryWebPdfs(store,id):await retryWebGeneration(store,id);return json({job,fingerprint:jobFingerprint(job),canPublish:canPublishWebJob(job)});}catch(e){return webError(e);}}
