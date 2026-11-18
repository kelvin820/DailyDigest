import {mkdir,readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {NvidiaProvider,DEFAULT_NEMOTRON_MODEL,NVIDIA_BASE_URL} from '../lib/providers/text';
import {Budget} from '../lib/pipeline/state.mjs';
import {produceEditions} from '../lib/pipeline/editorial';
import {renderIssues} from './render';
import {previewFacts,partialPreview,writePreviewReaders,previewError,PREVIEW_ISSUE_DATE,type PreviewReport,type PreviewEdition} from '../lib/preview/nvidia';
import {compareOneStory} from '../lib/preview/compare';

// This entry point always uses the real NVIDIA adapter. No fixture provider fallback.
const run=/^\d+$/.test(process.env.GITHUB_RUN_ID||'')?process.env.GITHUB_RUN_ID!:Date.now()+'-'+randomUUID().slice(0,8);
const directory=resolve('output/nvidia-preview','run-'+run);
await mkdir(directory,{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'';
const inputRate=process.env.LLM_INPUT_USD_PER_MILLION?.trim()?Number(process.env.LLM_INPUT_USD_PER_MILLION):undefined;
const outputRate=process.env.LLM_OUTPUT_USD_PER_MILLION?.trim()?Number(process.env.LLM_OUTPUT_USD_PER_MILLION):undefined;
if((inputRate!==undefined&&(!Number.isFinite(inputRate)||inputRate<0))||(outputRate!==undefined&&(!Number.isFinite(outputRate)||outputRate<0)))throw Error('PREVIEW_PRICE_INVALID');
const comparison=process.env.PREVIEW_MODE!=='full';
const maxCalls=comparison?20:80,maxTokens=comparison?60000:180000;
const budget=new Budget({usd:2,maxCalls,maxTokens,inputRate,outputRate});
const records:Record<string,unknown>={};
const safeJson=(value:unknown)=>{
  const text=JSON.stringify(value,null,2);
  if(key&&text.includes(key))throw Error('PREVIEW_SECRET_IN_OUTPUT');
  return text;
};
const store={get:async(k:string)=>records[k],set:async(k:string,value:unknown)=>{
  safeJson(value);records[k]=value;
  await writeFile(resolve(directory,'checkpoints.json'),safeJson(records));
  console.log('Checkpoint:',k);
}};
let issues:PreviewEdition[]=[],errorCode:string|null=null,pdfVerified=false,comparisonChecks:unknown[]=[];
const invalidReplies:unknown[]=[];
const facts=previewFacts(JSON.parse(await readFile('fixtures/stories.json','utf8')));
await writeFile(resolve(directory,'facts.json'),safeJson(facts));
try{
  if(!key)throw Error('NVIDIA_KEY_REQUIRED');
  const catalogResponse=await fetch(NVIDIA_BASE_URL+'/models',{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!catalogResponse.ok)throw Error('MODEL_CATALOG_HTTP_'+catalogResponse.status);
  const catalog=await catalogResponse.json() as {data?:{id:string}[]};
  if(!catalog.data?.some(model=>model.id===DEFAULT_NEMOTRON_MODEL))throw Error('MODEL_UNAVAILABLE');
  const provider=new NvidiaProvider(key,budget,async reply=>{safeJson(reply);invalidReplies.push(reply);await writeFile(resolve(directory,'invalid-responses.json'),safeJson(invalidReplies));});
  if(comparison){
    const content=await compareOneStory(facts,provider,store,DEFAULT_NEMOTRON_MODEL);
    issues=content.editions;comparisonChecks=content.checks;
    if(issues.some(issue=>issue.articles.length!==1))throw Error('COMPARISON_INCOMPLETE');
  }else{
    const content=await produceEditions({facts,issueDate:PREVIEW_ISSUE_DATE,revision:1,
      provider,store,writerModel:DEFAULT_NEMOTRON_MODEL,reviewerModel:DEFAULT_NEMOTRON_MODEL});
    if(content.editions.some(issue=>!issue.isDemo))throw Error('PREVIEW_MUST_REMAIN_DEMO');
    issues=content.editions;
    await writeFile(resolve(directory,'reviews.json'),safeJson(content.reviews));
    await writeFile(resolve(directory,'editions.json'),safeJson(issues));
    await renderIssues(content.editions,directory);pdfVerified=true;
  }
}catch(error){
  errorCode=previewError(error);
  if(!issues.length)issues=partialPreview(records,facts);
  // Never expose a partially rendered PDF as a verified sample.
  if(!pdfVerified)for(const file of await readdir(directory))if(file.endsWith('.pdf'))await unlink(resolve(directory,file));
}
type Entry={status:string;input_tokens?:number;output_tokens?:number};
const ledger=budget.ledger as Entry[];
const usageUnknownAttempts=ledger.filter(item=>item.status==='usage_unknown').length;
const priced=Number.isFinite(inputRate)&&Number.isFinite(outputRate);
const report:PreviewReport & Record<string,unknown>={
  status:errorCode?(budget.calls===0?'not_started':ledger.some(item=>item.status!=='usage_unknown')?'needs_review':'connection_failed'):comparison?'comparison_drafts':'generated_demo',generatedAt:new Date().toISOString(),model:DEFAULT_NEMOTRON_MODEL,
  modelRequestAttempts:budget.calls,modelResponsesWithUsage:ledger.filter(item=>item.status!=='usage_unknown').length,
  usageUnknownAttempts,inputTokens:ledger.reduce((n,item)=>n+(item.input_tokens||0),0),
  outputTokens:ledger.reduce((n,item)=>n+(item.output_tokens||0),0),
  costStatus:usageUnknownAttempts?'usage_unknown':priced?'estimated':'cost_unknown',
  estimatedUsd:priced&&!usageUnknownAttempts?budget.spent:null,errorCode,pdfVerified,published:false,
  databaseWritten:false,newsFetched:false,inputKind:'owned-fictional-scenarios',fixtureIssueDate:PREVIEW_ISSUE_DATE,
  apiGenerationSucceeded:!errorCode&&pdfVerified&&issues.every(issue=>issue.articles.length===8),
  generatedArticles:issues.reduce((count,issue)=>count+issue.articles.length,0),
  scope:comparison?'one-story-three-levels':'full-eight-story-issue',comparisonChecks,
  comparisonGenerated:comparison&&!errorCode&&issues.every(issue=>issue.articles.length===1),
  limits:{usdLimitWhenPriced:2,calls:maxCalls,tokens:maxTokens,scope:'per-preview-run',unknownPricesAreNotFree:true},
  ledger:budget.ledger,
};
await writeFile(resolve(directory,'checkpoints.json'),safeJson(records));
await writeFile(resolve(directory,'report.json'),safeJson(report));
await writePreviewReaders(directory,issues,report);
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,
  `## NVIDIA preview: ${report.status}\n\nModel: ${DEFAULT_NEMOTRON_MODEL}\n\n`+
  `Requests: ${budget.calls}; responses with usage: ${report.modelResponsesWithUsage}; unknown usage: ${usageUnknownAttempts}.\n\n`+
  `PDF verified: ${pdfVerified}. Published: false. Database written: false.\n\n`+
  `Download the nemotron-preview artifact to inspect the actual drafts, reviews and report.\n`+
  (errorCode?`\nStopped: ${errorCode}. No predefined article body replaces missing output.\n`:''));
console.log('NVIDIA preview:',report.status,'requests:',budget.calls,'PDF verified:',pdfVerified,'published: false','error:',errorCode||'none');
if(errorCode)process.exitCode=1;
