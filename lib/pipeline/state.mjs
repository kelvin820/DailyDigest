import {createHash} from "node:crypto";
export const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function cacheKey({input,promptVersion,model,config}){return hash({input,promptVersion,model,config})}
export function leaseAvailable(lease,owner,now=Date.now()){return !lease||lease.owner===owner||lease.expiresAt<=now}
export class Budget{constructor({usd=2,inputRate,outputRate,maxCalls=100,maxTokens=200000}){this.limit=usd;this.inputRate=inputRate;this.outputRate=outputRate;this.maxCalls=maxCalls;this.maxTokens=maxTokens;this.calls=0;this.tokens=0;this.spent=0;this.reserved=0;this.ledger=[]}
reserve(inputTokens,maxOutput){const tokens=inputTokens+maxOutput;const known=Number.isFinite(this.inputRate)&&Number.isFinite(this.outputRate);const cost=known?(inputTokens*this.inputRate+maxOutput*this.outputRate)/1e6:0;if(this.calls+1>this.maxCalls||this.tokens+tokens>this.maxTokens||this.spent+this.reserved+cost>this.limit)throw Error("BUDGET_EXCEEDED");this.calls++;this.tokens+=tokens;this.reserved+=cost;return {tokens,cost,known}}
settle(ticket,usage){this.reserved-=ticket.cost;const used=usage.input_tokens+usage.output_tokens;this.tokens+=used-ticket.tokens;const cost=ticket.known?(usage.input_tokens*this.inputRate+usage.output_tokens*this.outputRate)/1e6:null;if(cost!==null)this.spent+=cost;this.ledger.push({...usage,cost,status:cost===null?"cost_unknown":"estimated"});if(this.tokens>this.maxTokens||this.spent>this.limit)throw Error("BUDGET_EXCEEDED")}
fail(ticket){this.reserved-=ticket.cost;this.spent+=ticket.cost;this.ledger.push({status:"usage_unknown",reserved:ticket.cost})}}
export async function cachedStep(store,key,input,run){const h=hash(input);const previous=await store.get(key);if(previous?.status==="success"&&previous.inputHash===h)return previous.output;const output=await run();await store.set(key,{status:"success",inputHash:h,output,outputHash:hash(output)});return output}
export function dedupe(candidates,history){const seen=new Set(history.filter(x=>!x.substantiveUpdate).map(x=>x.eventKey));return candidates.filter(x=>{const k=x.eventKey;if(seen.has(k)&&!x.substantiveUpdate)return false;seen.add(k);return true})}

