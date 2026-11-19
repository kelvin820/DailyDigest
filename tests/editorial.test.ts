import {readFile} from 'node:fs/promises';
import {recoverReviewedArticle} from '../lib/pipeline/recover-reviewed';
import {learningTermKey} from '../lib/content/vocabulary.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { demoIssue } from '../fixtures/issue';
import { produceEditions } from '../lib/pipeline/editorial';
import { factSchema, writerSchema } from '../lib/schemas/editorial';
import { editionSchema } from '../lib/schemas/edition';
import { containsTerm } from '../lib/content/core.mjs';
import { publishGate } from '../lib/pipeline/gates.mjs';
import { hash, Budget } from '../lib/pipeline/state.mjs';
import { CompatibleProvider, type TextModelProvider } from '../lib/providers/text';
import { revisedPayload } from '../lib/schemas/revision';
import {editions} from '../config/editions';
import {renderPrint} from '../lib/render.mjs';

const date = '2026-11-17T00:00:00Z';
const elementary = demoIssue('elementary');
const facts = elementary.articles.map(a => factSchema.parse({ story_id: a.storyId,
  event_key: 'synthetic-' + a.storyId, primary_category: a.category, content_kind: a.contentKind,
  published_at: date, event_date: null, is_demo: true, sensitivity: 'low', uncertainties: [],
  sources: [{ source_id: 'fixture', url: 'https://example.org/demo-only', publisher: 'DayDay fictional fixture',
    published_at: date, retrieved_at: date, read_at: date, rights_reviewed: true,
    independence_group: 'dayday-fixture', evidence: a.bodyParagraphs.join(' ') }],
  claims: [{ claim_id: 'core', text: a.bodyParagraphs[0], supporting_source_ids: ['fixture'],
    evidence_ref: 'fixture', status: 'reported', must_keep: true }],
}));
const goodReview = { factual_status: 'pass', level_fit: 'suitable', suitability: 'pass', issues: [], publish_recommendation: 'pass' };
const options = { facts, issueDate: '2026-11-17', revision: 1, writerModel: 'fixture-writer', reviewerModel: 'fixture-reviewer' };
function memoryStore() {
  const map = new Map<string, unknown>();
  return { get: async (k: string) => map.get(k), set: async (k: string, v: unknown) => { map.set(k, v); } };
}

