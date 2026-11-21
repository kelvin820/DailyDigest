import {z} from 'zod';
import {json} from '../../../../lib/api';
import {equalSecret} from '../../../../lib/editorial/web-auth';
import {documentStore,changeDocument,WEB_PREFIX} from '../../../../lib/editorial/web-store';
import {jobKey,jobFingerprint,canPublishWebJob} from '../../../../lib/editorial/web-jobs';
import type {WebJob,WebPdf} from '../../../../lib/editorial/web-types';
import {publicationEditions} from '../../../../lib/editorial/event-date';
import {renderWebPdfs} from '../../../../lib/pdf/vercel';
import {hash} from '../../../../lib/pipeline/state.mjs';
import {requestBody} from '../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const schema=z.object({id:z.uuid(),edition:z.enum(['elementary','junior','senior']),folder:z.string().regex(/^(?:published-[a-f0-9-]{36})?$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),releasedAt:z.iso.datetime().optional()}).strict();
export async function POST(req:Request){
 const secret=process.env.CRON_SECRET?.trim();if(!secret||!equalSecret(req.headers.get('authorization')||'','Bearer '+secret))return json({error:'UNAUTHORIZED'},401);
 try{
  const input=schema.parse(await requestBody(req)),store=documentStore(),job=await store.get<WebJob>(jobKey(input.id));
  if(!job||job.editions.length!==3||jobFingerprint(job)!==input.fingerprint)throw Error('PDF_WORKER_STALE');
  if(input.folder&&(!input.releasedAt||!canPublishWebJob(job)))throw Error('PDF_PUBLICATION_CHECKS');
  const key=WEB_PREFIX+'pdf:render:'+hash(input),saved=await store.get<{version:number;pdfs:WebPdf[]}>(key),target=structuredClone(job);target.pdfs=saved?.pdfs??[];
  if(input.folder)target.editions=publicationEditions(job,input.releasedAt!);
  const pdfs=await renderWebPdfs(target,input.edition,undefined,input.folder,async file=>{await changeDocument<{version:number;pdfs:WebPdf[]}>(store,key,()=>({version:0,pdfs:[]}),v=>{v.pdfs=v.pdfs.filter(p=>p.path!==file.path).concat(file);});});
  return json({pdfs});
 }catch(error){const message=error instanceof Error?error.message:'';console.error('pdf_worker_request_failed',{code:/^PDF_[A-Z_]+$/.test(message)?message:'PDF_WORKER_FAILED'});return json({error:/^PDF_[A-Z_]+$/.test(message)?message:'PDF_WORKER_FAILED'},500);}
}
