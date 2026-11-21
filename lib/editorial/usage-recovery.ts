import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import {campaignKey,type BackfillCampaign} from './backfill';
import {jobKey,saveJob} from './web-jobs';
import type {WebJob} from './web-types';
import {hash} from '../pipeline/state.mjs';
type Usage={version:number;calls:number;tokens:number;spent:number;reservations:{id:string;jobId:string;status:string;tokens:number;cost:number;at:string;acknowledgedAt?:string;acknowledgement?:{notes:string;actor:string}}[]};
export async function acknowledgeBackfillUsage(store:DocumentStore,id:string,notes:string,actor:string){
 if(notes.trim().length<40)throw Error('USAGE_REVIEW_NOTES_REQUIRED');
 const job=await store.get<WebJob>(jobKey(id));if(!job?.campaignId||job.input.kind!=='news'||job.status!=='needs_attention'||job.error!=='USAGE_RECONCILIATION_REQUIRED'||!job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('USAGE_REVIEW_NOT_READY');
 const campaign=await store.get<BackfillCampaign>(campaignKey(job.campaignId));if(!campaign||campaign.status!=='needs_attention'||campaign.jobs[job.issueDate]!==id)throw Error('USAGE_REVIEW_NOT_READY');
 const key=WEB_PREFIX+'usage:backfill:'+job.campaignId,ledger=await store.get<Usage>(key),pending=ledger?.reservations.filter(r=>r.jobId===id&&['reserved','unknown'].includes(r.status)&&!r.acknowledgedAt)??[];
 if(!pending.length||pending.some(r=>r.status!=='unknown'||Date.parse(r.at)>Date.now()-300000))throw Error('USAGE_REVIEW_NOT_READY');
 const at=new Date().toISOString(),tickets=pending.map(r=>r.id);
 await changeDocument<Usage>(store,key,()=>{throw Error('MISSING_BUDGET');},v=>{for(const ticket of tickets){const r=v.reservations.find(r=>r.id===ticket);if(!r||r.status!=='unknown')throw Error('USAGE_REVIEW_CHANGED');r.acknowledgedAt=at;r.acknowledgement={notes,actor};}});
 // Unknown status, calls, reserved tokens and the conservative cost charge all
 // remain intact. Only an explicit owner-authorized continuation is recorded.
 const output={at,notes,actor,tickets,interruptedStep:job.activeStep};job.checkpoints['usage-review:'+hash(output)]={status:'success',inputHash:hash({jobId:id,interruptedStep:job.activeStep}),output,outputHash:hash(output)};
 job.activeStep=null;job.status='pending';job.error=null;job.sourceRecoveryVersion=2;job.events.push({at,message:'管理權限已記錄續作理由，未知用量與原預留全數保留；只補作未完成步驟，沿用原試刊總上限'});await saveJob(store,job);
 return {id,status:job.status,acknowledged:tickets.length,retainedUnknown:true,budgetUnchanged:true};
}
