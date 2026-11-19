import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {packetById} from '../lib/publications/catalog';
import {editionSchema,vocabularySchema} from '../lib/schemas/edition';
import {reviewSchema,factSchema} from '../lib/schemas/editorial';
import {stats} from '../lib/content/metrics';
import {vocabularyOverlapErrors} from '../lib/content/vocabulary.mjs';
import {Budget,hash,cachedStep} from '../lib/pipeline/state.mjs';
import {NvidiaProvider} from '../lib/providers/text';
import {validatedPreviewCheckpoints} from '../lib/preview/checkpoints';
import {renderIssues} from './render';

const id=process.env.PACKET_ID||'2026-11-19-r3';
if(!/^\d{4}-\d{2}-\d{2}-r[1-9]\d*$/.test(id))throw Error('INVALID_PACKET_ID');
const plan=JSON.parse(await readFile(`config/issues/${id}.corrections.json`,'utf8'));
const base=packetById(plan.basePacketId);if(!base||base.fingerprint!==plan.baseFingerprint||plan.revision<=base.revision||plan.packetId!==id)throw Error('STALE_BASE_PACKET');
const directory=resolve('output/revised-edition');await mkdir(resolve(directory,'assets'),{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'';
const save=async(name:string,value:unknown)=>{const text=JSON.stringify(value,null,2);if(key&&text.includes(key))throw Error('SECRET_IN_OUTPUT');await writeFile(resolve(directory,name),text);};
const model=base.production.model,context={packetId:id,baseFingerprint:base.fingerprint,model,contract:'reviewed-corrections-v1'};
let calls=base.production.totalModelCalls,tokens=base.production.totalTokens,pdfVerified=false,errorCode:string|null=null,newReviews=0;
const records:Record<string,unknown>=Object.create(null);
if(process.env.EDITION_RESUME_DIR){const previous=resolve(process.env.EDITION_RESUME_DIR);if(hash(JSON.parse(await readFile(resolve(previous,'context.json'),'utf8')))!==hash(context))throw Error('REVISION_CONTEXT_CHANGED');Object.assign(records,validatedPreviewCheckpoints(JSON.parse(await readFile(resolve(previous,'checkpoints.json'),'utf8'))));const report=JSON.parse(await readFile(resolve(previous,'report.json'),'utf8'));if(report.ledger?.some((e:{status:string})=>e.status==='usage_unknown'))throw Error('USAGE_RECONCILIATION_REQUIRED');calls=report.totalModelCalls;tokens=report.totalTokens;}
const budget=new Budget({usd:2,maxCalls:70-calls,maxTokens:150000-tokens,inputRate:undefined,outputRate:undefined});
const facts=structuredClone(base.facts),issues=structuredClone(base.editions).map(i=>({...i,revision:plan.revision,lengthPolicy:'advisory' as const,reviewCopy:true,publishedAt:null})),reviews=structuredClone(base.reviews);
await save('context.json',context);await save('checkpoints.json',records);
try{
 for(const addition of plan.evidenceAdditions||[]){const f=facts.find(f=>f.story_id===addition.storyId);if(!f)throw Error('UNKNOWN_CORRECTION_STORY');f.sources[0].evidence+='\n'+addition.quote;if(addition.claim)f.claims.push({...addition.claim,supporting_source_ids:[f.sources[0].source_id],evidence_ref:f.sources[0].source_id});factSchema.parse(f);}
 for(const c of plan.corrections){const a=issues.find(i=>i.edition===c.edition)?.articles.find(a=>a.storyId===c.storyId);if(!a)throw Error('UNKNOWN_CORRECTION_ARTICLE');if(c.bodyParagraphs)a.bodyParagraphs=c.bodyParagraphs;if(c.vocabulary)a.vocabulary=z.array(vocabularySchema).length(2).parse(c.vocabulary);if(c.headline)a.headline=c.headline;a.wordCount=stats(a.bodyParagraphs.join(' ')).count;}
 issues.forEach(i=>editionSchema.parse(i));if(vocabularyOverlapErrors(issues).length)throw Error('VOCABULARY_OVERLAP');
 if(!key)throw Error('NVIDIA_KEY_REQUIRED');
 const provider=new NvidiaProvider(key,budget);const prompt=await readFile('prompts/reviewer.v1.txt','utf8');
 const store={get:async(k:string)=>records[k],set:async(k:string,v:unknown)=>{records[k]=v;await save('checkpoints.json',records);console.log('Review checkpoint:',k);}};
 for(const issue of issues)for(const a of issue.articles){
  const changed=plan.corrections.some((c:{edition:string;storyId:string})=>c.edition===issue.edition&&c.storyId===a.storyId)||plan.evidenceAdditions?.some((c:{storyId:string})=>c.storyId===a.storyId);
  if(!changed)continue;
  const fact=facts.find(f=>f.story_id===a.storyId)!,s=stats(a.bodyParagraphs.join(' '));
  const input={fact,article:a,target:issue.targetCefr,stats:s,model,promptVersion:'reviewer.v1',prompt,provider:provider.cacheIdentity};
  const reply=await cachedStep(store,`${a.storyId}:${issue.edition}:review:0`,input,()=>provider.generateStructured({task:'review',system:prompt,data:{fact,article:a,target:issue.targetCefr,stats:s},schema:reviewSchema,model,timeoutMs:60000,maxOutputTokens:1200}));
  const assessed=reviewSchema.parse(reply.data);const n=reviews.findIndex(r=>r.storyId===a.storyId&&r.edition===issue.edition);reviews[n]={...assessed,storyId:a.storyId,edition:issue.edition};newReviews++;
 }
 await save('reviews.json',reviews);await save('facts.json',facts);await save('editor-corrections.json',{actor:'codex_development_agent',basePacketId:base.id,corrections:plan.corrections,evidenceAdditions:plan.evidenceAdditions});
 for(const issue of issues)for(const a of issue.articles)if(a.image.rendition){for(const field of ['webPath','printPath'] as const){const original=a.image.rendition[field];const name=original.slice(original.lastIndexOf('/assets/')+1);if(!/^assets\/[a-f0-9]{64}-(web\.webp|print\.jpg)$/.test(name))throw Error('INVALID_BASE_ASSET');await copyFile(resolve('public','.'+original),resolve(directory,name));a.image.rendition[field]=name;}}
 for(const m of base.imageManifests)await save('assets/'+m.assetId+'.json',m);
 await save('editions.json',issues);const files=await renderIssues(issues,directory);pdfVerified=true;await save('verified-files.json',files);
}catch(e){await save('failure.json',e instanceof z.ZodError?{issues:e.issues.map(i=>({path:i.path,message:i.message}))}:{message:e instanceof Error?e.message.replaceAll(key||'__no_key__','[redacted]').slice(0,1200):'unknown'});const m=e instanceof Error?e.message:'';errorCode=/^[A-Za-z0-9_:-]{1,200}$/.test(m)?m:'REVISION_FAILED';}
await save('report.json',{packetId:id,issueDate:base.issueDate,revision:plan.revision,status:!errorCode&&pdfVerified?'review_ready':'needs_review',model,generatedAt:new Date().toISOString(),totalModelCalls:calls+budget.calls,totalTokens:tokens+budget.tokens,ledger:budget.ledger,costStatus:'cost_unknown',estimatedUsd:null,imageAttempts:base.production.imageAttempts,newImageCalls:0,newModelReviews:newReviews,reusedModelReviews:12-newReviews,editorCorrectionsApplied:(base.production.editorCorrections||0)+plan.corrections.length,sourceSnapshotsUsed:base.production.sourceSnapshots||0,pdfVerified,reviewRecords:reviews.length,generatedArticles:12,errorCode,databaseWritten:false,published:false,sourceSelection:'Reviewed revision of '+base.id+'; approved images reused, no new image requests.'});
console.log(JSON.stringify({packetId:id,errorCode,newModelCalls:budget.calls,pdfVerified}));if(errorCode)process.exitCode=1;
