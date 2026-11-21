import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {WEB_PREFIX,type DocumentStore} from './web-store';
const schema=z.object({version:z.literal(1),jobId:z.uuid(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),folder:z.string().regex(/^published-[a-f0-9-]{36}$/),releasedAt:z.iso.datetime()}).strict();
export async function publicationPlan(store:DocumentStore,jobId:string,fingerprint:string){
 const key=WEB_PREFIX+'publication-plan:'+jobId+':'+fingerprint,prior=await store.get(key);
 if(prior){const plan=schema.parse(prior);if(plan.jobId!==jobId||plan.fingerprint!==fingerprint)throw Error('PDF_PUBLICATION_PLAN_CHANGED');return plan;}
 const plan=schema.parse({version:1,jobId,fingerprint,folder:'published-'+randomUUID(),releasedAt:new Date().toISOString()});
 if(!await store.create(key,plan))return publicationPlan(store,jobId,fingerprint);return plan;
}
