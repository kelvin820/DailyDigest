import {mkdir,readFile,writeFile,readdir,unlink,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {load} from 'cheerio';
import {z} from 'zod';
import {factSchema} from '../lib/schemas/editorial';
import {articleSchema,type EditionView} from '../lib/schemas/edition';
import {safeFetch} from '../lib/content/safe-fetch.mjs';
import {Budget,hash} from '../lib/pipeline/state.mjs';
import {NvidiaProvider} from '../lib/providers/text';
import {generateNvidiaImage} from '../lib/providers/image';
import {produceEditions} from '../lib/pipeline/editorial';
import {validatedPreviewCheckpoints} from '../lib/preview/checkpoints';
import {downloadAsset,prepareAsset,type AssetRecord} from '../lib/media/prepare';
import {selectIssueImages,applyAudienceImages,type ImageSelection} from '../lib/media/select';
import {audienceConceptPrompt} from '../lib/media/audience';
import {renderArticle,esc} from '../lib/render.mjs';
import {editionKeys,editions} from '../config/editions';
import {DAILY_STORY_COUNT} from '../config/issue-settings.mjs';
import {renderIssues} from './render';

const TRIAL_TEXT_MODEL='nvidia/nemotron-3-ultra-550b-a55b';
const plan=JSON.parse(await readFile('config/trial-2026-11-19.json','utf8'));
if(plan.storyCount!==DAILY_STORY_COUNT||plan.stories.length!==4)throw Error('TRIAL_PLAN_COUNT_MISMATCH');
const visualReplacements=z.array(z.object({edition:z.enum(editionKeys),storyId:z.string(),rejectedAssetId:z.string().regex(/^[a-f0-9]{64}$/),replacementKey:z.string(),reason:z.string(),concept:z.string().max(600)}).strict()).max(2).parse(JSON.parse(await readFile('config/trial-image-replacements.json','utf8')));
const allowedImageKeys=new Set([...editionKeys.flatMap(e=>plan.stories.map((s:{id:string})=>e+':trial-'+s.id)),...visualReplacements.map(r=>r.replacementKey)]);
const maxImageAttempts=6+visualReplacements.length;
const directory=resolve('output/daily-production-trial');await mkdir(directory,{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'';
const save=async(name:string,value:unknown)=>{const text=JSON.stringify(value,null,2);if(key&&text.includes(key))throw Error('SECRET_IN_OUTPUT');await writeFile(resolve(directory,name),text);};
const context={contract:'real-source-four-story-trial-v1',planHash:hash(plan),model:TRIAL_TEXT_MODEL};
const records:Record<string,unknown>=Object.create(null),initial=new Set<string>(),read=new Set<string>(),written=new Set<string>();
const budget=new Budget({usd:2,maxCalls:70,maxTokens:150000,inputRate:undefined,outputRate:undefined});
let facts:z.infer<typeof factSchema>[]=[],issues:EditionView[]=[],reviews:unknown[]=[],errorCode:string|null=null,pdfVerified=false;
let resumedFacts=false;let priorModelCalls=0,priorTokens=0;let sourceReads=0,sourceSnapshotsUsed=0,imageAttempts=0;const appliedCorrections:unknown[]=[];const imageReservations:string[]=[];let media:unknown=null;
try{
  if(process.env.TRIAL_RESUME_DIR){
    const previous=resolve(process.env.TRIAL_RESUME_DIR);
    const previousContext=JSON.parse(await readFile(resolve(previous,'context.json'),'utf8'));
    if(previousContext.contract!==context.contract||previousContext.planHash!==context.planHash){const previousReport=JSON.parse(await readFile(resolve(previous,'report.json'),'utf8'));if(previousReport.totalModelCalls!==0||previousReport.modelRequestAttempts!==0||previousReport.imageAttempts!==0)throw Error('TRIAL_CONTEXT_MISMATCH');}
    const imported=validatedPreviewCheckpoints(JSON.parse(await readFile(resolve(previous,'checkpoints.json'),'utf8')));
    for(const [k,v]of Object.entries(imported)){records[k]=v;initial.add(k);}
    const prior=JSON.parse(await readFile(resolve(previous,'report.json'),'utf8'));
    try{facts=z.array(factSchema).length(4).parse(JSON.parse(await readFile(resolve(previous,'facts.json'),'utf8')));resumedFacts=true;}catch(error){if(prior.modelRequestAttempts!==0||prior.totalModelCalls!==0||Object.keys(imported).length)throw error;}
    if(prior.ledger?.some((l:{status:string})=>l.status==='usage_unknown'))throw Error('USAGE_RECONCILIATION_REQUIRED');
    priorModelCalls=prior.totalModelCalls??prior.modelRequestAttempts;priorTokens=prior.totalTokens??0;
    budget.maxCalls=70-priorModelCalls;budget.maxTokens=150000-priorTokens;
    const state=JSON.parse(await readFile(resolve(previous,'image-reservations.json'),'utf8'));
    if(!Array.isArray(state)||state.length>maxImageAttempts||new Set(state).size!==state.length||state.some(id=>!allowedImageKeys.has(id)))throw Error('TRIAL_IMAGE_STATE_INVALID');
    imageReservations.push(...state);
    for(const file of ['assets','selected-images.json','editor-corrections.json','editor-correction-history.json'])try{await cp(resolve(previous,file),resolve(directory,file),{recursive:true});}catch{/* optional unfinished media */}
  }
  await save('context.json',context);await save('image-reservations.json',imageReservations);
  const evidence=[];
  for(const s of plan.stories){
    const response=await safeFetch(s.url,[new URL(s.url).hostname],{timeoutMs:30000});
    const $=load(response.text);$('script,style,nav,header,footer').remove();let text=$('body').text().replace(/\s+/g,' ');let evidenceMode='fetched';
    if(!text.trim()&&s.approvedSnapshot){const snapshot=s.approvedSnapshot;if(snapshot.sourceUrl!==s.url||snapshot.evidenceHash!==hash(snapshot.evidence)||Date.now()-Date.parse(snapshot.capturedAt)>86400_000)throw Error('SOURCE_SNAPSHOT_INVALID');text=snapshot.evidence;evidenceMode='reviewed_snapshot';sourceSnapshotsUsed++;}
    if(s.quotes.some((q:string)=>!text.includes(q))){await save('source-diagnostic.json',{storyId:s.id,title:$('title').text(),textLength:text.length,missingQuotes:s.quotes.filter((q:string)=>!text.includes(q)),excerpt:text.slice(0,1800)});throw Error('SOURCE_EVIDENCE_CHANGED_'+s.id);}
    if(evidenceMode==='fetched')sourceReads++;evidence.push({storyId:'trial-'+s.id,url:response.url,readAt:new Date().toISOString(),sha256:hash(response.text),evidenceMode,snapshotCapturedAt:evidenceMode==='reviewed_snapshot'?s.approvedSnapshot.capturedAt:null,verifiedQuotes:s.quotes});
    if(!resumedFacts){
      const now=new Date().toISOString(),sourceId='source-'+s.id,published=s.date+'T00:00:00Z';
      facts.push(factSchema.parse({story_id:'trial-'+s.id,event_key:'official-'+s.id+'-'+s.date,
        primary_category:s.category,content_kind:'news',published_at:published,published_at_precision:'date',
        event_date:null,is_demo:false,sensitivity:'low',uncertainties:s.uncertainties,
        sources:[{source_id:sourceId,url:s.url,publisher:s.publisher,published_at:published,published_at_precision:'date',
          retrieved_at:now,read_at:now,rights_reviewed:true,independence_group:s.publisher,evidence:s.quotes.join('\n')}],
        claims:s.claims.map(([text,must_keep,status]:[string,boolean,string],i:number)=>({claim_id:'claim-'+(i+1),text,must_keep,status,supporting_source_ids:[sourceId],evidence_ref:sourceId}))}));
    }
  }
  await save('source-evidence.json',evidence);await save('facts.json',facts);
  if(process.env.TRIAL_VALIDATE_SOURCES_ONLY==='true'){console.log('Four source pages and exact evidence quotes verified.');process.exit(0);}
  if(!key)throw Error('NVIDIA_KEY_REQUIRED');
  const invalidReplies:unknown[]=[];
  const provider=new NvidiaProvider(key,budget,async reply=>{invalidReplies.push(reply);await save('invalid-responses.json',invalidReplies);});
  const historical=process.env.TRIAL_REVIEW_RECOVERY_DIR?validatedPreviewCheckpoints(JSON.parse(await readFile(resolve(process.env.TRIAL_REVIEW_RECOVERY_DIR,'checkpoints.json'),'utf8'))):{};
  const store={reviewedCandidates:async(storyId:string,edition:string)=>[0,1,2].map(attempt=>({writer:historical[`${storyId}:${edition}:write:${attempt}`],review:historical[`${storyId}:${edition}:review:${attempt}`]})),get:async(k:string)=>{read.add(k);return records[k];},set:async(k:string,value:unknown)=>{records[k]=value;written.add(k);await save('checkpoints.json',records);console.log('Checkpoint:',k);}};
  const corrections=JSON.parse(await readFile('config/trial-editor-corrections.json','utf8')) as {storyId:string;edition:string;writerOutputHash:string;reason:string;replacements:{from:string;to:string}[];headline?:string;used_claim_ids?:string[];omitted_optional_claim_ids?:string[];vocabulary?:{term:string;definitionEn:string;meaningZhHant:string}[]}[];
  try{const prior=JSON.parse(await readFile(resolve(directory,'editor-corrections.json'),'utf8'));if(!Array.isArray(prior)||prior.some(p=>!corrections.some(c=>c.storyId===p.storyId&&c.edition===p.edition&&c.writerOutputHash===p.writerOutputHash)))throw Error('EDITOR_CORRECTION_STATE_INVALID');
    appliedCorrections.push(...prior.filter(p=>corrections.some(c=>hash(c)===hash(p))));
    const superseded=prior.filter(p=>!corrections.some(c=>hash(c)===hash(p)));if(superseded.length)await save('editor-correction-history.json',{supersededAt:new Date().toISOString(),corrections:superseded});
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const generated=await produceEditions({allowMinorReviewHolds:true,editorPolicyHash:hash(corrections),editDraft:async input=>{
    const correction=corrections.find(c=>c.storyId===input.storyId&&c.edition===input.edition&&c.writerOutputHash===input.outputHash);
    if(!correction)return input.data;const data=structuredClone(input.data);
    for(const replacement of correction.replacements){let changed=0;data.body_paragraphs=data.body_paragraphs.map(p=>{if(!p.includes(replacement.from))return p;changed++;return p.replace(replacement.from,replacement.to);});if(changed!==1)throw Error('EDITOR_CORRECTION_CONTEXT_MISMATCH');}
    if(correction.headline)data.headline=correction.headline;
    if(correction.used_claim_ids)data.used_claim_ids=correction.used_claim_ids;
    if(correction.omitted_optional_claim_ids)data.omitted_optional_claim_ids=correction.omitted_optional_claim_ids;
    if(correction.vocabulary)data.vocabulary=correction.vocabulary;
    if(!appliedCorrections.some(c=>hash(c)===hash(correction)))appliedCorrections.push(correction);await save('editor-corrections.json',appliedCorrections);return data;
  },facts,issueDate:plan.issueDate,revision:1,provider,store,writerModel:TRIAL_TEXT_MODEL,reviewerModel:TRIAL_TEXT_MODEL});
  issues=generated.editions.map(issue=>({...issue,reviewCopy:true}));reviews=generated.reviews;
  await save('reviews.json',reviews);
  const photo:AssetRecord={kind:'event_photo',alt:'Two NIST researchers with safety glasses working beside laser equipment.',caption:'NIST researchers in the laboratory. Photo: Riley Wilson/NIST.',
    author:'Riley Wilson/NIST',publisher:'NIST',credit:'Riley Wilson/NIST · image resized; original at source',licenseCode:'PUBLIC_DOMAIN',
    licenseUrl:'https://www.nist.gov/open/license',sourcePage:plan.stories[1].url,
    originalUrl:'https://www.nist.gov/sites/default/files/styles/960_x_960_limit/public/images/2026/11/17/QPV.jpg.webp?itok=_kI5dMfT',rightsConfirmed:true,photographedAt:null};
  const cached=new Map<string,unknown>();const cachedRecords=new Map<string,AssetRecord>();
  try{for(const entry of JSON.parse(await readFile(resolve(directory,'selected-images.json'),'utf8'))){const image=articleSchema.shape.image.parse(entry.image);if(image.rendition){
    const bytes=await readFile(resolve(directory,image.rendition.printPath));
    const manifest=JSON.parse(await readFile(resolve(directory,'assets',image.assetId+'.json'),'utf8'));
    const {createHash}=await import('node:crypto');if(createHash('sha256').update(bytes).digest('hex')!==manifest.print.sha256)throw Error('TRIAL_ASSET_HASH_MISMATCH');const cacheKey=entry.edition+':'+entry.storyId;cached.set(cacheKey,image);cachedRecords.set(cacheKey,Object.fromEntries(Object.entries(manifest).filter(([k])=>['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl','rightsConfirmed','photographedAt','generation'].includes(k))) as AssetRecord);
  }}}catch{/* no completed media checkpoint */}
  const pendingVisualReplacements=new Map<string,typeof visualReplacements[number]>();
  for(const replacement of visualReplacements){const variant=replacement.edition+':'+replacement.storyId;const existing=cached.get(variant) as {assetId?:string}|undefined;if(existing?.assetId===replacement.rejectedAssetId){cached.delete(variant);cachedRecords.delete(variant);pendingVisualReplacements.set(variant,replacement);}}
  await save('visual-rejections.json',visualReplacements);
  const prompts:Record<string,string>={'trial-nicer':'A watercolor concept illustration of stars and a telescope, without technical equipment details.','trial-voices':'A watercolor illustration of an open book and a folded map on a wooden reading table.'};
  const selections:({edition:string}&Record<string,unknown>)[]=[];const byEdition:Partial<Record<string,ImageSelection[]>>={};
  let sharedPhoto:unknown;
  for(const issue of issues){
    const selected=await selectIssueImages({stories:issue.articles.map(a=>{const cacheKey=issue.edition+':'+a.storyId;return{storyId:a.storyId,category:a.category,illustrationUseful:!!prompts[a.storyId],conceptSafe:!!prompts[a.storyId],
      candidates:cached.has(cacheKey)?[{id:cacheKey,relevant:true,matchesEvent:a.storyId==='trial-quantum',record:cachedRecords.get(cacheKey)}]:a.storyId==='trial-quantum'?[{id:'nist-photo',relevant:true,matchesEvent:true,record:photo}]:[]};}),
      loadCandidate:async(candidate,record)=>{if(cached.has(candidate.id))return cached.get(candidate.id);if(!sharedPhoto)sharedPhoto=(await downloadAsset(record,['www.nist.gov'],directory)).image;return sharedPhoto;},
      reserveGeneration:async({storyId})=>{const variant=issue.edition+':'+storyId;const reservation=pendingVisualReplacements.get(variant)?.replacementKey||variant;if(imageReservations.includes(reservation)||imageReservations.length>=maxImageAttempts)return false;imageReservations.push(reservation);await save('image-reservations.json',imageReservations);return true;},
      generateConcept:async story=>{imageAttempts++;const prompt=audienceConceptPrompt(pendingVisualReplacements.get(issue.edition+':'+story.storyId)?.concept||prompts[story.storyId],issue.edition);const result=await generateNvidiaImage(key,{prompt});
        const record:AssetRecord={kind:'generated_illustration',alt:issue.edition+' audience: AI-generated watercolor concept illustration, not a photograph of the news event.',caption:'AI 概念插畫 · '+editions[issue.edition].label+'，非事件照片。',author:'DayDay / NVIDIA',publisher:'DayDay',credit:'DayDay · NVIDIA '+result.model,licenseCode:'GENERATED',rightsConfirmed:true,photographedAt:null,
          generation:{provider:'nvidia',model:result.model,prompt:result.prompt,generatedAt:new Date().toISOString()}};
        const prepared=await prepareAsset(result.bytes,result.mime,record,directory);return{record,image:prepared.image};},maxGeneratedImages:2});
    selections.push(...selected.map(selection=>({...selection,edition:issue.edition})));
    await save('selected-images.json',selections);byEdition[issue.edition]=selected;
  }
  issues=applyAudienceImages(issues,byEdition);
  media={selections,newImageApiCalls:imageAttempts,reservedImageCalls:imageReservations.length,maximumImageAttempts:maxImageAttempts,visualReplacements,policy:'photo-first; separate elementary/junior/senior concept illustrations; two concept stories, six initial dated-trial image attempts plus one explicit visual correction; original icons on failure'};
  await save('editions.json',issues);await renderIssues(issues,directory);pdfVerified=true;
}catch(error){
  const message=error instanceof Error?error.message:'';
  errorCode=/^[A-Za-z0-9_:-]{1,180}$/.test(message)?message:'TRIAL_FAILED';
  if(!pdfVerified)for(const file of await readdir(directory))if(file.endsWith('.pdf'))await unlink(resolve(directory,file));
}
const complete=!errorCode&&pdfVerified&&issues.length===3&&issues.every(i=>i.articles.length===4)&&reviews.length===12;
const editorialReviewHolds=(reviews as {storyId:string;edition:string;publish_recommendation:string;issues:unknown[]}[]).filter(r=>r.publish_recommendation==='revise');
const report={editorialReviewRequired:editorialReviewHolds.length>0,editorialReviewHolds,status:complete?'review_copy_ready':'needs_review',issueDate:plan.issueDate,generatedAt:new Date().toISOString(),storyCount:4,
  generatedArticles:issues.reduce((n,i)=>n+i.articles.length,0),reviewRecords:reviews.length,sourcePagesRead:sourceReads,sourceSnapshotsUsed,
  model:TRIAL_TEXT_MODEL,editorCorrectionsApplied:appliedCorrections.length,editorCorrectionRecord:appliedCorrections.length?'editor-corrections.json':null,modelRequestAttempts:budget.calls,reusedModelSteps:[...read].filter(k=>initial.has(k)&&!written.has(k)).length,
  totalModelCalls:priorModelCalls+budget.calls,totalTokens:priorTokens+budget.tokens,
  costStatus:'cost_unknown',estimatedUsd:null,ledger:budget.ledger,imageAttempts,pdfVerified,media,errorCode,
  databaseWritten:false,published:false,automaticScheduleEnabled:false,sourceSelection:plan.sourceSelection,
  limitations:['Trial uses four manually curated official sources; automatic feed selection and hosted database/Storage publication remain unverified.',
    'Publication timestamps normalized to 00:00 UTC have date-only precision; this is not a known publication time.',
    'Image reservation is serialized by the manual workflow and resumed artifacts; the hosted daily image budget is not yet verified.']};
await save('checkpoints.json',records);await save('report.json',report);
const css=(await readFile('app/globals.css','utf8')).replaceAll('/fonts/','fonts/');
for(const issue of issues){const c=editions[issue.edition];await writeFile(resolve(directory,issue.edition+'.html'),`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DayDay 四篇試產 · ${esc(c.label)}</title><style>${css}</style><body><main class="newspaper ${issue.edition}" style="--paper:${c.paper};--accent:${c.accent}"><nav>${editionKeys.map(e=>`<a href="${e}.html">${esc(editions[e].label)}</a>`).join(' · ')}</nav><header class="masthead"><div class="masthead-top">FOUR STORIES. EVERY DAY. YOUR LEVEL.</div><h1>${issue.edition==='senior'?'DAILY DIGEST':'<span class="masthead-wordmark">DAILY DIGEST</span>'}<span>by DayDay</span></h1><div class="dateline">${plan.issueDate} · ${esc(c.cefr)} · REVIEW COPY</div></header><div class="notice"><b>真實來源試產 · 待審未發布</b>每天四篇、同事件三種難度。NVIDIA 生成與模型複核；${appliedCorrections.length?'含編輯校稿，原稿與修正另存紀錄；':''}仍需開發者審閱。${editorialReviewHolds.length?'本期有 '+editorialReviewHolds.length+' 篇保留模型的輕微修訂建議；正式發布門檻尚未通過。':''}</div><p>${['color','ink'].map(mode=>pdfVerified?`<a href="DD_${plan.issueDate}_${issue.edition}_r1_${mode}.pdf">${mode==='color'?'彩色':'省墨'} PDF（兩頁）</a>`:'PDF 未通過').join(' · ')} · <a href="report.json">試產紀錄</a></p><section class="article-grid">${issue.articles.map(a=>'<article class="article">'+renderArticle(a)+'<p>正文 '+a.wordCount+' 字</p></article>').join('')}</section><footer>DayDay · 真實來源試產，不代表正式發布</footer></main><script src="media-fallback.js" defer></script></body></html>`);}
if(issues.length){await cp('public/media-fallback.js',resolve(directory,'media-fallback.js'));await writeFile(resolve(directory,'index.html'),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=elementary.html"><a href="elementary.html">四篇待審刊</a>');}
console.log(JSON.stringify({status:report.status,errorCode,modelCalls:budget.calls,generatedArticles:report.generatedArticles,pdfVerified,published:false}));
if(!complete)process.exitCode=1;
