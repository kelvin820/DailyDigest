import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveImageSlot} from '../lib/editorial/image-budget';
import {audienceTopicPrompt} from '../lib/media/audience';
import type {DocumentStore} from '../lib/editorial/web-store';
class MemoryStore implements DocumentStore{
 rows=new Map<string,unknown>();async get<T>(key:string){return structuredClone(this.rows.get(key) as T??null);}
 async create<T extends {version:number}>(key:string,v:T){if(this.rows.has(key))return false;this.rows.set(key,structuredClone(v));return true;}
 async compare<T extends {version:number}>(key:string,version:number,v:T){if((this.rows.get(key) as T)?.version!==version)return false;this.rows.set(key,structuredClone(v));return true;}
 async list<T>(){return [...this.rows.values()] as T[];}
}
test('bounded topic alternatives preserve rejected attempts, require an original attempt, and keep ordinary daily limits',async()=>{
 const store=new MemoryStore(),key='ledger';
 for(let i=0;i<84;i++)await reserveImageSlot(store,key,'job'+Math.floor(i/12)+':'+i,112,true);
 await assert.rejects(()=>reserveImageSlot(store,key,'extra:1',84,true),/BUDGET/);
 for(let i=0;i<12;i++)await reserveImageSlot(store,key,'job0:'+i,112,true,true);
 const ledger=await store.get<{slots:string[];rejectedSlots:string[]}>(key);assert.equal(ledger?.slots.length,96);assert.equal(ledger?.rejectedSlots.length,12);
 await assert.rejects(()=>reserveImageSlot(store,key,'job0:0',112,true,true),/ALREADY_ATTEMPTED/);

 await assert.rejects(()=>reserveImageSlot(store,key,'unknown:one',112,true,true),/REJECTION_NOT_RECORDED/);
 for(let i=0;i<16;i++)await reserveImageSlot(store,'day','day:'+i,16,false);
 await assert.rejects(()=>reserveImageSlot(store,'day','day:0',16,false,true),/BUDGET/);
 const prompt=audienceTopicPrompt('technology','elementary');assert.match(prompt,/No people, characters, brands, weapons or violence/);assert.match(prompt,/No text, letters, logos/);
});
