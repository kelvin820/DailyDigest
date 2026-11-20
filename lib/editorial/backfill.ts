import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {taipeiDate} from '../content/metrics';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import {defaultNewsSettings,type NewsSettings} from './news-config';
import type {WebJob} from './web-types';
export type BackfillReport={date:string;status:'pending'|'generating'|'published'|'failed';jobId?:string;error?:string;pdfs?:number;modelCalls?:number;sourceDates?:string[];imagesDone?:number;imagesFailed?:number};
export type BackfillCampaign={version:number;id:string;createdAt:string;status:'running'|'complete'|'needs_attention'|'cancelled';dates:string[];settings:NewsSettings;limits:{calls:number;tokens:number;images:number;usd:number};jobs:Record<string,string>;rounds:Record<string,string>;reports:BackfillReport[];runId?:string};
export const campaignKey=(id:string)=>WEB_PREFIX+'backfill:'+z.uuid().parse(id);
export function previousSevenDays(today=taipeiDate()){const start=Date.parse(today+'T00:00:00+08:00');return Array.from({length:7},(_,i)=>new Date(start-(7-i)*86400000+8*3600000).toISOString().slice(0,10));}
export async function createBackfill(store:DocumentStore,id:string,asOfDate=taipeiDate()){
 const key=campaignKey(id),old=await store.get<BackfillCampaign>(key);if(old)return old;
 z.iso.date().parse(asOfDate);if(asOfDate>taipeiDate())throw Error('FUTURE_ISSUE_DATE');
 const windowKey=WEB_PREFIX+'backfill-window:'+asOfDate,window=await store.get<{version:number;id:string}>(windowKey);if(window&&window.id!==id)throw Error('BACKFILL_ALREADY_EXISTS');
 if(!window&&!await store.create(windowKey,{version:1,id}))throw Error('BACKFILL_ALREADY_EXISTS');
 const dates=previousSevenDays(asOfDate),row:BackfillCampaign={version:1,id,createdAt:new Date().toISOString(),status:'running',dates,settings:structuredClone(defaultNewsSettings),limits:{calls:420,tokens:2_000_000,images:84,usd:(Number(process.env.DAILY_BUDGET_USD)||2)*7},jobs:{},rounds:{},reports:dates.map(date=>({date,status:'pending'}))};
 if(!await store.create(key,row))return (await store.get<BackfillCampaign>(key))!;return row;
}
export async function authorizedBackfill(store:DocumentStore,id:string,date:string){const grant=await store.get<BackfillCampaign>(campaignKey(id));if(!grant||grant.status!=='running'||!grant.dates.includes(date))throw Error('BACKFILL_NOT_AUTHORIZED');return grant;}
export async function prepareBackfillDay(store:DocumentStore,id:string,date:string){
 const grant=await authorizedBackfill(store,id,date);if(grant.jobs[date])return grant.jobs[date];
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
