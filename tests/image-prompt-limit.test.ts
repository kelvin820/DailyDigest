import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedNewsImagePrompt} from '../lib/media/audience';
import {compactIllustrationSheetPrompt} from '../lib/media/illustration-sheet';
import {randomUUID} from 'node:crypto';
import {retryImagePromptLimit} from '../lib/editorial/pdf-layout-refresh';
import {importReviewPacket,jobKey} from '../lib/editorial/web-jobs';
import {publicationCatalog} from '../lib/publications/catalog';
import type {DocumentStore} from '../lib/editorial/web-store';
import type {WebJob} from '../lib/editorial/web-types';
test('800-character image prompts retain age styles and complete claims, without cutting facts',()=>{
 const claims=['Microsoft restored services after a global outage that affected businesses and public services worldwide.','The outage disrupted services in more than 70 countries and territories.'];
 for(const edition of ['elementary','junior','senior'] as const){const r=boundedNewsImagePrompt(claims,'technology',edition);assert.ok(r.prompt.length<=800);assert.ok(r.prompt.includes(claims[0]));assert.ok(r.prompt.includes(claims[1]));assert.match(r.prompt,/watercolor/);assert.equal(r.topic,false);
 const huge=boundedNewsImagePrompt(['A'.repeat(500)],'technology',edition);assert.ok(huge.prompt.length<=800);assert.equal(huge.topic,true);}
 const sheet=compactIllustrationSheetPrompt('Students look through a telescope at an eclipse.');assert.ok(sheet.length<=800);assert.match(sheet,/pure black ink on white/);assert.throws(()=>compactIllustrationSheetPrompt('A'.repeat(800)),/SUBJECT_TOO_LONG/);
});
test('legacy prompt repairs require owner-verified model evidence and preserve every paid attempt',async()=>{
 const rows=new Map<string,unknown>(),store:DocumentStore={async get<T>(key:string){return structuredClone(rows.get(key) as T??null);},async create(key,value){if(rows.has(key))return false;rows.set(key,structuredClone(value));return true;},async compare(key,version,value){if((rows.get(key) as {version:number})?.version!==version)return false;rows.set(key,structuredClone(value));return true;},async list<T>(prefix:string){return [...rows].filter(([key])=>key.startsWith(prefix)).map(([,v])=>structuredClone(v) as T);}};
 const base=publicationCatalog.packets.find(p=>p.id==='2026-11-19-r5')!,id=randomUUID(),job=await importReviewPacket(store,id,base.id,base.fingerprint),slot='elementary:'+job.facts[0].story_id;
 job.input={kind:'news',issueDate:job.issueDate,roundId:randomUUID(),sourceIds:job.facts.map(f=>f.story_id),direction:'',imageGeneration:true,autoSelect:false};job.status='needs_attention';job.error='AI_IMAGES_INCOMPLETE';job.facts[0].claims[0].text='Microsoft restored services after a global outage that affected businesses and public services worldwide. '.repeat(4).trim();job.imageStates={[slot]:'failed'};job.imageErrors={[slot]:'IMAGE_HTTP_422'};job.imageAttempts={[slot]:2};job.usage={calls:37,inputTokens:10000,outputTokens:1000};rows.set(jobKey(id),structuredClone(job));
 await assert.rejects(()=>retryImagePromptLimit(store,id),/IMAGE_RETRY_NOT_READY/);
 const repaired=await retryImagePromptLimit(store,id,'black-forest-labs/flux.2-klein-4b');assert.equal(repaired.status,'pending');assert.equal(repaired.imageAttempts?.[slot],2);assert.equal(repaired.imageErrors?.[slot],'IMAGE_HTTP_422');assert.deepEqual(repaired.usage,job.usage);assert.ok(repaired.imagePromptRecoverySlots?.includes(slot));assert.deepEqual(repaired.editions,job.editions);assert.equal((await store.get<WebJob>(jobKey(id)))?.activeStep,null);
});
