import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {load} from 'cheerio';
import {z} from 'zod';
import {safeFetch} from '../lib/content/safe-fetch.mjs';
import {factSchema} from '../lib/schemas/editorial';
import {vocabularySchema} from '../lib/schemas/edition';
import {containsTerm} from '../lib/content/core.mjs';
import {learningTermKey} from '../lib/content/vocabulary.mjs';
import {editions as editionConfig} from '../config/editions';
import {Budget,hash,cachedStep} from '../lib/pipeline/state.mjs';
import {NvidiaProvider} from '../lib/providers/text';
import {produceEditions} from '../lib/pipeline/editorial';
import {validatedPreviewCheckpoints} from '../lib/preview/checkpoints';
import {prepareAsset,downloadAsset,type AssetRecord} from '../lib/media/prepare';
import {approvedBundledPhoto} from '../lib/media/bundled';
import {generateNvidiaImage} from '../lib/providers/image';
import {audienceConceptPrompt} from '../lib/media/audience';
import {renderIssues} from './render';
import {renderReviewReader} from '../lib/preview/reader.mjs';

const id=process.env.PACKET_ID||'2026-11-19-r2';
if(!/^\d{4}-\d{2}-\d{2}-r[1-9]\d*$/.test(id))throw Error('INVALID_PACKET_ID');
const plan=JSON.parse(await readFile(`config/issues/${id}.json`,'utf8'));
if(plan.packetId!==id||plan.stories.length!==4||plan.storyCount!==4)throw Error('INVALID_PLAN');
const directory=resolve('output/generated-edition');await mkdir(directory,{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'',model='nvidia/nemotron-3-ultra-550b-a55b';
const save=async(name:string,value:unknown)=>{const text=JSON.stringify(value,null,2);if(key&&text.includes(key))throw Error('SECRET_IN_OUTPUT');await writeFile(resolve(directory,name),text);};
const context={packetId:id,planHash:hash(plan),model,contract:'edition-review-v2',lengthPolicy:'advisory'};
const records:Record<string,unknown>=Object.create(null),reservations:string[]=[];
let priorCalls=0,priorTokens=0,imageAttempts=0;const historyAdjustmentsApplied:number[]=[];let editorCorrectionsApplied=0;
const budget=new Budget({usd:2,maxCalls:70,maxTokens:150000,inputRate:undefined,outputRate:undefined});
if(process.env.EDITION_RESUME_DIR){
 const previous=resolve(process.env.EDITION_RESUME_DIR),old=JSON.parse(await readFile(resolve(previous,'context.json'),'utf8'));
 const report=JSON.parse(await readFile(resolve(previous,'report.json'),'utf8'));
 if(hash(old)!==hash(context)&&(report.totalModelCalls!==0||report.imageAttempts!==0))throw Error('RESUME_CONTEXT_CHANGED');
 if(report.ledger?.some((e:{status:string})=>e.status==='usage_unknown'))throw Error('USAGE_RECONCILIATION_REQUIRED');
 Object.assign(records,validatedPreviewCheckpoints(JSON.parse(await readFile(resolve(previous,'checkpoints.json'),'utf8'))));
 historyAdjustmentsApplied.push(...(report.historyAdjustmentsApplied||[]));
 priorCalls=report.totalModelCalls;priorTokens=report.totalTokens;imageAttempts=report.imageAttempts;
 budget.maxCalls-=priorCalls;budget.maxTokens-=priorTokens;
 reservations.push(...JSON.parse(await readFile(resolve(previous,'image-reservations.json'),'utf8')));
 await cp(resolve(previous,'assets'),resolve(directory,'assets'),{recursive:true}).catch(()=>{});
 await cp(resolve(previous,'selected-images.json'),resolve(directory,'selected-images.json')).catch(()=>{});
}
const adjustments=JSON.parse(await readFile(`config/issues/${id}.usage-adjustments.json`,'utf8').catch(()=>'[]')) as {runId:number;calls:number;tokens:number}[];
for(const a of adjustments)if(!historyAdjustmentsApplied.includes(a.runId)){priorCalls+=a.calls;priorTokens+=a.tokens;historyAdjustmentsApplied.push(a.runId);}
budget.maxCalls=70-priorCalls;budget.maxTokens=150000-priorTokens;
await save('context.json',context);await save('checkpoints.json',records);await save('image-reservations.json',reservations);
let pdfVerified=false,errorCode:string|null=null,issues:Awaited<ReturnType<typeof produceEditions>>['editions']=[],reviews:unknown[]=[];
const evidence:unknown[]=[],facts:z.infer<typeof factSchema>[]=[];
try{
 for(const s of plan.stories){
  let text='',mode='fetched',bodyHash:string|null=null;
  try{const response=await safeFetch(s.url,[new URL(s.url).hostname],{timeoutMs:30000});const $=load(response.text);$('script,style,nav,header,footer').remove();text=$('body').text().replace(/\s+/g,' ');bodyHash=hash(response.text);}catch(error){if(!s.approvedSnapshot)throw error;}
  if(!text.trim()&&s.approvedSnapshot){const snap=s.approvedSnapshot;if(snap.sourceUrl!==s.url||Date.now()-Date.parse(snap.capturedAt)>86400000)throw Error('SOURCE_SNAPSHOT_INVALID');text=snap.evidence;mode='developer_reviewed_snapshot';}
  if(s.quotes.some((q:string)=>!text.includes(q)))throw Error('SOURCE_EVIDENCE_CHANGED:'+s.id);
  const now=new Date().toISOString(),sourceId='source-'+s.id,published=s.date+'T00:00:00Z';
  evidence.push({storyId:s.id,url:s.url,readAt:now,evidenceMode:mode,bodyHash,snapshotCapturedAt:mode==='developer_reviewed_snapshot'?s.approvedSnapshot.capturedAt:null,verifiedQuotes:s.quotes});
  facts.push(factSchema.parse({story_id:s.id,event_key:s.id+'-'+s.date,primary_category:s.category,content_kind:'news',published_at:published,published_at_precision:'date',event_date:s.eventDate,is_demo:false,sensitivity:'low',uncertainties:s.uncertainties,
   sources:[{source_id:sourceId,url:s.url,publisher:s.publisher,published_at:published,published_at_precision:'date',retrieved_at:now,read_at:now,rights_reviewed:true,independence_group:s.publisher,evidence:s.quotes.join('\n')}],claims:s.claims.map(([text,must_keep,status]:[string,boolean,string],i:number)=>({claim_id:'claim-'+(i+1),text,must_keep,status,supporting_source_ids:[sourceId],evidence_ref:sourceId}))}));
 }
 await save('facts.json',facts);await save('source-evidence.json',evidence);
 if(!key)throw Error('NVIDIA_KEY_REQUIRED');
 const invalid:unknown[]=[];
 const provider=new NvidiaProvider(key,budget,async reply=>{invalid.push(reply);await save('invalid-responses.json',invalid);});
 const store={get:async(k:string)=>records[k],set:async(k:string,v:unknown)=>{records[k]=v;await save('checkpoints.json',records);console.log('Checkpoint:',k);}};
 if(process.env.EDITION_RESUME_DIR&&priorCalls>0){const frozen=z.array(factSchema).length(4).parse(JSON.parse(await readFile(resolve(process.env.EDITION_RESUME_DIR,'facts.json'),'utf8')));if(frozen.some((f,i)=>f.story_id!==facts[i].story_id||hash(f.claims)!==hash(facts[i].claims)))throw Error('FROZEN_FACTS_CHANGED');facts.splice(0,facts.length,...frozen);await save('facts.json',facts);}
 const corrections=JSON.parse(await readFile(`config/issues/${id}.edits.json`,'utf8').catch(()=>'[]')) as {storyId:string;edition:string;writerOutputHash:string;factClaimsHash?:string;usedClaimIds?:string[];bodyParagraphs:string[];vocabulary:z.infer<typeof vocabularySchema>[];reason:string}[];
 const applied:unknown[]=[];
 const result=await produceEditions({editorPolicyHash:hash({policy:'literal-glossary-repair-v1',corrections}),editDraft:async input=>{
  const data=structuredClone(input.data),edit=corrections.find(c=>c.storyId===input.storyId&&c.edition===input.edition&&(c.writerOutputHash===input.outputHash||c.factClaimsHash===hash(facts.find(f=>f.story_id===input.storyId)?.claims)));
  if(edit){editorCorrectionsApplied++;data.body_paragraphs=edit.bodyParagraphs;data.vocabulary=edit.vocabulary;if(edit.usedClaimIds){data.used_claim_ids=edit.usedClaimIds;data.omitted_optional_claim_ids=facts.find(f=>f.story_id===input.storyId)!.claims.filter(c=>!c.must_keep&&!edit.usedClaimIds!.includes(c.claim_id)).map(c=>c.claim_id);}
  applied.push({actor:'codex_development_agent',...edit,actualWriterOutputHash:input.outputHash});await save('editor-corrections.json',applied);}
  const body=data.body_paragraphs.join(' ');
  if(data.vocabulary.some(v=>!containsTerm(body,v.term)||input.previousLevelTerms.some(t=>learningTermKey(t)===learningTermKey(v.term)))){
   const repaired=await cachedStep(store,`${input.storyId}:${input.edition}:vocabulary:${input.attempt}`,{body,vocabulary:data.vocabulary,previous:input.previousLevelTerms,model,target:editionConfig[input.edition as keyof typeof editionConfig].cefr},()=>provider.generateStructured({task:'revise',model,timeoutMs:60000,maxOutputTokens:500,schema:z.object({vocabulary:z.array(vocabularySchema).length(2)}).strict(),system:'You are a glossary editor. Return ONLY the vocabulary object in the schema. Choose two useful learning words or short phrases for CEFR '+editionConfig[input.edition as keyof typeof editionConfig].cefr+'. Copy each term EXACTLY as it appears in the supplied body, including endings. Do not choose any previous-level term or simple plural variant. Use natural Traditional Chinese meanings for Taiwan. Do not rewrite the body or add facts.',data:{body,previousLevelTerms:input.previousLevelTerms,rejectedVocabulary:data.vocabulary}}));
   data.vocabulary=repaired.data.vocabulary;
  }
  return data;
 },facts,issueDate:plan.issueDate,revision:plan.revision,provider,store,writerModel:model,reviewerModel:model,allowMinorReviewHolds:true});
 issues=result.editions.map(i=>({...i,reviewCopy:true}));reviews=result.reviews;await save('reviews.json',reviews);
 const selected:Record<string,unknown>=Object.create(null);
 try{Object.assign(selected,JSON.parse(await readFile(resolve(directory,'selected-images.json'),'utf8')));}catch{/* new issue */}
 for(const issue of issues)for(const a of issue.articles){
  const story=plan.stories.find((s:{id:string})=>s.id===a.storyId),cacheKey=story.image==='photo'?a.storyId:issue.edition+':'+a.storyId;
  if(selected[cacheKey]){a.image=selected[cacheKey] as typeof a.image;continue;}
  if(story.image==='photo'){
   const record:AssetRecord={kind:'event_photo',alt:'Landsat satellite view of the Atacama Desert during the 2026 flowering season.',caption:'Satellite view, October 24, 2026; not a photograph taken today.',author:'Michala Garrison',publisher:'NASA Earth Observatory',credit:'NASA Earth Observatory / Michala Garrison · USGS Landsat data',licenseCode:'PUBLIC_DOMAIN',licenseUrl:'https://www.nasa.gov/nasa-brand-center/images-and-media/',sourcePage:story.url,originalUrl:'https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/iotd/2026/el-niño-rains-paint-the-atacama/atacamabloom_oli2_20261024_th.jpg?w=1200',rightsConfirmed:true,photographedAt:'2026-10-24'};
   a.image=await approvedBundledPhoto(resolve('content/source-assets',story.id),record,directory)||(await downloadAsset(record,['assets.science.nasa.gov'],directory)).image;
  }else if(story.image==='generate'){
   if(reservations.includes(cacheKey))throw Error('IMAGE_RESERVATION_UNRESOLVED');
   if(reservations.length>=6)throw Error('IMAGE_LIMIT');reservations.push(cacheKey);imageAttempts++;await save('image-reservations.json',reservations);
   const prompt=audienceConceptPrompt(story.concept,issue.edition),image=await generateNvidiaImage(key,{prompt,model:'black-forest-labs/flux-3-image-klein'});
   const record:AssetRecord={kind:'generated_illustration',alt:'Concept illustration of '+(story.id==='philosophy'?'students discussing ideas':'a classroom AI picture-sorting activity')+'. Not a photograph of the event.',caption:'AI 概念插畫，非事件照片。',author:'DayDay',publisher:'DayDay',credit:'DayDay',licenseCode:'GENERATED',rightsConfirmed:true,photographedAt:null,generation:{provider:'nvidia',model:image.model,prompt,generatedAt:new Date().toISOString()}};
   a.image=(await prepareAsset(image.bytes,image.mime,record,directory)).image;
  }
  selected[cacheKey]=a.image;await save('selected-images.json',selected);
 }
 await save('editions.json',issues);
 const files=await renderIssues(issues,directory);pdfVerified=true;await save('verified-files.json',files);
 const css=(await readFile('app/globals.css','utf8')).replaceAll('/fonts/','fonts/');
 for(const issue of issues)await writeFile(resolve(directory,issue.edition+'.html'),renderReviewReader(issue,{css,pdfAvailable:true}));
 await cp('public/media-fallback.js',resolve(directory,'media-fallback.js'));
}catch(error){await save('failure.json',error instanceof z.ZodError?{kind:'validation',issues:error.issues.map(i=>({path:i.path,code:i.code,message:i.message}))}:{kind:error instanceof Error?error.name:'unknown',message:error instanceof Error?error.message.replaceAll(key||'__no_key__','[redacted]').slice(0,1500):'unknown'});const message=error instanceof Error?error.message:'';errorCode=/^[A-Za-z0-9_:\-]{1,200}$/.test(message)?message:'EDITION_GENERATION_FAILED';}
await save('report.json',{packetId:id,issueDate:plan.issueDate,revision:plan.revision,status:!errorCode&&pdfVerified?'review_ready':'needs_review',model,editorCorrectionsApplied,historyAdjustmentsApplied,sourceSnapshotsUsed:evidence.filter(e=>(e as {evidenceMode:string}).evidenceMode==='developer_reviewed_snapshot').length,generatedAt:new Date().toISOString(),totalModelCalls:priorCalls+budget.calls,totalTokens:priorTokens+budget.tokens,ledger:budget.ledger,costStatus:'cost_unknown',estimatedUsd:null,imageAttempts,pdfVerified,reviewRecords:reviews.length,generatedArticles:issues.reduce((n,i)=>n+i.articles.length,0),errorCode,databaseWritten:false,published:false,sourceSelection:plan.sourceSelection});
console.log(JSON.stringify({packetId:id,errorCode,pdfVerified,modelCalls:budget.calls}));if(errorCode)process.exitCode=1;
