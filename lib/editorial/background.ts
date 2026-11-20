import {start} from 'workflow/api';
import {HookConflictError} from 'workflow/errors';
import {dailyEditionWorkflow,generateEditionWorkflow} from '../../workflows/edition';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import {newsPlanKey,emptyNewsPlan,type NewsPlan} from './news-config';
export async function startEdition(store:DocumentStore,id:string){
 let runId:string;try{runId=(await start(generateEditionWorkflow,[id],{experimental_hook:{token:'dayday:edition:'+id,experimental_minRetention:'7 days'}})).runId;}
 catch(e){if(!HookConflictError.is(e)||!e.conflictingRunId)throw e;runId=e.conflictingRunId;}
 await store.create(WEB_PREFIX+'workflow:job:'+id,{version:1,runId});return runId;
}
export async function startDaily(store:DocumentStore,date:string){
 let runId:string;try{runId=(await start(dailyEditionWorkflow,[date],{experimental_hook:{token:'dayday:daily:'+date,experimental_minRetention:'7 days'}})).runId;}
 catch(e){if(!HookConflictError.is(e)||!e.conflictingRunId)throw e;runId=e.conflictingRunId;}
 await changeDocument<NewsPlan>(store,newsPlanKey(date),()=>emptyNewsPlan(date),p=>{p.runId=runId;p.updatedAt=new Date().toISOString();});return runId;
}
