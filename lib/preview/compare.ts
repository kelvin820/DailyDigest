import {readFile} from 'node:fs/promises';
import {editionKeys,editions} from '../../config/editions';
import {articleSchema} from '../schemas/edition';
import {writerResponseSchema,reviewSchema} from '../schemas/editorial';
import type {TextModelProvider} from '../providers/text';
import type {Store} from '../pipeline/editorial';
import {cachedStep} from '../pipeline/state.mjs';
import {containsTerm} from '../content/core.mjs';
import {stats} from '../content/metrics';
import {PREVIEW_ISSUE_DATE,previewError,type PreviewFact,type PreviewEdition} from './nvidia';

// A developer comparison is deliberately distinct from an eight-story publication.
// It keeps actual drafts even when editorial checks need further calibration.
export async function compareOneStory(facts:PreviewFact[],provider:TextModelProvider,store:Store,model:string){
  const fact=facts[0];
  if(!fact?.is_demo)throw Error('COMPARISON_REQUIRES_FICTIONAL_FACTS');
  const writer=await readFile('prompts/writer.v1.txt','utf8');
  const reviewPrompt=await readFile('prompts/reviewer.v1.txt','utf8');
  const issues:PreviewEdition[]=[],checks:unknown[]=[];
  for(const edition of editionKeys){
    const c=editions[edition],articles:PreviewEdition['articles']=[];
    const system=writer.replaceAll('{{edition}}',edition).replaceAll('{{target_cefr}}',c.cefr)
      .replaceAll('{{english_variant}}','American English').replaceAll('{{min_words}}',String(c.min))
      .replaceAll('{{max_words}}',String(c.max)).replaceAll('{{avg_sentence_max}}',String(c.avg))
      .replaceAll('{{sentence_max}}',String(c.sentenceMax));
    let feedback:unknown=null;
    try{
      for(let attempt=0;attempt<2;attempt++){
        const input={fact,feedback,system,edition,attempt,model,provider:provider.cacheIdentity,purpose:'one-story-comparison'};
        const result=await cachedStep(store,`${fact.story_id}:${edition}:write:${attempt}`,input,()=>provider.generateStructured({
          task:attempt?'revise':'write',system,data:{fact,feedback},schema:writerResponseSchema,model,timeoutMs:60000,maxOutputTokens:1800}));
        const data=writerResponseSchema.parse(result.data);
        if('failure'in data)throw Error('WRITER_'+data.failure.code.toUpperCase());
        const s=stats(data.body_paragraphs.join(' '));
        const mustKeep=fact.claims.every(claim=>!claim.must_keep||data.used_claim_ids.includes(claim.claim_id));
        const validIds=data.used_claim_ids.every(id=>fact.claims.some(claim=>claim.claim_id===id));
        const vocabulary=data.vocabulary.every(v=>containsTerm(data.body_paragraphs.join(' '),v.term))&&new Set(data.vocabulary.map(v=>v.term.toLowerCase())).size===2;
        const lengths=s.count>=c.min&&s.count<=c.max&&s.average<=c.avg&&s.max<=c.sentenceMax;
        if((!lengths||!vocabulary||!mustKeep||!validIds)&&attempt===0){
          feedback={previous_article:data,statistics:s,minimumBodyWords:c.min,maximumBodyWords:c.max,
            aimForWords:Math.round((c.min+c.max)/2),vocabulary,mustKeep,validIds,
            instruction:'Return the complete revised article. Count body words only. Preserve every required fact and the fictional scenario.'};continue;
        }
        const article=articleSchema.parse({storyId:fact.story_id,order:1,category:fact.primary_category,
          contentKind:fact.content_kind,headline:data.headline,bodyParagraphs:data.body_paragraphs,wordCount:s.count,
          vocabulary:data.vocabulary,image:{assetId:fact.primary_category,alt:'Original category illustration',
            caption:'Original category illustration',kind:'icon',credit:'DayDay original artwork'},eventDate:null,
          sources:fact.sources.map(source=>({publisher:source.publisher,url:source.url,publishedAt:source.published_at}))});
        articles.push(article);
        let review:unknown=null,reviewError:string|null=null;
        if(lengths&&vocabulary&&mustKeep&&validIds){
          try{review=(await cachedStep(store,`${fact.story_id}:${edition}:review:${attempt}`,
            {fact,article,model,reviewPrompt,target:c.cefr,purpose:'one-story-comparison'},()=>provider.generateStructured({
              task:'review',system:reviewPrompt,data:{fact,article,target:c.cefr,statistics:s},schema:reviewSchema,
              model,timeoutMs:60000,maxOutputTokens:2200}))).data;
          }catch(error){reviewError=previewError(error);}
        }
        checks.push({edition,statistics:s,checks:{lengths,vocabulary,mustKeep,validIds},review,reviewError});break;
      }
    }catch(error){checks.push({edition,error:previewError(error)});}
    issues.push({schemaVersion:'1.0',issueDate:PREVIEW_ISSUE_DATE,revision:1,edition,targetCefr:c.cefr,
      templateVersion:'1.0',publishedAt:null,isDemo:true,articles});
  }
  return{editions:issues,checks};
}
