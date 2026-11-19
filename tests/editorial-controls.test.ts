import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {publicationCatalog} from '../lib/publications/catalog';
import {regenerationRequestSchema} from '../lib/editorial/requests';
import {sourceLibrary} from '../lib/editorial/library';
import {resolveRegeneration,regenerateOneStory,draftErrors} from '../lib/editorial/regeneration';
import {timingSummary} from '../lib/editorial/timing';
import {renderArticle} from '../lib/render.mjs';
import {advisoryDraftCheck} from '../lib/editorial/readability';
import {editionSchema} from '../lib/schemas/edition';
import {validateIssue} from '../lib/content/core.mjs';
import type {TextModelProvider,GenerationRequest} from '../lib/providers/text';
import {hash} from '../lib/pipeline/state.mjs';

const base=publicationCatalog.packets.at(-1)!;
const input=()=>({version:1,base:{kind:'packet',id:base.id,fingerprint:base.fingerprint},storyId:base.facts[0].story_id,mode:'rewrite',category:base.facts[0].primary_category,editions:['junior'],direction:'用來源中的具體細節引發好奇，減少抽象詞。'});
const dependencies={packets:publicationCatalog.packets,benchmarks:[],library:sourceLibrary};
test('single-level rewrite calls only its writer and reviewer; all other article snapshots and release stay unchanged',async()=>{
 const before=hash(publicationCatalog),resolved=resolveRegeneration(input(),dependencies),old=base.editions.find(i=>i.edition==='junior')!.articles[0];
 const calls:{task:string;data:unknown}[]=[];
 const provider:TextModelProvider={async generateStructured<T>(request:GenerationRequest<T>){calls.push({task:request.task,data:request.data});const reply=request.task==='review'?{factual_status:'pass',level_fit:'suitable',suitability:'pass',issues:[],publish_recommendation:'pass',readership:{interest:3,information:4,readability:4,reason:'測試用評語',suggestion:'測試建議'}}:{headline:'A New Review Headline',body_paragraphs:old.bodyParagraphs,vocabulary:old.vocabulary,used_claim_ids:resolved.fact.claims.filter(c=>c.must_keep).map(c=>c.claim_id),omitted_optional_claim_ids:[],editorial_flags:[]};return{data:request.schema.parse(reply) as T,usage:{input_tokens:1,output_tokens:1}};}};
 const drafts=await regenerateOneStory(resolved,{provider,writer:await readFile('prompts/writer.v1.txt','utf8'),reviewer:await readFile('prompts/reviewer.v1.txt','utf8'),measure:async(_k,_i,run)=>({reply:await run(),ms:10,calls:1})});
 assert.deepEqual(calls.map(c=>c.task),['write','review']);
 const previous=(calls[0].data as {previousLevelTerms:string[]}).previousLevelTerms;
 assert.deepEqual(new Set(previous),new Set(base.editions.filter(i=>i.edition!=='junior').flatMap(i=>i.articles[0].vocabulary.map(v=>v.term))));
 for(const issue of base.editions)for(const a of issue.articles){const d=drafts.find(d=>d.edition===issue.edition&&d.storyId===a.storyId)!;if(issue.edition==='junior'&&a.storyId===resolved.request.storyId)assert.equal(d.reused,false);else{assert.equal(d.reused,true);assert.deepEqual(d.article,a);}}
 assert.equal(hash(publicationCatalog),before);assert.equal(drafts.filter(d=>!d.reused).length,1);
});
test('category replacement requires a matching read source, changes all levels, rejects duplicate events and stale versions',()=>{
 const replacement=sourceLibrary.find(s=>s.category==='science'&&!base.facts.some(f=>f.story_id===s.id))!;
 const request={...input(),mode:'replace',category:'science',replacementFactId:replacement.id,editions:['elementary','junior','senior']};
 const resolved=resolveRegeneration(request,dependencies);assert.equal(resolved.fact.story_id,replacement.id);assert.deepEqual(resolved.facts.slice(1),base.facts.slice(1));
 assert.equal(regenerationRequestSchema.safeParse({...request,editions:['junior']}).success,false);
 assert.throws(()=>resolveRegeneration({...request,category:'games'},dependencies),/CATEGORY_SOURCE_NOT_READY/);
 assert.throws(()=>resolveRegeneration({...request,replacementFactId:base.facts[1].story_id,category:base.facts[1].primary_category},dependencies),/REPLACEMENT_EVENT_ALREADY_USED/);
 assert.throws(()=>resolveRegeneration({...input(),base:{...input().base,fingerprint:'0'.repeat(64)}},dependencies),/STALE_REGENERATION_BASE/);
 assert.throws(()=>resolveRegeneration({...input(),category:'politics'},dependencies),/REWRITE_CANNOT_RECLASSIFY_SOURCE/);
});
test('readability checks reject reused learning words and unsupported tracking IDs; timing excludes reused drafts',()=>{
 const a=base.editions[0].articles[0],fact=base.facts[0];
 const errors=draftErrors({headline:a.headline,body_paragraphs:a.bodyParagraphs,vocabulary:a.vocabulary,used_claim_ids:['invented'],omitted_optional_claim_ids:[],editorial_flags:[]},fact,'elementary',[a.vocabulary[0].term]);
 assert.ok(errors.some(e=>e.includes('重複選字')));assert.ok(errors.some(e=>e.includes('claim ID')));
 const d=resolveRegeneration(input(),dependencies).drafts[0];
 assert.deepEqual(timingSummary([{...d,reused:false,writerMs:100,reviewerMs:300,writerCalls:2,reviewerCalls:1},{...d,reused:true,writerMs:99999,reviewerMs:99999}]),{writerMs:100,reviewerMs:300,medianMs:100,p95Ms:300,repairs:1,tested:1});
 const monthly={...a,sources:a.sources.map(s=>({...s,publishedAt:'2026-11-01T00:00:00Z',publishedAtPrecision:'month'}))};
 assert.match(renderArticle(monthly),/>2026-11<\/span>/);assert.doesNotMatch(renderArticle(monthly),/2026-11-01/);
});
test('local developer release bypass is refused before any publication file is changed',async()=>{
 const before=await readFile('content/publications/catalog.json','utf8');
 const result=spawnSync(process.execPath,['--import','tsx','scripts/release-edition.ts'],{env:{...process.env,PACKET_ID:base.id,EXPECTED_FINGERPRINT:base.fingerprint,RELEASE_ACTOR:'test',RELEASE_METHOD:'developer_test_release'},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/EXPLICIT_RELEASE_REQUIRED/);assert.equal(await readFile('content/publications/catalog.json','utf8'),before);
});
test('advisory length removes numerical blockers without accepting missing vocabulary or dishonest word counts',()=>{
 const issue=structuredClone(base.editions[0]);issue.lengthPolicy='advisory';
 const a=issue.articles[0];a.bodyParagraphs=[Array(4).fill(a.bodyParagraphs.join(' ')).join(' ')];a.wordCount*=4;
 assert.equal(editionSchema.safeParse(issue).success,true);assert.deepEqual(validateIssue(issue),[]);
 assert.equal(editionSchema.safeParse({...issue,lengthPolicy:'strict'}).success,false);
 const bad=structuredClone(issue);bad.articles[0].wordCount++;assert.equal(editionSchema.safeParse(bad).success,false);
 bad.articles[0].wordCount--;bad.articles[0].vocabulary[0].term='not-in-the-body';assert.equal(editionSchema.safeParse(bad).success,false);
 const d=resolveRegeneration(input(),dependencies).drafts[0];
 const review={factual_status:'pass',level_fit:'suitable',suitability:'pass',publish_recommendation:'pass',issues:[],readership:{interest:3,information:4,readability:4,reason:'Test fixture',suggestion:''}} as const;
 const candidate={...d,reused:false,writerCalls:1,reviewerCalls:1,errors:['字數 65，目標 40–60','句長超過目標'],assessment:{...review,issues:[]}};
 assert.equal(advisoryDraftCheck(candidate).eligible,true);assert.equal(advisoryDraftCheck({...candidate,errors:[...candidate.errors,'單字未實際出現在正文']}).eligible,false);
 assert.equal(advisoryDraftCheck({...candidate,assessment:{...candidate.assessment,factual_status:'needs_revision'}}).eligible,false);
});