test('three writers use the same facts; 24 reviews; repeat run reuses success; DEMO stays DEMO', async () => {
  const seen: unknown[] = [];let reviewCalls=0;
  const provider: TextModelProvider = { async generateStructured(input) {
    let response: unknown = goodReview;if(input.task==='review')reviewCalls++;
    if (input.task !== 'review') {
      const { fact,previousLevelTerms=[] } = input.data as { fact: typeof facts[number];previousLevelTerms?:string[] }; seen.push(fact);
      const edition = input.system.match(/Audience edition: (elementary|junior|senior)/)?.[1] as 'elementary' | 'junior' | 'senior';
      const article = demoIssue(edition).articles.find(a => a.storyId === fact.story_id)!;
      response = { headline: article.headline, body_paragraphs: article.bodyParagraphs,
        vocabulary: [...new Set(article.bodyParagraphs.join(' ').match(/[A-Za-z]{4,}/g))].filter(t=>!previousLevelTerms.some(p=>learningTermKey(p)===learningTermKey(t))).slice(0,2).map(term=>({term,definitionEn:'Synthetic test definition',meaningZhHant:'測試詞義'})), used_claim_ids: ['core'], omitted_optional_claim_ids: [], editorial_flags: [] };
    }
    return { data: input.schema.parse(response), usage: { input_tokens: 0, output_tokens: 0 } };
  } };
  const store = memoryStore();
  const content = await produceEditions({ ...options, provider, store });
  assert.equal(content.reviews.length, 24); assert.equal(seen.length, 24);
  for (let i = 0; i < 24; i++) assert.strictEqual(seen[i], facts[i % 8]);
  assert.ok(content.editions.every(p => p.isDemo));
  const candidate={writer:await store.get('demo-1:elementary:write:0'),review:await store.get('demo-1:elementary:review:0'),
    fact:facts[0],index:0,config:editions.elementary,previousLevelTerms:[],reviewerModel:options.reviewerModel,
    reviewPrompt:await readFile('prompts/reviewer.v1.txt','utf8'),provider:undefined};
  assert.deepEqual(recoverReviewedArticle(candidate)?.article,content.editions[0].articles[0]);
  assert.equal(recoverReviewedArticle({...candidate,fact:{...facts[0],event_key:'different-facts'}}),undefined);
  assert.equal(recoverReviewedArticle({...candidate,previousLevelTerms:content.editions[0].articles[0].vocabulary.map(v=>v.term)}),undefined);

  await produceEditions({ ...options, provider, store }); assert.equal(seen.length, 24);
  assert.equal(reviewCalls,24);
  const rawBefore=hash(await store.get('demo-1:elementary:write:0'));
  const edited=await produceEditions({...options,provider,store,editorPolicyHash:'synthetic-copy-edit-v1',
    editDraft:async({data})=>({...data,headline:data.headline+'.'})});
  assert.equal(reviewCalls,48);assert.equal(hash(await store.get('demo-1:elementary:write:0')),rawBefore);
  assert.equal(edited.editions[0].articles[0].headline,content.editions[0].articles[0].headline+'.');

  const files = content.editions.flatMap(p => ['color', 'ink'].map(mode => ({ edition: p.edition, mode,
    pages: 2, noOverflow: true, textVerified: true, fontsEmbedded: true,
    revision: p.revision, issueDate: p.issueDate, templateVersion: p.templateVersion, contentHash: hash(p) })));
  assert.equal(publishGate({ ...content, facts, files, live: false }).pass, true);
  assert.equal(publishGate({ ...content, facts, files }).pass, false);
  const future=structuredClone(facts);future[0].sources[0].published_at='2026-11-18T00:00:00Z';
  assert.ok(publishGate({...content,facts:future,files,live:false}).errors.includes('Source publication outside issue window'));
  // A previous PDF cannot validate changed text merely because revision and date match.
  files[0].contentHash = 'stale';
  assert.ok(publishGate({ ...content, facts, files, live: false }).errors.some(s => s.includes('stale')));
});
test('invalid lengths get at most two revisions and no wasted reviewer call', async () => {
  let calls = 0;
  const a = elementary.articles[0];
  const provider: TextModelProvider = { async generateStructured(input) {
    calls++; assert.notEqual(input.task, 'review');
    return { data: input.schema.parse({ headline: a.headline, body_paragraphs: ['Short.'],
      vocabulary: a.vocabulary, used_claim_ids: ['core'], omitted_optional_claim_ids: [], editorial_flags: [] }),
    usage: { input_tokens: 0, output_tokens: 0 } };
  } };
  await assert.rejects(produceEditions({ ...options, provider, store: memoryStore() }), /NEEDS_REVIEW/);
  assert.equal(calls, 3);
});
test('writer failure and invented claims cannot turn into publication', async () => {
  const provider: TextModelProvider = { async generateStructured(input) {
    return { data: input.schema.parse({ failure: { code: 'insufficient_evidence', reason: 'Test only' } }),
      usage: { input_tokens: 0, output_tokens: 0 } };
  } };
  await assert.rejects(produceEditions({ ...options, provider, store: memoryStore() }), /WRITER_INSUFFICIENT_EVIDENCE/);
  assert.equal(factSchema.safeParse({ ...facts[0], claims: [{ ...facts[0].claims[0], supporting_source_ids: ['invented'] }] }).success, false);
});
test('schema and revisions reject executable URLs, absent/duplicate vocabulary, and changed protected fields', () => {
  assert.equal(containsTerm('A child learns C++ today.', 'C++'), true);
  assert.equal(containsTerm('The actor is reading.', 'act'), false);
  assert.equal(containsTerm('A small plan is ready.', 'plan.'), false);
  const bad = structuredClone(elementary); bad.articles[0].sources[0].url = 'javascript:alert(1)';
  assert.equal(editionSchema.safeParse(bad).success, false);
  const duplicate = structuredClone(elementary); duplicate.articles[0].vocabulary[1] = duplicate.articles[0].vocabulary[0];
  assert.equal(editionSchema.safeParse(duplicate).success, false);
  const a = elementary.articles[0];
  const input = { expectedFingerprint: 'a'.repeat(64), edition: 'elementary' as const,
    storyId: a.storyId, headline: a.headline, bodyParagraphs: a.bodyParagraphs,
    vocabulary: a.vocabulary, correctionNote: 'Synthetic correction' };
  const changed = revisedPayload(elementary, input);
  assert.equal(changed.articles[0].wordCount, a.wordCount);
  assert.equal(elementary.articles[0].correctionNote, undefined);
  assert.deepEqual(changed.articles[0].sources, a.sources);
});
test('old editions retain their validation bounds and actual CEFR label after new defaults change',()=>{
  const original={...editions.senior};
  try{
    editions.senior.cefr='B2';editions.senior.min=120;
    const old=demoIssue('senior');assert.equal(old.targetCefr,'B1');assert.ok(editionSchema.safeParse(old).success);
    const b2={...old,targetCefr:'B2' as const,readingRules:{min:90,max:120,avg:18,maxSentence:28}};
    assert.ok(editionSchema.safeParse(b2).success);assert.ok(renderPrint(b2,'color').includes('Senior High / B2'));
  }finally{Object.assign(editions.senior,original)}
});
test('provider waits for durable reservation, accounts timeout, and never calls network after budget refusal', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw Error('synthetic timeout'); });
  const budget = new Budget({ maxCalls: 1, inputRate: undefined, outputRate: undefined });
  const provider = new CompatibleProvider('https://provider.example/v1', 'fixture-only-not-a-real-key', budget);
  const request = { task: 'write' as const, system: 'Fixture', data: {}, schema: writerSchema,
    model: 'fixture-model', timeoutMs: 1000, maxOutputTokens: 50 };
  await assert.rejects(provider.generateStructured(request), /MODEL_TIMEOUT_OR_NETWORK/);
  assert.equal(budget.ledger[0].status, 'usage_unknown');
  await assert.rejects(provider.generateStructured(request), /BUDGET_EXCEEDED/);
  assert.equal(requests, 1);
  const refused = new CompatibleProvider('https://provider.example/v1', 'fixture-only-not-a-real-key', {
    async reserve() { throw Error('BUDGET_EXCEEDED'); }, settle() {}, fail() {},
  });
  await assert.rejects(refused.generateStructured(request), /BUDGET_EXCEEDED/);
  assert.equal(requests, 1);
});

