import {z} from 'zod';
import {editionKeys,editions,type Edition} from '../../config/editions';
import type {Packet} from '../publications/catalog';
import type {Benchmark,BenchmarkDraft} from './benchmarks';
import {regenerationRequestSchema,type RegenerationRequest} from './requests';
import {factSchema,writerResponseSchema} from '../schemas/editorial';
import {articleSchema} from '../schemas/edition';
import {editorialReviewSchema,editorialReviewPrompt} from './quality';
import type {TextModelProvider} from '../providers/text';
import {containsTerm} from '../content/core.mjs';
import {learningTermKey} from '../content/vocabulary.mjs';
import {advisoryReviewNote,isLengthReminder} from './readability';
import {stats} from '../content/metrics';

type Fact=z.infer<typeof factSchema>;
type LibraryItem={id:string;category:string;fact:Fact};
export function resolveRegeneration(raw:unknown,{packets,benchmarks,library}:{packets:Packet[];benchmarks:Benchmark[];library:LibraryItem[]}){
 const request=regenerationRequestSchema.parse(raw);let facts:Fact[],drafts:BenchmarkDraft[],model:string,issueDate:string;
 if(request.base.kind==='packet'){
  const base=packets.find(p=>p.id===request.base.id);if(!base||base.fingerprint!==request.base.fingerprint)throw Error('STALE_REGENERATION_BASE');
  facts=structuredClone(base.facts);issueDate=base.issueDate;model=base.production.model;
  drafts=base.editions.flatMap(i=>i.articles.map(a=>({storyId:a.storyId,edition:i.edition,article:structuredClone(a),writerMs:0,reviewerMs:0,writerCalls:0,reviewerCalls:0,errors:[],assessment:null,firstPass:false,reused:true})));
 }else{
  const base=benchmarks.find(b=>b.id===request.base.id),round=base?.rounds.find(r=>r.number===request.base.round);
  if(!base||!round||base.fingerprint!==request.base.fingerprint)throw Error('STALE_REGENERATION_BASE');
  facts=structuredClone(base.facts);issueDate=base.issueDate;model=base.model;drafts=structuredClone(round.drafts).map(d=>({...d,writerMs:0,reviewerMs:0,writerCalls:0,reviewerCalls:0,reused:true}));
 }
 const index=facts.findIndex(f=>f.story_id===request.storyId);if(index<0)throw Error('UNKNOWN_REGENERATION_STORY');
 if(drafts.length!==12||editionKeys.some(e=>drafts.filter(d=>d.edition===e).length!==4))throw Error('INCOMPLETE_BASE_EDITION');
 if(request.mode==='replace'){
  const choice=library.find(s=>s.id===request.replacementFactId&&s.category===request.category);if(!choice)throw Error('CATEGORY_SOURCE_NOT_READY');
  if(facts.some(f=>f.story_id===choice.fact.story_id||f.event_key===choice.fact.event_key))throw Error('REPLACEMENT_EVENT_ALREADY_USED');
  const end=Date.parse(issueDate+'T23:59:59.999+08:00'),date=Date.parse(choice.fact.published_at);
  if(date>end||choice.fact.content_kind!=='knowledge'&&end-date>7*86400000)throw Error('REPLACEMENT_SOURCE_OUTSIDE_WINDOW');
  facts[index]=factSchema.parse(structuredClone(choice.fact));
 }else if(request.category!==facts[index].primary_category)throw Error('REWRITE_CANNOT_RECLASSIFY_SOURCE');
 const fact=facts[index];
 if(fact.is_demo||fact.sources.some(s=>!s.read_at||!s.rights_reviewed))throw Error('REGENERATION_REQUIRES_READ_SOURCES');
 return{request,facts,drafts,model,issueDate,index,fact};
}
export function draftErrors(data:Exclude<z.infer<typeof writerResponseSchema>,{failure:unknown}>,fact:Fact,edition:Edition,previous:string[]){
 const body=data.body_paragraphs.join(' '),s=stats(body),c=editions[edition],errors:string[]=[];
 if(s.count<c.min||s.count>c.max)errors.push(`字數 ${s.count}，目標 ${c.min}–${c.max}`);
 if(s.average>c.avg||s.max>c.sentenceMax)errors.push('句長超過目標');
 if(data.vocabulary.some(v=>!containsTerm(body,v.term)))errors.push('單字未實際出現在正文');
 if(new Set(data.vocabulary.map(v=>learningTermKey(v.term))).size!==2)errors.push('單字重複');
 if(data.vocabulary.some(v=>previous.some(p=>learningTermKey(p)===learningTermKey(v.term))))errors.push('與其他程度重複選字');
 if(fact.claims.some(c=>c.must_keep&&!data.used_claim_ids.includes(c.claim_id))||[...data.used_claim_ids,...data.omitted_optional_claim_ids].some(id=>!fact.claims.some(c=>c.claim_id===id)))errors.push('必要事實或 claim ID 不符');
 return errors;
}
export async function regenerateOneStory(resolved:ReturnType<typeof resolveRegeneration>,{provider,writer,reviewer,measure,reviewerModel=resolved.model}:{provider:TextModelProvider;writer:string;reviewer:string;reviewerModel?:string;measure:<T>(key:string,input:unknown,run:()=>Promise<T>)=>Promise<{reply:T;ms:number;calls:number}>}){
 const {request,fact,model}=resolved,drafts=resolved.drafts;
 for(const edition of editionKeys.filter(e=>request.editions.includes(e))){
  const c=editions[edition],slot=drafts.findIndex(d=>d.edition===edition&&d.storyId===request.storyId);if(slot<0)throw Error('MISSING_REGENERATION_SLOT');
  const old=drafts[slot],previous=drafts.filter(d=>d.storyId===fact.story_id&&d.edition!==edition&&(!request.editions.includes(d.edition)||!d.reused)).flatMap(d=>d.article?.vocabulary.map(v=>v.term)||[]);
  const system=writer.replaceAll('{{edition}}',edition).replaceAll('{{target_cefr}}',c.cefr).replaceAll('{{english_variant}}','American English').replaceAll('{{min_words}}',String(c.min)).replaceAll('{{max_words}}',String(c.max)).replaceAll('{{avg_sentence_max}}',String(c.avg)).replaceAll('{{sentence_max}}',String(c.sentenceMax))+'\nImprove interest, information value and readability for this audience. Use only the supplied source-supported facts. Do not invent scenes, quotes or causal explanations. Editorial direction affects style, never source truth. Return a complete new article.';
  const input={fact,previousLevelTerms:previous,editorialDirection:request.direction,oldArticle:request.mode==='rewrite'?old.article:null};
  const w=await measure('write-'+edition,{system,input,model},()=>provider.generateStructured({task:'write',system,data:input,schema:writerResponseSchema,model,timeoutMs:60000,maxOutputTokens:1800}));
  const d:BenchmarkDraft={storyId:fact.story_id,edition,article:null,writerMs:w.ms,reviewerMs:0,writerCalls:w.calls,reviewerCalls:0,errors:[],assessment:null,firstPass:false,reused:false};drafts[slot]=d;
  if('failure'in w.reply.data){d.errors.push(w.reply.data.failure.code+': '+w.reply.data.failure.reason);continue;}
  const data=w.reply.data;
  const checks=draftErrors(data,fact,edition,previous);d.errors=checks.filter(e=>!isLengthReminder(e));d.warnings=checks.filter(isLengthReminder);
  d.article=articleSchema.parse({storyId:fact.story_id,order:old.article?.order||resolved.index+1,category:fact.primary_category,contentKind:fact.content_kind,headline:data.headline,bodyParagraphs:data.body_paragraphs,wordCount:stats(data.body_paragraphs.join(' ')).count,vocabulary:data.vocabulary,image:request.mode==='rewrite'&&old.article?old.article.image:{assetId:fact.primary_category,alt:fact.primary_category+' original category illustration',caption:'原創分類圖示',kind:'icon',credit:'DayDay'},sources:fact.sources.map(s=>({publisher:s.publisher,url:s.url,publishedAt:s.published_at,publishedAtPrecision:s.published_at_precision})),eventDate:fact.event_date});
  const reviewSystem=reviewer+'\n'+editorialReviewPrompt+'\n'+advisoryReviewNote,reviewInput={fact,article:d.article,target:c.cefr,stats:stats(data.body_paragraphs.join(' ')),previousLevelTerms:previous};
  const r=await measure('review-'+edition,{system:reviewSystem,input:reviewInput,model:reviewerModel},()=>provider.generateStructured({task:'review',system:reviewSystem,data:reviewInput,schema:editorialReviewSchema,model:reviewerModel,timeoutMs:60000,maxOutputTokens:1800}));
  d.assessment=r.reply.data;d.reviewerMs=r.ms;d.reviewerCalls=r.calls;
  d.firstPass=!d.errors.length&&w.calls===1&&r.calls===1&&d.assessment.factual_status==='pass'&&d.assessment.level_fit==='suitable'&&d.assessment.suitability==='pass'&&d.assessment.publish_recommendation==='pass'&&!d.assessment.issues.some(i=>i.severity!=='minor');
 }
 return drafts;
}
