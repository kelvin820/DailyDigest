import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {factSchema,writerResponseSchema} from '../lib/schemas/editorial';
import {articleSchema,type ArticleView} from '../lib/schemas/edition';
import {editions,editionKeys,type Edition} from '../config/editions';
import {Budget,hash} from '../lib/pipeline/state.mjs';
import {NvidiaProvider} from '../lib/providers/text';
import {z} from 'zod';
type StructuredReply<T>={data:T;usage:{input_tokens:number;output_tokens:number};providerRequestId?:string};
import {stats} from '../lib/content/metrics';
import {containsTerm} from '../lib/content/core.mjs';
import {learningTermKey} from '../lib/content/vocabulary.mjs';
import {renderIssues} from './render';
import {editorialReviewSchema,editorialReviewPrompt} from '../lib/editorial/quality';

const id=process.env.BENCHMARK_ID||'2026-11-19-new-four';if(!/^[a-z0-9-]{1,80}$/.test(id))throw Error('INVALID_BENCHMARK_ID');
const plan=JSON.parse(await readFile(`config/benchmarks/${id}.json`,'utf8'));
if(plan.rounds!==3||plan.stories.length!==4)throw Error('INVALID_BENCHMARK_PLAN');
const directory=resolve('output/llm-benchmark');await mkdir(directory,{recursive:true});
const key=process.env.LLM_API_KEY?.trim()||'';
const save=async(name:string,value:unknown)=>{const text=JSON.stringify(value,null,2);if(key&&text.includes(key))throw Error('SECRET_IN_OUTPUT');await writeFile(resolve(directory,name),text);};
const writer=await readFile('prompts/writer.v1.txt','utf8'),reviewer=(await readFile('prompts/reviewer.v1.txt','utf8'))+'\n'+editorialReviewPrompt;
const context={id,planHash:hash(plan),promptHash:hash({writer,reviewer}),contract:'independent-first-draft-benchmark-v2'};
const budget=new Budget({usd:2,maxCalls:100,maxTokens:200000,inputRate:undefined,outputRate:undefined});
const cache:Record<string,{inputHash:string;outputHash:string;output:Record<string,unknown>}>=Object.create(null);
let activeKey:string|null=null,inFlight=false;
if(process.env.BENCHMARK_RESUME_DIR){const previous=resolve(process.env.BENCHMARK_RESUME_DIR);if(hash(JSON.parse(await readFile(resolve(previous,'context.json'),'utf8')))!==hash(context))throw Error('BENCHMARK_CONTEXT_CHANGED');Object.assign(cache,JSON.parse(await readFile(resolve(previous,'checkpoints.json'),'utf8')));const b=JSON.parse(await readFile(resolve(previous,'budget.json'),'utf8'));if(b.inFlight||b.ledger.some((e:{status:string})=>e.status==='usage_unknown')||(b.activeKey&&!cache[b.activeKey]))throw Error('USAGE_RECONCILIATION_REQUIRED');budget.calls=b.calls;budget.tokens=b.tokens;budget.ledger=b.ledger;}
const saveBudget=()=>save('budget.json',{calls:budget.calls,tokens:budget.tokens,ledger:budget.ledger,activeKey,inFlight});
await save('context.json',context);await save('checkpoints.json',cache);await saveBudget();
const port={reserve:async(a:number,b:number)=>{const t=budget.reserve(a,b);inFlight=true;await saveBudget();return t;},settle:async(t:unknown,u:unknown)=>{budget.settle(t,u);inFlight=false;await saveBudget();},fail:async(t:unknown)=>{budget.fail(t);inFlight=false;await saveBudget();}};
const invalid:unknown[]=[];const provider=new NvidiaProvider(key,port,async reply=>{invalid.push(reply);await save('invalid-responses.json',invalid);});
async function measured<T>(taskKey:string,input:unknown,run:()=>Promise<StructuredReply<T>>){
 const cached=cache[taskKey];if(cached&&cached.inputHash===hash(input)){if(hash(cached.output)!==cached.outputHash)throw Error('BENCHMARK_CACHE_CORRUPT');return cached.output as {reply?:StructuredReply<T>;error?:string;elapsedMs:number;apiCalls:number};}
 activeKey=taskKey;await saveBudget();const before=budget.calls,start=Date.now();let output:{reply?:StructuredReply<T>;error?:string;elapsedMs:number;apiCalls:number};
 try{output={reply:await run(),elapsedMs:Date.now()-start,apiCalls:budget.calls-before};}catch(e){const m=e instanceof Error?e.message:'';output={error:/^[A-Z0-9_]+$/.test(m)?m:'MODEL_REQUEST_FAILED',elapsedMs:Date.now()-start,apiCalls:budget.calls-before};}
 cache[taskKey]={inputHash:hash(input),outputHash:hash(output),output:output};await save('checkpoints.json',cache);activeKey=null;await saveBudget();
 if(budget.ledger.some((e:{status:string})=>e.status==='usage_unknown'))throw Error('USAGE_RECONCILIATION_REQUIRED');if(output.error==='BUDGET_EXCEEDED')throw Error('BUDGET_EXCEEDED');return output;
}
const facts:z.infer<typeof factSchema>[]=plan.stories.map((s:{id:string;category:string;kind:string;publisher:string;url:string;sourceDate:string;precision:string;eventDate:string|null;quotes:string[];claims:[string,boolean,string][];uncertainties:string[]})=>factSchema.parse({story_id:s.id,event_key:s.id+'-'+plan.issueDate,primary_category:s.category,content_kind:s.kind,published_at:s.sourceDate+'T00:00:00Z',published_at_precision:s.precision,event_date:s.eventDate,is_demo:false,sensitivity:'low',uncertainties:s.uncertainties,sources:[{source_id:'source-'+s.id,publisher:s.publisher,url:s.url,published_at:s.sourceDate+'T00:00:00Z',published_at_precision:s.precision,retrieved_at:plan.capturedAt,read_at:plan.capturedAt,rights_reviewed:true,independence_group:s.publisher,evidence:s.quotes.join('\n')}],claims:s.claims.map(([text,must_keep,status],i)=>({claim_id:'claim-'+(i+1),text,must_keep,status,evidence_ref:'source-'+s.id,supporting_source_ids:['source-'+s.id]}))}));
type Draft={storyId:string;edition:Edition;article:ArticleView|null;writerMs:number;reviewerMs:number;writerCalls:number;reviewerCalls:number;errors:string[];assessment:ReturnType<typeof editorialReviewSchema.parse>|null;firstPass:boolean};
const rounds:{number:number;drafts:Draft[];apiMs:number;firstPass:number;complete:boolean}[]=[];
let errorCode:string|null=null,pdfRound:number|null=null,pdfFiles:unknown[]=[];
try{
 if(!key)throw Error('NVIDIA_KEY_REQUIRED');
 for(let round=1;round<=3;round++){
  const record={number:round,drafts:[] as Draft[],apiMs:0,firstPass:0,complete:false};rounds.push(record);
  for(const edition of editionKeys)for(const [order,fact]of facts.entries()){
   const c=editions[edition],previousLevelTerms=record.drafts.filter(d=>d.storyId===fact.story_id&&d.edition!==edition).flatMap(d=>d.article?.vocabulary.map(v=>v.term)||[]);
   const system=writer.replaceAll('{{edition}}',edition).replaceAll('{{target_cefr}}',c.cefr).replaceAll('{{english_variant}}','American English').replaceAll('{{min_words}}',String(c.min)).replaceAll('{{max_words}}',String(c.max)).replaceAll('{{avg_sentence_max}}',String(c.avg)).replaceAll('{{sentence_max}}',String(c.sentenceMax));
   const w=await measured(`r${round}-${fact.story_id}:${edition}:write:0`,{system,fact,previousLevelTerms,model:plan.model},()=>provider.generateStructured({task:'write',system,data:{fact,previousLevelTerms},schema:writerResponseSchema,model:plan.model,timeoutMs:60000,maxOutputTokens:1800}));
   const d:Draft={storyId:fact.story_id,edition,article:null,writerMs:w.elapsedMs,reviewerMs:0,writerCalls:w.apiCalls,reviewerCalls:0,errors:[],assessment:null,firstPass:false};record.drafts.push(d);
   if(!w.reply||'failure'in w.reply.data){d.errors.push(w.error||('failure'in(w.reply?.data||{})?'LLM 回報底稿不足或無法符合難度':'生成未完成'));continue;}
   const data=w.reply.data,s=stats(data.body_paragraphs.join(' '));
   d.article=articleSchema.parse({storyId:fact.story_id,order:order+1,category:fact.primary_category,contentKind:fact.content_kind,headline:data.headline,bodyParagraphs:data.body_paragraphs,wordCount:s.count,vocabulary:data.vocabulary,image:{assetId:fact.primary_category,alt:fact.primary_category+' original category illustration',caption:'原創分類圖示',kind:'icon',credit:'DayDay'},sources:fact.sources.map(source=>({publisher:source.publisher,url:source.url,publishedAt:source.published_at,publishedAtPrecision:source.published_at_precision})),eventDate:fact.event_date});
   if(s.count<c.min||s.count>c.max)d.errors.push(`字數 ${s.count}，目標 ${c.min}–${c.max}`);
   if(s.average>c.avg||s.max>c.sentenceMax)d.errors.push('句長超過目標');
   if(data.vocabulary.some(v=>!containsTerm(data.body_paragraphs.join(' '),v.term)))d.errors.push('單字未實際出現在正文');
   if(data.vocabulary.some(v=>previousLevelTerms.some(t=>learningTermKey(t)===learningTermKey(v.term))))d.errors.push('與較簡單版本重複選字');
   if(new Set(data.vocabulary.map(v=>learningTermKey(v.term))).size!==2)d.errors.push('單字重複');
   if(fact.claims.some(cl=>cl.must_keep&&!data.used_claim_ids.includes(cl.claim_id))||data.used_claim_ids.some(id=>!fact.claims.some(cl=>cl.claim_id===id)))d.errors.push('必要事實或 claim ID 不符');
   const input={fact,article:d.article,target:c.cefr,stats:s};
   const r=await measured(`r${round}-${fact.story_id}:${edition}:review:0`,{...input,system:reviewer,model:plan.model},()=>provider.generateStructured({task:'review',system:reviewer,data:input,schema:editorialReviewSchema,model:plan.model,timeoutMs:60000,maxOutputTokens:1200}));
   d.reviewerMs=r.elapsedMs;d.reviewerCalls=r.apiCalls;d.assessment=r.reply?.data||null;if(r.error)d.errors.push('模型複核未完成：'+r.error);
   d.firstPass=d.errors.length===0&&w.apiCalls===1&&r.apiCalls===1&&d.assessment?.factual_status==='pass'&&d.assessment?.level_fit==='suitable'&&d.assessment?.suitability==='pass'&&d.assessment?.publish_recommendation==='pass'&&!d.assessment.issues.some(i=>i.severity!=='minor');
   record.apiMs=record.drafts.reduce((n,d)=>n+d.writerMs+d.reviewerMs,0);record.firstPass=record.drafts.filter(d=>d.firstPass).length;
   console.log(JSON.stringify({round,edition,story:fact.story_id,firstPass:d.firstPass,elapsedMs:d.writerMs+d.reviewerMs}));
  }
  record.apiMs=record.drafts.reduce((n,d)=>n+d.writerMs+d.reviewerMs,0);record.firstPass=record.drafts.filter(d=>d.firstPass).length;
  record.complete=record.drafts.length===12&&record.drafts.every(d=>d.article&&d.assessment);
 }
 const best=[...rounds].filter(r=>r.drafts.length===12&&r.drafts.every(d=>d.article)).sort((a,b)=>b.firstPass-a.firstPass||a.apiMs-b.apiMs)[0];
 if(best){pdfRound=best.number;const issues=editionKeys.map(edition=>{const c=editions[edition];return{schemaVersion:'1.0' as const,issueDate:plan.issueDate,revision:100+best.number,edition,targetCefr:c.cefr,templateVersion:'newspaper-grid-2',storyCount:4 as const,readingRules:{min:c.min,max:c.max,avg:c.avg,maxSentence:c.sentenceMax},publishedAt:null,isDemo:false,reviewCopy:true,vocabularyPolicy:'tiered-v1' as const,articles:best.drafts.filter(d=>d.edition===edition).map(d=>d.article!)};});pdfFiles=await renderIssues(issues,resolve(directory,'pdf'),{allowUncalibratedReviewDraft:true});}
}catch(e){const m=e instanceof Error?e.message:'';errorCode=/^[A-Z0-9_]+$/.test(m)?m:'BENCHMARK_FAILED';await save('failure.json',{message:m.replaceAll(key||'__no_key__','[redacted]').slice(0,1200)});}
for(const record of rounds){record.apiMs=record.drafts.reduce((n,d)=>n+d.writerMs+d.reviewerMs,0);record.firstPass=record.drafts.filter(d=>d.firstPass).length;}
await save('benchmark.json',{id,issueDate:plan.issueDate,model:plan.model,status:errorCode?'partial':'complete',rounds,facts,sourceMode:plan.sourceMode,sourceLabels:plan.stories.map((s:{id:string;sourceDateLabel?:string})=>({storyId:s.id,label:s.sourceDateLabel||null})),methodology:'Three independent first-draft rounds with identical facts, model and prompts; no cache shared between rounds, no manual copy edits, no semantic retries. API time includes network and schema repairs; PDF/layout time is excluded. Resume uses the original recorded timing.',totalCalls:budget.calls,totalTokens:budget.tokens,costStatus:'cost_unknown',estimatedUsd:null,pdfRound,pdfFiles,errorCode,published:false,databaseWritten:false});
console.log(JSON.stringify({status:errorCode?'partial':'complete',totalCalls:budget.calls,pdfRound,errorCode}));if(errorCode)process.exitCode=1;