test('repeated glossary terms across levels trigger revision instead of silently reusing the beginner glossary',async()=>{
  let juniorWrites=0;
  const provider:TextModelProvider={async generateStructured(input){
    if(input.task==='review')return{data:input.schema.parse(goodReview),usage:{input_tokens:0,output_tokens:0}};
    const {fact,previousLevelTerms}=input.data as {fact:typeof facts[number];previousLevelTerms:string[]};
    const edition=input.system.match(/Audience edition: (elementary|junior|senior)/)?.[1] as 'elementary'|'junior'|'senior';
    const a=demoIssue(edition).articles.find(a=>a.storyId===fact.story_id)!;
    if(edition==='junior'){juniorWrites++;assert.equal(previousLevelTerms.length,2);assert.match(input.system,/Choose different terms/);}
    return{data:input.schema.parse({headline:a.headline,body_paragraphs:a.bodyParagraphs,vocabulary:a.vocabulary,
      used_claim_ids:['core'],omitted_optional_claim_ids:[],editorial_flags:[]}),usage:{input_tokens:0,output_tokens:0}};
  }};
  await assert.rejects(produceEditions({...options,facts:facts.slice(0,4),provider,store:memoryStore()}),/NEEDS_REVIEW:demo-1:junior/);
  assert.equal(juniorWrites,3);
});

test('manual trial can retain minor-only review holds, while major issues and publication remain blocked',async()=>{
 const makeProvider=(major=false):TextModelProvider=>({async generateStructured(input){
  if(input.task==='review')return{data:input.schema.parse({...goodReview,publish_recommendation:'revise',issues:[{severity:major?'major':'minor',span:'synthetic',reason:'Test-only review suggestion',claim_ids:[],suggested_action:'Human review'}]}),usage:{input_tokens:0,output_tokens:0}};
  const {fact,previousLevelTerms=[]}=input.data as{fact:typeof facts[number];previousLevelTerms:string[]};
  const edition=input.system.match(/Audience edition: (elementary|junior|senior)/)?.[1] as 'elementary'|'junior'|'senior';
  const a=demoIssue(edition).articles.find(a=>a.storyId===fact.story_id)!;
  const vocabulary=[...new Set(a.bodyParagraphs.join(' ').match(/[A-Za-z]{4,}/g))].filter(t=>!previousLevelTerms.some(p=>learningTermKey(p)===learningTermKey(t))).slice(0,2).map(term=>({term,definitionEn:'Synthetic definition',meaningZhHant:'測試詞義'}));
  return{data:input.schema.parse({headline:a.headline,body_paragraphs:a.bodyParagraphs,vocabulary,used_claim_ids:['core'],omitted_optional_claim_ids:[],editorial_flags:[]}),usage:{input_tokens:0,output_tokens:0}};
 }});
 const four={...options,facts:facts.slice(0,4)};
 await assert.rejects(produceEditions({...four,provider:makeProvider(),store:memoryStore()}),/NEEDS_REVIEW/);
 const content=await produceEditions({...four,provider:makeProvider(),store:memoryStore(),allowMinorReviewHolds:true});
 assert.equal(content.reviews.length,12);assert.ok(content.reviews.every(r=>r.publish_recommendation==='revise'));
 assert.ok(publishGate({...content,facts:four.facts,files:[],live:false}).errors.includes('Review not passed'));
 await assert.rejects(produceEditions({...four,provider:makeProvider(true),store:memoryStore(),allowMinorReviewHolds:true}),/NEEDS_REVIEW/);
});
