import {z} from 'zod';
import {json} from '../../../../lib/api';
import {documentStore,changeDocument} from '../../../../lib/editorial/web-store';
import {getRun} from 'workflow/api';
import {editorOrigin,requireEditor,validSetupAuthorization,equalSecret} from '../../../../lib/editorial/web-auth';
import {requestBody,webError} from '../../../../lib/editorial/web-api';
import {createBackfill,campaignKey,type BackfillCampaign} from '../../../../lib/editorial/backfill';
import {startBackfill} from '../../../../lib/editorial/background';
import {jobKey} from '../../../../lib/editorial/web-jobs';
import type {WebJob} from '../../../../lib/editorial/web-types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 editorOrigin(req);
 const input=z.object({action:z.enum(['start','status','resume','pause']),id:z.uuid(),asOfDate:z.iso.date().optional()}).strict().parse(await requestBody(req));
 const cron=process.env.CRON_SECRET?.trim(),reader=input.action==='status'&&cron&&equalSecret(req.headers.get('authorization')||'','Bearer '+cron);
 if(!reader&&!validSetupAuthorization(req.headers.get('authorization')))await requireEditor();
 const store=documentStore();
 if(input.action==='start'){const campaign=await createBackfill(store,input.id,input.asOfDate),runId=await startBackfill(store,campaign.id);return json({id:campaign.id,dates:campaign.dates,runId,limits:campaign.limits});}
 const campaign=await store.get<BackfillCampaign>(campaignKey(input.id));if(!campaign)throw Error('NOT_FOUND');
 if(input.action==='pause'||input.action==='resume'){
  if(campaign.runId){const run=getRun(campaign.runId),status=await run.status;if(status==='running'||status==='pending')await run.cancel();}
  await changeDocument<BackfillCampaign>(store,campaignKey(input.id),()=>{throw Error('NOT_FOUND');},c=>{c.status=input.action==='pause'?'needs_attention':'running';if(input.action==='resume')c.attempt=(c.attempt??1)+1;});
  return json({id:input.id,...(input.action==='resume'?{runId:await startBackfill(store,input.id)}:{paused:true})});
 }
 const jobs=await Promise.all(Object.entries(campaign.jobs).map(async([date,id])=>{const j=await store.get<WebJob>(jobKey(id));return {date,id,status:j?.status,error:j?.error,facts:j?.facts.length,editions:j?.editions.length,images:Object.keys(j?.imageStates??{}).length,pdfs:j?.pdfs.length,usage:j?.usage,events:j?.events.slice(-3)};}));return json({campaign,jobs});
}catch(e){return webError(e);}}
