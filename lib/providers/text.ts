import {z} from "zod";import type {Budget} from "../pipeline/state.mjs";
export type Task="select"|"facts"|"write"|"review"|"revise";
export interface TextModelProvider{generateStructured<T>(input:{task:Task;system:string;data:unknown;schema:z.ZodType<T>;model:string;timeoutMs:number;maxOutputTokens:number}):Promise<{data:T;usage:{input_tokens:number;output_tokens:number};providerRequestId?:string}>}
export class FixtureProvider implements TextModelProvider{constructor(private response:unknown){}async generateStructured<T>(i:Parameters<TextModelProvider["generateStructured"]>[0]){return {data:i.schema.parse(this.response) as T,usage:{input_tokens:0,output_tokens:0},providerRequestId:"fixture-not-live"}}}
// Enable only when the chosen provider explicitly supports this OpenAI-compatible contract.
export class CompatibleProvider implements TextModelProvider{
constructor(private baseUrl:string,private key:string,private budget:Budget){const u=new URL(baseUrl);if(u.protocol!=="https:"||u.username||u.password)throw Error("Invalid provider endpoint")}
async generateStructured<T>(i:{task:Task;system:string;data:unknown;schema:z.ZodType<T>;model:string;timeoutMs:number;maxOutputTokens:number}){
const user=JSON.stringify({untrusted_data:i.data});const inputEstimate=Math.ceil((i.system.length+user.length)/2)+2000;
for(let attempt=0;attempt<3;attempt++){const ticket=this.budget.reserve(inputEstimate,i.maxOutputTokens);let response:Response;
try{response=await fetch(this.baseUrl.replace(/\/$/,"")+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+this.key,"Content-Type":"application/json"},signal:AbortSignal.timeout(i.timeoutMs),body:JSON.stringify({model:i.model,messages:[{role:"system",content:i.system+"\nReturn JSON matching this schema: "+JSON.stringify(z.toJSONSchema(i.schema))},{role:"user",content:user}],response_format:{type:"json_object"},max_tokens:i.maxOutputTokens})})}catch{this.budget.fail(ticket);throw Error("MODEL_TIMEOUT_OR_NETWORK")}
if(!response.ok){this.budget.fail(ticket);if([429,500,502,503,504].includes(response.status)&&attempt<2){const retry=response.headers.get("retry-after");const seconds=retry?(Number(retry)||Math.max(0,(Date.parse(retry)-Date.now())/1000)):2**attempt;if(seconds>30)throw Error("MODEL_RETRY_LATER");await new Promise(r=>setTimeout(r,seconds*1000+Math.random()*300));continue}throw Error("MODEL_HTTP_"+response.status)}
const raw=await response.json();const usage={input_tokens:raw.usage?.prompt_tokens,output_tokens:raw.usage?.completion_tokens};if(!Number.isFinite(usage.input_tokens)||!Number.isFinite(usage.output_tokens)){this.budget.fail(ticket);throw Error("MODEL_USAGE_MISSING")}this.budget.settle(ticket,usage);let data:T;try{data=i.schema.parse(JSON.parse(raw.choices[0].message.content))}catch{throw Error("MODEL_SCHEMA_INVALID")}return {data,usage,providerRequestId:raw.id}
}throw Error("MODEL_RETRY_EXHAUSTED")}}

