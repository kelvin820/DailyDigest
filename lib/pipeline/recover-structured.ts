import type {GenerationRequest,InvalidStructuredReply} from '../providers/text';
import {hash} from './state.mjs';
export function recoverStructuredReply<T>(checkpoints:Record<string,unknown>,key:string,request:GenerationRequest<T>){
 for(const attempt of [1,0]){
  const c=checkpoints['invalid:'+key+':'+attempt] as {status?:string;inputHash?:string;outputHash?:string;output?:InvalidStructuredReply}|undefined;
  if(!c||c.status!=='success'||!c.output||c.inputHash!==hash({task:request.task,model:request.model})||c.outputHash!==hash(c.output)||c.output.task!==request.task||c.output.model!==request.model)continue;
  try{const parsed=request.schema.safeParse(JSON.parse(c.output.content));if(parsed.success)return {data:parsed.data,usage:{input_tokens:0,output_tokens:0},providerRequestId:'recovered-paid-reply'};}catch{/* Incomplete replies require a new, accounted request. */}
 }
}
