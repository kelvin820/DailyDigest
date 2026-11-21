import test from 'node:test';
import assert from 'node:assert/strict';
import {withPdfBrowserSlot} from '../lib/pdf/browser-slot';
import {publicationPlan} from '../lib/editorial/publication-plan';
import type {DocumentStore} from '../lib/editorial/web-store';
import {randomUUID} from 'node:crypto';
test('PDF requests never overlap in one process and a failed browser releases the next request',async()=>{
 let active=0,peak=0;const run=async(fail:boolean)=>withPdfBrowserSlot(async()=>{peak=Math.max(peak,++active);try{await new Promise(r=>setTimeout(r,10));if(fail)throw Error('closed');return 'complete';}finally{active--;}});
 const result=await Promise.allSettled([run(true),run(false),run(false)]);assert.equal(peak,1);assert.deepEqual(result.map(r=>r.status),['rejected','fulfilled','fulfilled']);
});
test('publication retries reuse the same PDF folder and receipt inputs while changed content gets a new plan',async()=>{
 const rows=new Map<string,unknown>(),store={async get(key:string){return rows.get(key)||null;},async create(key:string,value:unknown){if(rows.has(key))return false;rows.set(key,value);return true;}} as DocumentStore,id=randomUUID();
 const first=await publicationPlan(store,id,'a'.repeat(64)),same=await publicationPlan(store,id,'a'.repeat(64)),changed=await publicationPlan(store,id,'b'.repeat(64));assert.deepEqual(first,same);assert.notEqual(first.folder,changed.folder);assert.equal(rows.size,2);
});
