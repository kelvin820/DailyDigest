import {start} from 'workflow/api';
import {HookConflictError} from 'workflow/errors';
import {dailyEditionWorkflow,generateEditionWorkflow,backfillWeekWorkflow} from '../../workflows/edition';
import {campaignKey,type BackfillCampaign} from './backfill';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import {newsPlanKey,emptyNewsPlan,type NewsPlan} from './news-config';
export async function startEdition(store:DocumentStore,id:string){
 let runId:string;try{runId=(await start(generateEditionWorkflow,[id],{experimental_hook:{token:'dayday:edition:'+id,experimental_minRetention:'7 days'}})).runId;}
 catch(e){if(!HookConflictError.is(e)||!e.conflictingRunId)throw e;runId=e.conflictingRunId;}
 await store.create(WEB_PREFIX+'workflow:job:'+id,{version:1,runId});return runId;
}
export async function startDaily(store:DocumentStore,date:string){
 const plan=await store.get<NewsPlan>(newsPlanKey(date)),attempt=plan?.workflowAttempt||0;
 let runId:string;try{runId=(await start(dailyEditionWorkflow,[date],{experimental_hook:{token:'dayday:daily:noon-ai-v6:'+date+(attempt?':recovery:'+attempt:''),experimental_minRetention:'7 days'}})).runId;}
 catch(e){if(!HookConflictError.is(e)||!e.conflictingRunId)throw e;runId=e.conflictingRunId;}
 await changeDocument<NewsPlan>(store,newsPlanKey(date),()=>emptyNewsPlan(date),p=>{p.runId=runId;p.updatedAt=new Date().toISOString();});return runId;
}
export async function startBackfill(store:DocumentStore,id:string){
 const campaign=await store.get<BackfillCampaign>(campaignKey(id));if(!campaign)throw Error('NOT_FOUND');
 let runId:string;try{runId=(await start(backfillWeekWorkflow,[id],{experimental_hook:{token:'dayday:backfill:'+id+':'+(campaign.attempt??1),experimental_minRetention:'7 days'}})).runId;}
 catch(e){if(!HookConflictError.is(e)||!e.conflictingRunId)throw e;runId=e.conflictingRunId;}
 await changeDocument<BackfillCampaign>(store,campaignKey(id),()=>{throw Error('NOT_FOUND');},c=>{c.runId=runId;});return runId;
}
