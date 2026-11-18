import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {GoogleProvider,GOOGLE_TEXT_MODELS,GOOGLE_IMAGE_MODELS,listGoogleModels,generateGoogleImage} from '../lib/providers/google';
import {SIMPLE_PARK_IMAGE_PROMPT} from '../lib/providers/image';
import {Budget} from '../lib/pipeline/state.mjs';
import {compareOneStory} from '../lib/preview/compare';
import {previewFacts,partialPreview,writePreviewReaders,type PreviewReport,type PreviewEdition} from '../lib/preview/nvidia';
import {prepareAsset} from '../lib/media/prepare';

const directory=resolve('output/google-preview');await mkdir(directory,{recursive:true});
const key=process.env.GEMINI_API_KEY?.trim()||process.env.GOOGLE_API_KEY?.trim()||'';
const safe=(value:unknown)=>{const result=JSON.stringify(value,null,2);if(key&&result.includes(key))throw Error('GOOGLE_SECRET_IN_OUTPUT');return result;};
const records:Record<string,unknown>={};
const store={get:async(k:string)=>records[k],set:async(k:string,v:unknown)=>{
  safe(v);records[k]=v;await writeFile(resolve(directory,'checkpoints.json'),safe(records));console.log('Google checkpoint:',k);
}};
const budget=new Budget({usd:2,maxCalls:20,maxTokens:80000,inputRate:undefined,outputRate:undefined});
const code=(error:unknown)=>error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'GOOGLE_PREVIEW_FAILED';
const facts=previewFacts(JSON.parse(await readFile('fixtures/stories.json','utf8')));
await writeFile(resolve(directory,'facts.json'),safe(facts));
let issues:PreviewEdition[]=[],checks:unknown[]=[],textError:string|null=null,imageError:string|null=null;
let textModel:string|null=null,imageModel:string|null=null,image=null,imageCalls=0;
let imageUsage:unknown=null,catalogError:string|null=null;
try{
  if(!key)throw Error('GOOGLE_KEY_MISSING');
  const available=await listGoogleModels(key);
  textModel=GOOGLE_TEXT_MODELS.find(model=>available.includes(model))||null;
  imageModel=GOOGLE_IMAGE_MODELS.find(model=>available.includes(model))||null;
  await writeFile(resolve(directory,'models.json'),safe({selectedText:textModel,selectedImage:imageModel,
    availableSupportedText:GOOGLE_TEXT_MODELS.filter(m=>available.includes(m)),
    availableSupportedImage:GOOGLE_IMAGE_MODELS.filter(m=>available.includes(m))}));
}catch(error){catalogError=code(error);}
if(!catalogError)try{
  if(!textModel)throw Error('GOOGLE_TEXT_MODEL_UNAVAILABLE');
  const provider=new GoogleProvider(key,budget);
  // A tiny structured probe stops before repeated edition calls on an unusable account.
  await provider.generateStructured({task:'write',model:textModel,system:'Return the JSON object {"ok":true}.',
    data:{test:'connection'},schema:z.object({ok:z.literal(true)}).strict(),timeoutMs:60000,maxOutputTokens:500});
  const result=await compareOneStory(facts,provider,store,textModel);
  issues=result.editions;checks=result.checks;
  if(issues.some(i=>i.articles.length!==1))throw Error('GOOGLE_COMPARISON_INCOMPLETE');
}catch(error){textError=code(error);}
if(!issues.length)issues=partialPreview(records,facts);
if(!catalogError)try{
  if(!imageModel)throw Error('GOOGLE_IMAGE_MODEL_UNAVAILABLE');
  imageCalls=1;
  const result=await generateGoogleImage(key,imageModel as typeof GOOGLE_IMAGE_MODELS[number],SIMPLE_PARK_IMAGE_PROMPT);
  imageUsage=result.usage;
  const asset=await prepareAsset(result.bytes,result.mime,{kind:'generated_illustration',
    alt:'AI-generated watercolor concept of a public park with trees, a bench and a path.',
    caption:'公園概念插畫，非事件照片。',author:'DayDay / Google Nano Banana',publisher:'DayDay',
    credit:'DayDay · Google Nano Banana',licenseCode:'GENERATED',rightsConfirmed:true,photographedAt:null,
    generation:{provider:'google',model:imageModel,prompt:result.prompt,generatedAt:new Date().toISOString()}},directory);
  image=asset.image;await writeFile(resolve(directory,'image.json'),safe(image));
  for(const issue of issues)for(const article of issue.articles)article.image=image;
}catch(error){imageError=code(error);}
type Ledger={status:string;input_tokens?:number;output_tokens?:number};
const ledger=budget.ledger as Ledger[],textComplete=!catalogError&&!textError&&issues.every(i=>i.articles.length===1);
const report:PreviewReport&Record<string,unknown>={status:textComplete?'comparison_drafts':'needs_review',
  providerName:'Google',model:textModel||'not_selected',imageModel,generatedAt:new Date().toISOString(),
  modelRequestAttempts:budget.calls,modelResponsesWithUsage:ledger.filter(l=>l.status!=='usage_unknown').length,
  usageUnknownAttempts:ledger.filter(l=>l.status==='usage_unknown').length,
  inputTokens:ledger.reduce((n,l)=>n+(l.input_tokens||0),0),outputTokens:ledger.reduce((n,l)=>n+(l.output_tokens||0),0),
  costStatus:'cost_unknown',estimatedUsd:null,pdfVerified:false,published:false,databaseWritten:false,
  newsFetched:false,isDemo:true,scope:'one-fictional-story-three-levels-and-one-image',
  errorCode:catalogError||textError,comparisonChecks:checks,comparisonGenerated:textComplete,
  text:{status:textComplete?'generated':'failed',errorCode:catalogError||textError},
  image:{status:image?'generated':'failed',errorCode:catalogError||imageError,requestAttempts:imageCalls,usage:imageUsage,
    assetId:image?.assetId??null},
  developerNotes:['同一份自有虛構底稿，由 Google API 實際寫稿、複核及試生成配圖。尚未出刊；CEFR 為目標難度。',
    ...(image?[]:['圖片尚未生成成功；下方使用 DayDay 自有分類圖示，沒有用其他供應商圖片代替。'])],
  ledger,limits:{textCalls:20,textTokens:80000,imageRequests:1,scope:'per-manual-run',unknownPricesAreNotFree:true},
};
await writeFile(resolve(directory,'report.json'),safe(report));
await writeFile(resolve(directory,'checkpoints.json'),safe(records));
await writeFile(resolve(directory,'editions.json'),safe(issues));
await writePreviewReaders(directory,issues,report);
console.log(safe({status:report.status,textModel,imageModel,text:report.text,image:report.image,
  textCalls:budget.calls,inputTokens:report.inputTokens,outputTokens:report.outputTokens,published:false}));
if(!textComplete||!image)process.exitCode=1;
