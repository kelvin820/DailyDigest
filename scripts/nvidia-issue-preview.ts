import {mkdir,readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {NvidiaProvider,DEFAULT_NEMOTRON_MODEL,NVIDIA_BASE_URL} from '../lib/providers/text';
import {Budget,hash} from '../lib/pipeline/state.mjs';
import {produceEditions} from '../lib/pipeline/editorial';
import {previewFacts,partialPreview,previewError,writePreviewReaders,PREVIEW_ISSUE_DATE,
  type PreviewEdition,type PreviewReport} from '../lib/preview/nvidia';
import {validatedPreviewCheckpoints} from '../lib/preview/checkpoints';
import {attachPreviewImages} from '../lib/preview/issue-media';
import {renderIssues} from './render';

const directory=resolve('output/nvidia-issue-preview');await mkdir(directory,{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'';
const safe=(value:unknown)=>{const text=JSON.stringify(value,null,2);if(key&&text.includes(key))throw Error('PREVIEW_SECRET_IN_OUTPUT');return text;};
const facts=previewFacts(JSON.parse(await readFile('fixtures/stories.json','utf8')));
const context={contract:'nvidia-issue-v1',factsHash:hash(facts),writerModel:DEFAULT_NEMOTRON_MODEL,reviewerModel:DEFAULT_NEMOTRON_MODEL};
const records:Record<string,unknown>=Object.create(null),initial=new Set<string>(),read=new Set<string>(),written=new Set<string>();
const budget=new Budget({usd:2,maxCalls:80,maxTokens:180000,inputRate:undefined,outputRate:undefined});
let issues:PreviewEdition[]=[],errorCode:string|null=null,pdfVerified=false,media:unknown=null;
try{
  if(process.env.PREVIEW_RESUME_DIR){
    const previous=resolve(process.env.PREVIEW_RESUME_DIR);
    if(hash(JSON.parse(await readFile(resolve(previous,'context.json'),'utf8')))!==hash(context))throw Error('PREVIEW_CONTEXT_MISMATCH');
    const imported=validatedPreviewCheckpoints(JSON.parse(await readFile(resolve(previous,'checkpoints.json'),'utf8')));
    for(const [key,value]of Object.entries(imported)){records[key]=value;initial.add(key);}
  }
  await writeFile(resolve(directory,'context.json'),safe(context));
  await writeFile(resolve(directory,'facts.json'),safe(facts));
  const store={get:async(k:string)=>{read.add(k);return records[k];},set:async(k:string,v:unknown)=>{
    safe(v);written.add(k);records[k]=v;await writeFile(resolve(directory,'checkpoints.json'),safe(records));console.log('Issue checkpoint:',k);
  }};
  if(!key)throw Error('NVIDIA_KEY_REQUIRED');
  const catalog=await fetch(NVIDIA_BASE_URL+'/models',{redirect:'error',signal:AbortSignal.timeout(20_000)});
  if(!catalog.ok)throw Error('MODEL_CATALOG_HTTP_'+catalog.status);
  const models=await catalog.json() as {data?:{id:string}[]};
  if(!models.data?.some(m=>m.id===DEFAULT_NEMOTRON_MODEL))throw Error('MODEL_UNAVAILABLE');
  const invalidReplies:unknown[]=[];
  const provider=new NvidiaProvider(key,budget,async reply=>{safe(reply);invalidReplies.push(reply);
    await writeFile(resolve(directory,'invalid-responses.json'),safe(invalidReplies));});
  const generated=await produceEditions({facts,issueDate:PREVIEW_ISSUE_DATE,revision:1,provider,store,
    writerModel:DEFAULT_NEMOTRON_MODEL,reviewerModel:DEFAULT_NEMOTRON_MODEL});
  if(generated.editions.some(i=>!i.isDemo))throw Error('PREVIEW_MUST_REMAIN_DEMO');
  issues=generated.editions;
  await writeFile(resolve(directory,'reviews.json'),safe(generated.reviews));
  const images=await attachPreviewImages(generated.editions,directory,process.env.PREVIEW_IMAGE_DIR);
  issues=images.editions;media=images.media;
  await writeFile(resolve(directory,'editions.json'),safe(issues));
  await renderIssues(images.editions,directory);pdfVerified=true;
}catch(error){
  errorCode=previewError(error);
  if(error instanceof Error&&/^PREVIEW_(CHECKPOINT_CORRUPT|CONTEXT_MISMATCH)$/.test(error.message))errorCode=error.message;
  if(!issues.length)issues=partialPreview(records,facts);
  if(!pdfVerified)for(const file of await readdir(directory))if(file.endsWith('.pdf'))await unlink(resolve(directory,file));
}
type Entry={status:string;input_tokens?:number;output_tokens?:number};
const ledger=budget.ledger as Entry[];
const reusedModelSteps=[...read].filter(k=>initial.has(k)&&!written.has(k)).length;
const complete=!errorCode&&pdfVerified&&issues.length===3&&issues.every(i=>i.articles.length===8);
const report:PreviewReport&Record<string,unknown>={status:complete?'generated_demo':'needs_review',
  generatedAt:new Date().toISOString(),model:DEFAULT_NEMOTRON_MODEL,modelRequestAttempts:budget.calls,
  modelResponsesWithUsage:ledger.filter(l=>l.status!=='usage_unknown').length,
  usageUnknownAttempts:ledger.filter(l=>l.status==='usage_unknown').length,
  inputTokens:ledger.reduce((n,l)=>n+(l.input_tokens||0),0),outputTokens:ledger.reduce((n,l)=>n+(l.output_tokens||0),0),
  costStatus:ledger.some(l=>l.status==='usage_unknown')?'usage_unknown':'cost_unknown',estimatedUsd:null,
  errorCode,pdfVerified,published:false,databaseWritten:false,newsFetched:false,
  generatedArticles:issues.reduce((n,i)=>n+i.articles.length,0),fullIssueVerified:complete,
  scope:'eight-owned-fictional-stories-three-editions-six-pdfs',fixtureIssueDate:PREVIEW_ISSUE_DATE,
  reusedModelSteps,sourceRunId:process.env.PREVIEW_SOURCE_RUN_ID||null,media,
  limits:{modelCalls:80,tokens:180000,newImageCalls:0,scope:'per-manual-run',unknownPricesAreNotFree:true},ledger,
  developerNotes:['八則底稿皆為自有虛構情境；正文使用實際 NVIDIA 回應，不以舊樣稿補齊。圖片先選已審核授權候選；其他無圖項目使用圖示。本輪沒有新生圖請求。'],
};
await writeFile(resolve(directory,'checkpoints.json'),safe(records));
await writeFile(resolve(directory,'report.json'),safe(report));
await writePreviewReaders(directory,issues,report);
console.log(safe({status:report.status,errorCode,generatedArticles:report.generatedArticles,modelCalls:budget.calls,
  reusedModelSteps,pdfVerified,published:false,databaseWritten:false,newImageApiCalls:0}));
if(!complete)process.exitCode=1;
