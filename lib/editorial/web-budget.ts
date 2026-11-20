import {randomUUID} from 'node:crypto';
import type {BudgetPort} from '../providers/text';
import {changeDocument,WEB_PREFIX,type DocumentStore} from './web-store';
import {authorizedBackfill} from './backfill';

type Reservation={id:string;jobId:string;tokens:number;input:number;output:number;cost:number;known:boolean;status:'reserved'|'settled'|'unknown';at:string};
type DailyUsage={version:number;calls:number;tokens:number;spent:number;reservations:Reservation[]};
const positive=(key:string,fallback:number)=>{const n=Number(process.env[key]);return Number.isFinite(n)&&n>0?n:fallback;};
export function webBudget(store:DocumentStore,jobId:string,onUsage:(input:number,output:number)=>Promise<void>,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),scope?:{id:string;issueDate:string}):BudgetPort{
 const key=WEB_PREFIX+'usage:'+(scope?'backfill:'+scope.id:day);
 return {
  async reserve(input,output){
   const grant=scope?await authorizedBackfill(store,scope.id,scope.issueDate):null;
   const id=randomUUID(),a=process.env.LLM_INPUT_USD_PER_MILLION,b=process.env.LLM_OUTPUT_USD_PER_MILLION;
   const known=!!a&&!!b&&Number.isFinite(Number(a))&&Number(a)>=0&&Number.isFinite(Number(b))&&Number(b)>=0;
   const cost=known?(input*Number(a)+output*Number(b))/1e6:0;
   await changeDocument<DailyUsage>(store,key,()=>({version:0,calls:0,tokens:0,spent:0,reservations:[]}),v=>{
    if(v.reservations.some(r=>r.jobId===jobId&&r.status==='unknown'))throw Error('USAGE_RECONCILIATION_REQUIRED');
    const reserved=v.reservations.filter(r=>r.status==='reserved').reduce((s,r)=>s+r.cost,0);
    if(v.calls+1>(grant?.limits.calls??positive('MAX_MODEL_CALLS',100))||v.tokens+input+output>(grant?.limits.tokens??positive('MAX_MODEL_TOKENS',200000))||v.spent+reserved+cost>(grant?.limits.usd??positive('DAILY_BUDGET_USD',2)))throw Error('BUDGET_EXCEEDED');
    v.calls++;v.tokens+=input+output;v.reservations.push({id,jobId,tokens:input+output,input:0,output:0,cost,known,status:'reserved',at:new Date().toISOString()});
   });return id;
  },
  async settle(ticket,usage){
   await changeDocument<DailyUsage>(store,key,()=>{throw Error('MISSING_BUDGET');},v=>{
    const r=v.reservations.find(r=>r.id===ticket);if(!r||r.status!=='reserved')throw Error('INVALID_BUDGET_TICKET');
    v.tokens+=usage.input_tokens+usage.output_tokens-r.tokens;r.input=usage.input_tokens;r.output=usage.output_tokens;r.status='settled';
    if(r.known)v.spent+=(usage.input_tokens*Number(process.env.LLM_INPUT_USD_PER_MILLION)+usage.output_tokens*Number(process.env.LLM_OUTPUT_USD_PER_MILLION))/1e6;
   });await onUsage(usage.input_tokens,usage.output_tokens);
  },
  async fail(ticket){await changeDocument<DailyUsage>(store,key,()=>{throw Error('MISSING_BUDGET');},v=>{const r=v.reservations.find(r=>r.id===ticket);if(r&&r.status==='reserved'){r.status='unknown';v.spent+=r.cost;}});},
 };
}
