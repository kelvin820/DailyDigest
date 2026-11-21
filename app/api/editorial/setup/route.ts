import {cookies} from 'next/headers';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {json} from '../../../../lib/api';
import {editorOrigin,editorSecret,equalSecret,editorToken,requireEditor,validSetupAuthorization,EDITOR_COOKIE} from '../../../../lib/editorial/web-auth';
import {requestBody,webError} from '../../../../lib/editorial/web-api';
import {withSetupDatabase,inspectDatabase,initializeDatabase} from '../../../../lib/editorial/web-setup';
import {documentStore,serviceDatabase,changeDocument,WEB_PREFIX} from '../../../../lib/editorial/web-store';
import {retryWebPdfs,retryWebGeneration,advanceWebJob} from '../../../../lib/editorial/web-jobs';
import {jobKey,releaseKey,jobFingerprint} from '../../../../lib/editorial/web-jobs';
import {dispatchWebPdfs} from '../../../../lib/pdf/dispatch';
import type {WebJob,WebRelease} from '../../../../lib/editorial/web-types';
import {hash} from '../../../../lib/pipeline/state.mjs';
import type {NewsRound} from '../../../../lib/editorial/news-config';
import {newsPlanKey,type NewsPlan} from '../../../../lib/editorial/news-config';
import {getRun} from 'workflow/api';
import {rebuildDraftPdfs,refreshApprovedPdfs,retryFilteredImages} from '../../../../lib/editorial/pdf-layout-refresh';
import {revalidatePath} from 'next/cache';
import {NVIDIA_IMAGE_MODELS} from '../../../../lib/providers/image';
import {runImageStudy} from '../../../../lib/editorial/image-study';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=240;
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('inspect'),secret:z.string().min(1).max(512).optional()}).strict(),
 z.object({action:z.literal('initialize'),confirmedProjectUrl:z.url(),reviewed:z.literal(true)}).strict(),
 z.object({action:z.literal('verify')}).strict(),
 z.object({action:z.literal('jobs')}).strict(),
 z.object({action:z.literal('job-detail'),id:z.uuid()}).strict(),
 z.object({action:z.literal('image-attempts'),id:z.uuid()}).strict(),
 z.object({action:z.literal('image-study'),id:z.uuid(),probeId:z.uuid(),storyId:z.string().min(1),edition:z.enum(['elementary','junior','senior']),mode:z.enum(['single','sheet']),model:z.enum(NVIDIA_IMAGE_MODELS)}).strict(),
 z.object({action:z.literal('news-rounds'),issueDate:z.iso.date()}).strict(),
 z.object({action:z.literal('reopen-selection'),issueDate:z.iso.date()}).strict(),
 z.object({action:z.literal('rebuild-pdfs'),id:z.uuid()}).strict(),
 z.object({action:z.literal('refresh-approved-pdfs'),id:z.uuid()}).strict(),
 z.object({action:z.literal('recover-pdfs'),id:z.uuid()}).strict(),
 z.object({action:z.literal('recover-generation'),id:z.uuid()}).strict(),
 z.object({action:z.literal('retry-filtered-images'),id:z.uuid()}).strict(),
 z.object({action:z.literal('pdf-preview'),id:z.uuid(),edition:z.enum(['elementary','junior','senior']),mode:z.enum(['color','ink'])}).strict(),
]);
export async function POST(req:Request){try{
 editorOrigin(req);const input=schema.parse(await requestBody(req));
 const automation=validSetupAuthorization(req.headers.get('authorization'));
 if(automation){/* Short-lived owner-provisioned setup token; no editor session. */}
 else if(input.action==='inspect'&&input.secret){
  if(!equalSecret(input.secret,editorSecret()))throw Error('UNAUTHORIZED');
  (await cookies()).set(EDITOR_COOKIE,editorToken(editorSecret()),{httpOnly:true,secure:process.env.VERCEL==='1'||new URL(req.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:8*3600});
 }else await requireEditor();
 if(input.action==='job-detail')return json({job:await documentStore().get<WebJob>(jobKey(input.id))});
 if(input.action==='image-attempts'){const attempts=await documentStore().list<{jobId:string;createdAt:string}>(WEB_PREFIX+'image-attempt:');return json({attempts:attempts.filter(a=>a.jobId===input.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))});}
 if(input.action==='image-study'){
  const study=await runImageStudy(documentStore(),input),paths=(study as {paths?:{key:string;path:string}[]}).paths??[],images=[];
  for(const file of paths){const {data,error}=await serviceDatabase().storage.from('issue-files').createSignedUrl(file.path,600);if(error||!data?.signedUrl)throw Error('IMAGE_STORAGE_FAILED');images.push({key:file.key,url:data.signedUrl});}
  return json({study,images});
 }
 if(input.action==='reopen-selection'){
  const store=documentStore(),plan=await store.get<NewsPlan>(newsPlanKey(input.issueDate));if(!plan)throw Error('NOT_FOUND');
  if(await store.get<WebRelease>(releaseKey(input.issueDate)))throw Error('ISSUE_ALREADY_PUBLISHED');
  if(plan.runId){const status=await getRun(plan.runId).status;if(status==='running'||status==='pending')throw Error('WORKFLOW_STILL_RUNNING');}
  await changeDocument<NewsPlan>(store,newsPlanKey(input.issueDate),()=>{throw Error('NOT_FOUND');},p=>{p.jobId=null;p.lockedAt=null;p.error=null;p.runId=undefined;if(p.selectedBy!=='manual'){p.selectedIds=[];p.selectedBy=null;}p.updatedAt=new Date().toISOString();});
  return json({reopened:true,priorWorkPreserved:true});
 }
 if(input.action==='news-rounds'){const rounds=await documentStore().list<NewsRound>(WEB_PREFIX+'news:round:');return json({rounds:rounds.filter(r=>r.issueDate===input.issueDate).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4).map(r=>({id:r.id,status:r.status,error:r.error,usage:r.usage,invalidReplies:r.invalidReplies}))});}
 if(input.action==='retry-filtered-images'){const job=await retryFilteredImages(documentStore(),input.id);return json({id:job.id,status:job.status,usage:job.usage});}
 if(input.action==='rebuild-pdfs'){const job=await rebuildDraftPdfs(documentStore(),input.id);return json({id:job.id,status:job.status,usage:job.usage});}
 if(input.action==='refresh-approved-pdfs'){
  const store=documentStore(),job=await store.get<WebJob>(jobKey(input.id)),before=job?await store.get<WebRelease>(releaseKey(job.issueDate)):null;
  const release=await refreshApprovedPdfs(store,input.id,(final,edition,folder)=>dispatchWebPdfs(final,edition,folder,jobFingerprint(job!)));
  if(job?.campaignId)await (await import('../../../../lib/editorial/backfill')).reportBackfillDay(store,job.campaignId,job.issueDate);
  const text=(r:WebRelease|null)=>r?.editions.map(e=>e.articles.map(a=>({headline:a.headline,body:a.bodyParagraphs,vocabulary:a.vocabulary})));
  const bodies=(r:WebRelease|null)=>r?.editions.map(e=>e.articles.map(a=>a.bodyParagraphs));
  revalidatePath('/');revalidatePath('/issues/'+release.issueDate);return json({id:release.jobId,pdfs:release.pdfs,approvedTextPreserved:hash(text(before))===hash(text(release)),approvedBodyPreserved:hash(bodies(before))===hash(bodies(release))});
 }
 if(input.action==='pdf-preview'){
  const jobs=await documentStore().list<WebJob>(WEB_PREFIX+'job:'),job=jobs.find(j=>j.id===input.id),file=job?.pdfs.find(p=>p.edition===input.edition&&p.mode===input.mode);
  if(!file||file.path!==`web-editorial/${input.id}/${input.edition}-${input.mode}.pdf`)throw Error('NOT_FOUND');
  const {data,error}=await serviceDatabase().storage.from('issue-files').download(file.path);if(error||!data)throw Error('PDF_STORAGE_FAILED');
  return new Response(await data.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store'}});
 }
 if(input.action==='jobs'){
  const jobs=await documentStore().list<WebJob>(WEB_PREFIX+'job:');return json({jobs:jobs.map(j=>({id:j.id,status:j.status,error:j.error,activeStep:j.activeStep,editions:j.editions.length,pdfs:j.pdfs.length,events:j.events,usage:j.usage}))});
 }
 if(input.action==='recover-generation'){
  const store=documentStore(),old=await store.get<WebJob>(jobKey(input.id));if(!old)throw Error('NOT_FOUND');
  if(old.status==='needs_attention')await retryWebGeneration(store,input.id);
  const job=await advanceWebJob(store,input.id);return json({id:job.id,status:job.status,error:job.error,pdfs:job.pdfs,editions:job.editions.length,activeStep:job.activeStep,usage:job.usage});
 }
 if(input.action==='recover-pdfs'){
  const store=documentStore(),jobs=await store.list<WebJob>(WEB_PREFIX+'job:'),old=jobs.find(j=>j.id===input.id);if(!old||old.editions.length!==3||old.activeStep)throw Error('PDF_RETRY_NOT_READY');
  if(old.status==='needs_attention')await retryWebPdfs(store,input.id);
  const job=await advanceWebJob(store,input.id,{render:(j,e)=>dispatchWebPdfs(j,e)});return json({id:job.id,status:job.status,error:job.error,pdfs:job.pdfs,usage:job.usage});
 }
 if(input.action==='verify'){
  const id=randomUUID(),store=documentStore(),key=WEB_PREFIX+'health:'+id;
  if(!await store.create(key,{version:1,kind:'setup_verification',createdAt:new Date().toISOString()}))throw Error('SETUP_VERIFICATION_FAILED');
  if(!await store.compare(key,1,{version:2,kind:'setup_verification',verifiedAt:new Date().toISOString()}))throw Error('SETUP_VERIFICATION_FAILED');
  if((await store.get<{version:number}>(key))?.version!==2)throw Error('SETUP_VERIFICATION_FAILED');
  const bucket=serviceDatabase().storage.from('issue-files'),path='setup-probe/'+id+'.txt',contents='DayDay private storage verification '+id;
  const metadata=await serviceDatabase().storage.getBucket('issue-files');if(metadata.error||metadata.data?.public!==false)throw Error('SETUP_VERIFICATION_FAILED');
  const uploaded=await bucket.upload(path,Buffer.from(contents),{contentType:'text/plain',upsert:false});if(uploaded.error)throw Error('SETUP_VERIFICATION_FAILED');
  try{
   const downloaded=await bucket.download(path);if(downloaded.error||await downloaded.data.text()!==contents)throw Error('SETUP_VERIFICATION_FAILED');
   const signed=await bucket.createSignedUrl(path,60);if(signed.error||!signed.data?.signedUrl)throw Error('SETUP_VERIFICATION_FAILED');
  }finally{const removed=await bucket.remove([path]);if(removed.error)throw Error('SETUP_VERIFICATION_FAILED');}
  return json({databaseReadWrite:true,compareAndSwap:true,privateStorage:true,signedDownloads:true});
 }
 return await withSetupDatabase(async(client,projectUrl)=>{
  if(input.action==='inspect')return json({projectUrl,...await inspectDatabase(client)});
  const result=await initializeDatabase(client,projectUrl,input.confirmedProjectUrl);
  console.info('editorial_database_initialized',{migrations:result.migrations});return json({success:true,...result});
 });
}catch(e){return webError(e);}}
