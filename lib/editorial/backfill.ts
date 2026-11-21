import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {taipeiDate} from '../content/metrics';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import {defaultNewsSettings,type NewsSettings} from './news-config';
import type {WebJob} from './web-types';
import {hash} from '../pipeline/state.mjs';
import {restoreCandidateSnapshot} from './candidate-snapshot';
export type BackfillReport={date:string;status:'pending'|'generating'|'published'|'failed';jobId?:string;error?:string;pdfs?:number;modelCalls?:number;sourceDates?:string[];imagesDone?:number;imagesFailed?:number};
export type BackfillCampaign={version:number;id:string;createdAt:string;status:'running'|'complete'|'needs_attention'|'cancelled';dates:string[];settings:NewsSettings;limits:{calls:number;tokens:number;images:number;usd:number};jobs:Record<string,string>;rounds:Record<string,string>;reports:BackfillReport[];runId?:string;attempt?:number};
export const campaignKey=(id:string)=>WEB_PREFIX+'backfill:'+z.uuid().parse(id);
export function previousSevenDays(today=taipeiDate()){const start=Date.parse(today+'T00:00:00+08:00');return Array.from({length:7},(_,i)=>new Date(start-(7-i)*86400000+8*3600000).toISOString().slice(0,10));}
export async function createBackfill(store:DocumentStore,id:string,asOfDate=taipeiDate()){
 const key=campaignKey(id),old=await store.get<BackfillCampaign>(key);if(old)return old;
 z.iso.date().parse(asOfDate);if(asOfDate>taipeiDate())throw Error('FUTURE_ISSUE_DATE');
 const windowKey=WEB_PREFIX+'backfill-window:'+asOfDate,window=await store.get<{version:number;id:string}>(windowKey);if(window&&window.id!==id)throw Error('BACKFILL_ALREADY_EXISTS');
 if(!window&&!await store.create(windowKey,{version:1,id}))throw Error('BACKFILL_ALREADY_EXISTS');
 const dates=previousSevenDays(asOfDate),row:BackfillCampaign={version:1,id,createdAt:new Date().toISOString(),status:'running',dates,settings:structuredClone(defaultNewsSettings),limits:{calls:420,tokens:2_000_000,images:112,usd:(Number(process.env.DAILY_BUDGET_USD)||2)*7},jobs:{},rounds:{},reports:dates.map(date=>({date,status:'pending'}))};
 if(!await store.create(key,row))return (await store.get<BackfillCampaign>(key))!;return row;
}
export async function authorizedBackfill(store:DocumentStore,id:string,date:string){const grant=await store.get<BackfillCampaign>(campaignKey(id));if(!grant||grant.status!=='running'||!grant.dates.includes(date))throw Error('BACKFILL_NOT_AUTHORIZED');return grant;}
export async function prepareBackfillDay(store:DocumentStore,id:string,date:string){
 const grant=await authorizedBackfill(store,id,date);
 if(grant.jobs[date]){
  const job=await store.get<WebJob>(WEB_PREFIX+'job:'+grant.jobs[date]);if(!job)throw Error('NOT_FOUND');
  // A refreshed shortlist can rank the same URL differently. Reuse only the
  // exact original candidate snapshot, never weaken the paid checkpoint hash.
  if(job.input.kind==='news'){
   const cached=(c:import('./news-config').NewsCandidate)=>job.checkpoints['intake:'+c.id]??job.checkpoints['intake-rejected:'+c.id];
   const candidates=[...(job.intakeCandidates??[]),...(job.additionalNewsCandidates??[])];
   if(candidates.some(c=>cached(c)&&cached(c).inputHash!==hash(c))){
    if(job.activeStep||job.lease&&job.lease.expiresAt>Date.now())throw Error('JOB_BUSY');
    const {newsRoundKey}=await import('./news-config');
    const rounds=await Promise.all([job.input.roundId,...(job.recoveryRounds??[])].map(id=>store.get<import('./news-config').NewsRound>(newsRoundKey(id))));
    const snapshots=rounds.flatMap(r=>r?.candidates??[]),restore=(c:import('./news-config').NewsCandidate)=>cached(c)?restoreCandidateSnapshot(c,cached(c).inputHash,snapshots):c;
    job.intakeCandidates=job.intakeCandidates?.map(restore);job.additionalNewsCandidates=job.additionalNewsCandidates?.map(restore);
    await (await import('./web-jobs')).saveJob(store,job);
   }
  }
  if(job.editions.length||job.facts.length===4||job.sourceRecoveryVersion===2)return job.id;
  if(job.lease&&job.lease.expiresAt>Date.now())throw Error('JOB_BUSY');
  const ledger=await store.get<{reservations:{jobId:string;status:string}[]}>(WEB_PREFIX+'usage:backfill:'+id);
  if(ledger?.reservations.some(r=>r.jobId===job.id&&['reserved','unknown'].includes(r.status)))throw Error('USAGE_RECONCILIATION_REQUIRED');
  if(job.activeStep&&job.error!=='MODEL_SCHEMA_INVALID')throw Error('USAGE_RECONCILIATION_REQUIRED');
  const {refreshNewsRound}=await import('./news'),{newsRoundKey}=await import('./news-config');
  const round=await refreshNewsRound(store,date,randomUUID(),{historical:true,settings:grant.settings,campaignId:id,minSourceDate:grant.dates[0]});
  if(job.input.kind!=='news')throw Error('INVALID_BACKFILL_JOB');
  const old=await store.get<import('./news-config').NewsRound>(newsRoundKey(job.input.roundId));
  const all=[...(job.intakeCandidates??[]),...(old?.candidates??[]),...round.candidates];
  const selected=[...job.facts.map(f=>all.find(c=>'news-'+c.id.slice(0,24)===f.story_id)!),...job.input.sourceIds.map(key=>all.find(c=>c.id===key)!)].filter(Boolean);
  job.intakeCandidates=[...new Map(selected.map(c=>[c.id,c])).values()].slice(0,4);
  job.additionalNewsCandidates=round.candidates;job.recoveryRounds=[...(job.recoveryRounds??[]),round.id];job.rejectedNewsIds=[];job.sourceRecoveryVersion=2;
  job.activeStep=null;job.lease=null;job.status='pending';job.error=null;job.events.push({at:new Date().toISOString(),message:'修正來源引文格式核對，沿用已儲存回覆與事實，補充新的 shortlist 候選'});
  await (await import('./web-jobs')).saveJob(store,job);return job.id;
 }
 const {refreshNewsRound}=await import('./news');
 const round=await refreshNewsRound(store,date,grant.rounds[date]||randomUUID(),{historical:true,settings:grant.settings,campaignId:id,minSourceDate:grant.dates[0]});
 await changeDocument<BackfillCampaign>(store,campaignKey(id),()=>{throw Error('NOT_FOUND');},r=>{r.rounds[date]=round.id;});
 const {createWebJob}=await import('./web-jobs'),jobId=randomUUID();
 await createWebJob(store,jobId,{kind:'news',issueDate:date,roundId:round.id,sourceIds:round.recommendedIds,direction:grant.settings.direction,imageGeneration:true,autoSelect:true,campaignId:id});
 await changeDocument<BackfillCampaign>(store,campaignKey(id),()=>{throw Error('NOT_FOUND');},r=>{r.jobs[date]=jobId;r.reports=r.reports.map(p=>p.date===date?{date,status:'generating',jobId}:p);});return jobId;
}
export async function reportBackfillDay(store:DocumentStore,id:string,date:string,error?:string){
 const grant=await store.get<BackfillCampaign>(campaignKey(id));if(!grant)throw Error('NOT_FOUND');
 const jobId=grant.jobs[date],job=jobId?await store.get<WebJob>(WEB_PREFIX+'job:'+jobId):null;
 await changeDocument<BackfillCampaign>(store,campaignKey(id),()=>{throw Error('NOT_FOUND');},r=>{r.reports=r.reports.map(p=>p.date===date?{date,jobId,status:error?'failed':'published',...(error?{error:error.replace(/https?:\/\/\S+/g,'[url]').slice(0,180)}:{}),pdfs:job?.pdfs.length,modelCalls:job?.usage.calls,sourceDates:job?.facts.map(f=>f.published_at),imagesDone:Object.values(job?.imageStates??{}).filter(s=>s==='done').length,imagesFailed:Object.values(job?.imageStates??{}).filter(s=>s!=='done').length}:p);});
}
