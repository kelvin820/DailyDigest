import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {publicationCatalog} from '../lib/publications/catalog';
import {benchmarkRuns} from '../lib/editorial/benchmarks';
import {sourceLibrary} from '../lib/editorial/library';
import {resolveRegeneration,regenerateOneStory} from '../lib/editorial/regeneration';
import {NvidiaProvider} from '../lib/providers/text';
import {Budget,hash} from '../lib/pipeline/state.mjs';
import {editionKeys,editions} from '../config/editions';
import {renderIssues} from './render';

const requestText=process.env.REGENERATION_REQUEST||'';
if(Buffer.byteLength(requestText)>12000)throw Error('REGENERATION_REQUEST_TOO_LARGE');
const resolved=resolveRegeneration(JSON.parse(requestText),{packets:publicationCatalog.packets,benchmarks:benchmarkRuns,library:sourceLibrary});
const id='regen-'+(process.env.GITHUB_RUN_ID||''),directory=resolve('output/story-regeneration');
if(!/^regen-\d{1,30}$/.test(id))throw Error('GITHUB_RUN_ID_REQUIRED');
await mkdir(directory,{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'';
const save=async(name:string,value:unknown)=>{const text=JSON.stringify(value,null,2);if(key&&text.includes(key))throw Error('SECRET_IN_OUTPUT');await writeFile(resolve(directory,name),text);};
const writer=await readFile('prompts/writer.v2.txt','utf8'),reviewer=await readFile('prompts/reviewer.v1.txt','utf8');
const context={id,request:resolved.request,promptHash:hash({writer,reviewer}),contract:'single-story-editorial-v2',lengthPolicy:'advisory'};
const cache:Record<string,{inputHash:string;outputHash:string;output:{reply:unknown;ms:number;calls:number}}>={};
const budget=new Budget({usd:2,maxCalls:18,maxTokens:45000,inputRate:undefined,outputRate:undefined});let activeKey:string|null=null,inFlight=false;
if(process.env.REGENERATION_RESUME_DIR){
 const previous=resolve(process.env.REGENERATION_RESUME_DIR);
 if(hash(JSON.parse(await readFile(resolve(previous,'context.json'),'utf8')))!==hash(context))throw Error('REGENERATION_CONTEXT_CHANGED');
 Object.assign(cache,JSON.parse(await readFile(resolve(previous,'checkpoints.json'),'utf8')));
 const b=JSON.parse(await readFile(resolve(previous,'budget.json'),'utf8'));if(b.inFlight||b.ledger.some((e:{status:string})=>e.status==='usage_unknown')||b.activeKey&&!cache[b.activeKey])throw Error('USAGE_RECONCILIATION_REQUIRED');
 budget.calls=b.calls;budget.tokens=b.tokens;budget.ledger=b.ledger;
}
const saveBudget=()=>save('budget.json',{calls:budget.calls,tokens:budget.tokens,ledger:budget.ledger,activeKey,inFlight});
await save('context.json',context);await save('checkpoints.json',cache);await saveBudget();
const port={reserve:async(a:number,b:number)=>{const t=budget.reserve(a,b);inFlight=true;await saveBudget();return t;},settle:async(t:unknown,u:unknown)=>{budget.settle(t,u);inFlight=false;await saveBudget();},fail:async(t:unknown)=>{budget.fail(t);inFlight=false;await saveBudget();}};
const invalid:unknown[]=[];const provider=new NvidiaProvider(key,port,async r=>{invalid.push(r);await save('invalid-responses.json',invalid);});
async function measure<T>(task:string,input:unknown,run:()=>Promise<T>){
 const old=cache[task];if(old){if(old.inputHash!==hash(input)||old.outputHash!==hash(old.output))throw Error('REGENERATION_CACHE_CHANGED');return old.output as {reply:T;ms:number;calls:number};}
 activeKey=task;await saveBudget();const start=Date.now(),before=budget.calls;
 const reply=await run();const output={reply,ms:Date.now()-start,calls:budget.calls-before};
 cache[task]={inputHash:hash(input),outputHash:hash(output),output};await save('checkpoints.json',cache);activeKey=null;await saveBudget();
 if(budget.ledger.some((e:{status:string})=>e.status==='usage_unknown'))throw Error('USAGE_RECONCILIATION_REQUIRED');
 return output;
}
let errorCode:string|null=null,pdfFiles:unknown[]=[],pdfRound:number|null=null;
try{
 if(!key)throw Error('NVIDIA_KEY_REQUIRED');
 await regenerateOneStory(resolved,{provider,writer,reviewer,measure});
 const issues=editionKeys.map(edition=>{const c=editions[edition];return{schemaVersion:'1.0' as const,issueDate:resolved.issueDate,revision:1,edition,targetCefr:c.cefr,templateVersion:'newspaper-grid-2',storyCount:4 as const,readingRules:{min:c.min,max:c.max,avg:c.avg,maxSentence:c.sentenceMax},publishedAt:null,isDemo:false,reviewCopy:true,vocabularyPolicy:'tiered-v1' as const,lengthPolicy:'advisory' as const,articles:resolved.drafts.filter(d=>d.edition===edition).map(d=>d.article!)};});
 if(issues.every(i=>i.articles.every(Boolean))){
  const pdfDir=resolve(directory,'pdf');
  for(const i of issues)for(const a of i.articles)if(a.image.rendition)for(const field of ['webPath','printPath'] as const){const path=a.image.rendition[field];if(!path.startsWith('/preview-issues/')||path.includes('..'))throw Error('INVALID_BASE_IMAGE');const dest=resolve(pdfDir,'.'+path);await mkdir(resolve(dest,'..'),{recursive:true});await copyFile(resolve('public','.'+path),dest);}
  pdfFiles=await renderIssues(issues,pdfDir,{allowUncalibratedReviewDraft:true});pdfRound=1;
 }
}catch(e){const m=e instanceof Error?e.message:'';errorCode=/^[A-Z0-9_]+$/.test(m)?m:'REGENERATION_FAILED';await save('failure.json',{message:m.replaceAll(key||'__no_key__','[redacted]').slice(0,1200)});}
const drafts=resolved.drafts,fresh=drafts.filter(d=>!d.reused),complete=fresh.length===resolved.request.editions.length&&fresh.every(d=>d.article&&d.assessment);
await save('benchmark.json',{id,lengthPolicy:'advisory',kind:'regeneration',request:resolved.request,createdAt:new Date().toISOString(),issueDate:resolved.issueDate,model:resolved.model,status:errorCode||!complete?'partial':'complete',rounds:[{number:1,drafts,apiMs:fresh.reduce((s,d)=>s+d.writerMs+d.reviewerMs,0),firstPass:fresh.filter(d=>d.firstPass).length,complete}],facts:resolved.facts,sourceMode:'Reused reviewed source facts; no new external source fetch. Other articles unchanged.',sourceLabels:[],methodology:'Single-story regeneration from an immutable base; only requested reading levels are rewritten and independently reviewed. Original edition is preserved. No automatic release.',totalCalls:budget.calls,totalTokens:budget.tokens,costStatus:'cost_unknown',estimatedUsd:null,pdfRound,pdfFiles,errorCode,published:false,databaseWritten:false});
console.log(JSON.stringify({id,errorCode,newDrafts:fresh.length,firstPass:fresh.filter(d=>d.firstPass).length,published:false}));
if(errorCode)process.exitCode=1;
