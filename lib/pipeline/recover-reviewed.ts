import {z} from 'zod';
import {hash} from './state.mjs';
import {articleSchema,type ArticleView} from '../schemas/edition';
import {factSchema,writerSchema,reviewSchema} from '../schemas/editorial';
import {stats} from '../content/metrics';
import {containsTerm} from '../content/core.mjs';
import {learningTermKey} from '../content/vocabulary.mjs';
const step=z.object({status:z.literal('success'),inputHash:z.string(),output:z.object({data:z.unknown()}).passthrough(),outputHash:z.string()}).strict();
export function recoverReviewedArticle({writer,review,fact,index,config,previousLevelTerms,reviewerModel,reviewPrompt,provider}:{writer:unknown;review:unknown;fact:z.infer<typeof factSchema>;index:number;config:{cefr:string;min:number;max:number;avg:number;sentenceMax:number};previousLevelTerms:string[];reviewerModel:string;reviewPrompt:string;provider:string|undefined}){
 try{
  const w=step.parse(writer),r=step.parse(review);if(hash(w.output)!==w.outputHash||hash(r.output)!==r.outputHash)return;
  const data=writerSchema.parse(w.output.data),body=data.body_paragraphs.join(' '),s=stats(body);
  if(s.count<config.min||s.count>config.max||s.average>config.avg||s.max>config.sentenceMax||
    fact.claims.some(c=>c.must_keep&&!data.used_claim_ids.includes(c.claim_id))||
    new Set(data.vocabulary.map(v=>learningTermKey(v.term))).size!==2||
    data.vocabulary.some(v=>!containsTerm(body,v.term)||previousLevelTerms.some(p=>learningTermKey(p)===learningTermKey(v.term))))return;
  const article:ArticleView=articleSchema.parse({storyId:fact.story_id,order:index+1,category:fact.primary_category,contentKind:fact.content_kind,
   headline:data.headline,bodyParagraphs:data.body_paragraphs,wordCount:s.count,vocabulary:data.vocabulary,
   image:{assetId:fact.primary_category,alt:fact.primary_category+' category illustration',caption:'Original category illustration',kind:'icon',credit:'DayDay original artwork'},
   sources:fact.sources.map(source=>({publisher:source.publisher,url:source.url,publishedAt:source.published_at})),eventDate:fact.event_date,...(fact.update_reason?{updateNote:fact.update_reason}:{})});
  const expected={fact,article,target:config.cefr,stats:s,model:reviewerModel,promptVersion:'reviewer.v1',prompt:reviewPrompt,provider};
  if(hash(expected)!==r.inputHash)return;
  const assessed=reviewSchema.parse(r.output.data);
  if(assessed.factual_status!=='pass'||assessed.level_fit!=='suitable'||assessed.publish_recommendation==='revise'||assessed.issues.some(i=>i.severity!=='minor'))return;
  return{article,review:assessed};
 }catch{return;}
}
