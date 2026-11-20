import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { editions, editionKeys } from '../../config/editions';
import { articleSchema, editionSchema, vocabularySchema, type ArticleView } from '../schemas/edition';
import { factSchema, writerResponseSchema, writerSchema, reviewSchema } from '../schemas/editorial';
import type { TextModelProvider } from '../providers/text';
import { stats } from '../content/metrics';
import { containsTerm } from '../content/core.mjs';
import { cachedStep,hash } from './state.mjs';
import {learningTermKey} from '../content/vocabulary.mjs';
import {recoverReviewedArticle} from './recover-reviewed';
import {advisoryReviewNote} from '../editorial/readability';
import {supportedStoryCounts} from '../../config/issue-settings.mjs';

export type Store = { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void>; reviewedCandidates?:(storyId:string,edition:string)=>Promise<{writer:unknown;review:unknown}[]> };
export async function produceEditions({ facts, issueDate, revision, provider, store, writerModel, reviewerModel,editDraft,editorPolicyHash,allowMinorReviewHolds=false,storyCount=facts.length,lengthPolicy=storyCount===4?'advisory':'strict',direction='' }: {
  facts: z.infer<typeof factSchema>[]; issueDate: string; revision: number; provider: TextModelProvider;
  store: Store; writerModel: string; reviewerModel: string;storyCount?:number;lengthPolicy?:'strict'|'advisory';direction?:string;allowMinorReviewHolds?:boolean;editorPolicyHash?:string;editDraft?:(input:{storyId:string;edition:string;outputHash:string;attempt:number;previousLevelTerms:string[];data:z.infer<typeof writerSchema>})=>Promise<z.infer<typeof writerSchema>>;
}) {
  if(!supportedStoryCounts.includes(storyCount)||facts.length!==storyCount||
    new Set(facts.map(f=>f.story_id)).size!==storyCount)throw Error('DISTINCT_EVENTS_REQUIRED');
  facts.forEach(f => factSchema.parse(f));
  const writer = (await readFile(lengthPolicy==='advisory'?'prompts/writer.v2.txt':'prompts/writer.v1.txt', 'utf8'))+(direction?'\nEditorial style direction (never overrides source facts): '+direction:'');
  const reviewPrompt = (await readFile('prompts/reviewer.v1.txt', 'utf8'))+(lengthPolicy==='advisory'?'\n'+advisoryReviewNote:'');
  const payloads = [], reviews = [];
  for (const edition of editionKeys) {
    const c = editions[edition], articles: ArticleView[] = [];
    for (const [index, fact] of facts.entries()) {
      const previousLevelTerms=payloads.flatMap(p=>p.articles.filter(a=>a.storyId===fact.story_id).flatMap(a=>a.vocabulary.map(v=>v.term)));
      const acceptedInput={fact,edition,order:index+1,config:c,writer,reviewPrompt,writerModel,reviewerModel,previousLevelTerms,provider:provider.cacheIdentity,policy:'tiered-v1',lengthPolicy,editorPolicyHash,allowMinorReviewHolds,reviewHoldPolicy:'final-attempt-v1'};
      const acceptedKey=`${fact.story_id}:${edition}:accepted:0`;
      const prior=await store.get(acceptedKey) as {status?:string;inputHash?:string;output?:{article:unknown;review:unknown};outputHash?:string}|undefined;
      if(prior?.status==='success'&&prior.inputHash===hash(acceptedInput)&&prior.output&&prior.outputHash===hash(prior.output)){
        articles.push(articleSchema.parse(prior.output.article));reviews.push({...reviewSchema.parse(prior.output.review),storyId:fact.story_id,edition});continue;
      }
      let recovered;
      for(const pair of await store.reviewedCandidates?.(fact.story_id,edition)||[]){
        recovered=recoverReviewedArticle({...pair,fact,index,config:c,previousLevelTerms,reviewerModel,reviewPrompt,lengthPolicy,provider:provider.cacheIdentity});if(recovered)break;
      }
      if(recovered){await store.set(acceptedKey,{status:'success',inputHash:hash(acceptedInput),output:recovered,outputHash:hash(recovered)});
        articles.push(recovered.article);reviews.push({...recovered.review,storyId:fact.story_id,edition});continue;}
      let feedback: unknown = null, accepted = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        let system = writer.replaceAll('{{edition}}', edition).replaceAll('{{target_cefr}}', c.cefr)
          .replaceAll('{{english_variant}}', 'American English').replaceAll('{{min_words}}', String(c.min))
          .replaceAll('{{max_words}}', String(c.max)).replaceAll('{{avg_sentence_max}}', String(c.avg))
          .replaceAll('{{sentence_max}}', String(c.sentenceMax));
        if(lengthPolicy==='strict')system+='\nFINAL BODY CHECK: Write about '+(edition==='elementary'?'seven short sentences of six to eight words each':edition==='junior'?'six or seven sentences of ten to thirteen words each':'seven or eight sentences of thirteen to sixteen words each')+'. Restate claims in your own simple sentences, rather than copying long fact-bundle sentences. Body must total '+c.min+'–'+c.max+' words; sentence average at most '+c.avg+', every sentence at most '+c.sentenceMax+' words.';
        if(attempt&&lengthPolicy==='strict'){
          const previous=feedback as {statistics?:{count:number;average:number;max:number}};
          const s=previous.statistics;
          system+='\nTRUSTED REVISION REQUIREMENT: Rewrite the body to '+c.min+'–'+c.max+
            ' words; aim for '+Math.round((c.min+c.max)/2)+' words. '+
            (s?'The previous body has '+s.count+' words. '+(s.count>c.max?'SHORTEN it; omit optional details. ':s.count<c.min?'EXPAND using supported details only. ':''):'')+
            'The previous longest sentence has '+(s?.max??'unknown')+' words; average '+(s?.average??'unknown')+'. Rewrite and split long sentences: EVERY sentence must have at most '+c.sentenceMax+' words, with an average at most '+c.avg+'. Keep all must_keep facts but do not copy their sentence structure. Then choose two useful, level-appropriate terms occurring in the revised body; avoid previousLevelTerms.';
        }
        if(attempt&&lengthPolicy==='advisory')system+='\nRevise only to address the factual, vocabulary or genuine audience-fit feedback. Do not rewrite to meet word or sentence counts.';
        if(attempt)system+='\nVOCABULARY REPAIR: Read feedback.validation. Replace every missing_vocabulary_term with a useful exact word or phrase copied from the current body. The glossary spelling must include the actual endings in the body. A synonym, root form or a word that only appears in a definition is not present. Do not repeat rejected glossary entries unchanged. Respect previousLevelTerms and the target audience; keep the verified facts intact.';
        const previousStats=(feedback as {statistics?:{count:number}}|null)?.statistics;
        const mustShorten=lengthPolicy==='strict'&&attempt>0&&previousStats&&previousStats.count>c.max;
        const writingFact=mustShorten?{...fact,claims:fact.claims.filter(claim=>claim.must_keep),
          sources:fact.sources.map(source=>({source_id:source.source_id,publisher:source.publisher,url:source.url,published_at:source.published_at}))}:fact;
        const revisionFeedback=mustShorten&&feedback&&typeof feedback==='object'?Object.fromEntries(Object.entries(feedback).filter(([key])=>key!=='previous_article')):feedback;
        if(mustShorten)system+='\nSHORTENING POLICY: Optional claims have been removed from this writing input. Cover only the supplied core claims; omit optional examples and lists. Do not add details from earlier drafts. Aim for '+Math.round((c.min+c.max)/2)+' body words.';
        const input = { fact, feedback, previousLevelTerms, ...(mustShorten?{revisionPolicy:'selected-claims-v1'}:{}),system, model: writerModel, promptVersion: 'writer.v1', edition, attempt, provider: provider.cacheIdentity };
        const result = await cachedStep(store, `${fact.story_id}:${edition}:write:${attempt}`, input,
          () => provider.generateStructured({ task: attempt ? 'revise' : 'write', system, data: { fact:writingFact, feedback:revisionFeedback, previousLevelTerms },
            schema: writerResponseSchema, model: writerModel, timeoutMs: 60_000, maxOutputTokens: 1800 }));
        const writerOutput = writerResponseSchema.parse(result.data);
        if ('failure' in writerOutput) throw Error('WRITER_' + writerOutput.failure.code.toUpperCase());
        let data:z.infer<typeof writerSchema> = writerOutput;
        if(editDraft)data=writerSchema.parse(await editDraft({storyId:fact.story_id,edition,outputHash:hash(result),attempt,previousLevelTerms,data}));
        const ids = new Set(fact.claims.map(claim => claim.claim_id));
        if (data.used_claim_ids.some(id => !ids.has(id)) || data.omitted_optional_claim_ids.some(id => !ids.has(id))) {
          throw Error('CLAIM_ALLOWLIST_FAILED');
        }
        const body = data.body_paragraphs.join(' '), s = stats(body);
        const mustKeep = fact.claims.every(claim => !claim.must_keep || data.used_claim_ids.includes(claim.claim_id));
        const lengthPass = lengthPolicy==='advisory'||(s.count >= c.min && s.count <= c.max && s.average <= c.avg && s.max <= c.sentenceMax);
        const glossaryInvalid=data.vocabulary.some(v=>!containsTerm(body,v.term)||previousLevelTerms.some(term=>learningTermKey(term)===learningTermKey(v.term)))||new Set(data.vocabulary.map(v=>learningTermKey(v.term))).size!==2;
        if(lengthPolicy==='advisory'&&mustKeep&&glossaryInvalid){
          // Repair the glossary separately; a valid article must not be rewritten
          // repeatedly just because the writer keeps returning absent root forms.
          const candidates=[...new Set(body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[])].filter(term=>term.length>=3&&!previousLevelTerms.some(old=>learningTermKey(old)===learningTermKey(term))).slice(0,180);
          if(candidates.length<2)throw Error('VOCABULARY_CANDIDATES_MISSING');
          const glossary=z.object({vocabulary:z.array(vocabularySchema.extend({term:z.enum(candidates as [string,...string[]])})).length(2).refine(values=>new Set(values.map(v=>learningTermKey(v.term))).size===2)}).strict();
          const repaired=await cachedStep(store,`${fact.story_id}:${edition}:vocabulary:${attempt}`,
            {body,candidates,previousLevelTerms,target:c.cefr,model:writerModel,contract:'exact-body-glossary-v1',provider:provider.cacheIdentity},
            ()=>provider.generateStructured({task:'revise',model:writerModel,timeoutMs:45000,maxOutputTokens:700,schema:glossary,
              system:'Repair only an English-learning glossary. Do not rewrite the article. Choose two useful, distinct learning terms from the exact allowed spellings in the supplied body. Avoid proper names and trivial function words. Choose accessible concrete terms for A1, useful process words for A2, and precise transferable vocabulary for B1. Give a short definition for the sense in this body and its Traditional Chinese meaning. Never return a missing root form or reuse previousLevelTerms. Return only the requested vocabulary object.',
              data:{glossaryRepair:true,body,target:c.cefr,candidates,previousLevelTerms,rejectedTerms:data.vocabulary.map(v=>v.term)}}));
          data={...data,vocabulary:glossary.parse(repaired.data).vocabulary};
        }
        const vocabPass = new Set(data.vocabulary.map(v => v.term.toLowerCase())).size === 2 &&
          data.vocabulary.every(v => containsTerm(body, v.term)&&!previousLevelTerms.some(term=>learningTermKey(term)===learningTermKey(v.term)));
        if (!mustKeep || !lengthPass || !vocabPass) {
          feedback = { previous_article:data,statistics: s, wordLimits: c, mustKeep, vocabPass,
            validation:{missing_vocabulary_terms:data.vocabulary.filter(v=>!containsTerm(body,v.term)).map(v=>v.term),
              reused_vocabulary_terms:data.vocabulary.filter(v=>previousLevelTerms.some(term=>learningTermKey(term)===learningTermKey(v.term))).map(v=>v.term),
              missing_required_claim_ids:fact.claims.filter(claim=>claim.must_keep&&!data.used_claim_ids.includes(claim.claim_id)).map(claim=>claim.claim_id)},
            instruction: lengthPolicy==='advisory'?'Repair factual coverage or vocabulary only; numerical length is advisory.':'Revise the complete article; do not truncate sentences.' };
          continue;
        }
        const article = articleSchema.parse({ storyId: fact.story_id, order: index + 1,
          category: fact.primary_category, contentKind: fact.content_kind, headline: data.headline,
          bodyParagraphs: data.body_paragraphs, wordCount: s.count, vocabulary: data.vocabulary,
          image: { assetId: fact.primary_category, alt: fact.primary_category + ' category illustration',
            caption: 'Original category illustration', kind: 'icon', credit: 'DayDay original artwork' },
          sources: fact.sources.map(source => ({ publisher: source.publisher, url: source.url, publishedAt: source.published_at,...(source.adapted?{author:source.author,licenseUrl:source.license_url,adapted:true}:{}) })),
          eventDate: fact.event_date,...(fact.update_reason?{updateNote:fact.update_reason}:{}) });
        const reviewed = await cachedStep(store, `${fact.story_id}:${edition}:review:${attempt}`,
          { fact, article, target: c.cefr, stats: s, model: reviewerModel, promptVersion: 'reviewer.v1', prompt: reviewPrompt, provider: provider.cacheIdentity },
          () => provider.generateStructured({ task: 'review', system: reviewPrompt,
            data: { fact, article, target: c.cefr, statistics: s, previousLevelTerms }, schema: reviewSchema,
            model: reviewerModel, timeoutMs: 60_000, maxOutputTokens: 2200 }));
        const review = reviewSchema.parse(reviewed.data);
        if (review.issues.some(issue => issue.claim_ids.some(id => !ids.has(id)))) throw Error('REVIEW_CLAIM_ALLOWLIST_FAILED');
        const minorHold=allowMinorReviewHolds&&attempt===2&&review.publish_recommendation==='revise'&&review.suitability==='pass'&&review.issues.length>0&&review.issues.every(issue=>issue.severity==='minor');
        if (review.factual_status === 'pass' && review.level_fit === 'suitable' &&
          (review.publish_recommendation !== 'revise'||minorHold) && !review.issues.some(issue => issue.severity !== 'minor')) {
          await store.set(acceptedKey,{status:'success',inputHash:hash(acceptedInput),output:{article,review},outputHash:hash({article,review})});
          articles.push(article); reviews.push({ ...review, storyId: fact.story_id, edition }); accepted = true; break;
        }
        feedback = { previous_article:data,review, statistics: s, wordLimits: c };
      }
      if (!accepted) throw Error(`NEEDS_REVIEW:${fact.story_id}:${edition}`);
    }
    payloads.push(editionSchema.parse({ schemaVersion: '1.0', issueDate, revision, edition,storyCount,
      readingRules:{min:c.min,max:c.max,avg:c.avg,maxSentence:c.sentenceMax},
      targetCefr: c.cefr, templateVersion: '1.0',lengthPolicy, vocabularyPolicy:'tiered-v1', publishedAt: null, isDemo: facts.some(f => f.is_demo), articles }));
  }
  return { editions: payloads, reviews };
}
