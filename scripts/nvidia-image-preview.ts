import {mkdir,writeFile} from 'node:fs/promises';
import {generateNvidiaImage,NVIDIA_IMAGE_MODEL,NVIDIA_IMAGE_MODELS,SIMPLE_PARK_IMAGE_PROMPT,NVIDIA_OFFICIAL_IMAGE_SAMPLE,
  type NvidiaImageModel} from '../lib/providers/image';
import {prepareAsset} from '../lib/media/prepare';

const directory='output/nvidia-image-preview';
await mkdir(directory,{recursive:true});
const requestedModel=process.env.IMAGE_TEST_MODEL||NVIDIA_IMAGE_MODEL;
const promptCase=process.env.IMAGE_TEST_PROMPT_CASE||'park';
const report={status:'not_started',model:requestedModel,generatedAt:new Date().toISOString(),
  promptCase,
  requestAttempts:0,imageResponseReceived:false,imagesGenerated:0,estimatedUsd:null,costStatus:'cost_unknown',
  automaticDailyBudgetVerified:false,databaseWritten:false,published:false,errorCode:null as string|null,
  responseDiagnostic:null as unknown};
try{
  const key=process.env.LLM_API_KEY||process.env.NVIDIA_API_KEY||'';
  if(!key.trim())throw Error('IMAGE_KEY_MISSING');
  if(!NVIDIA_IMAGE_MODELS.includes(requestedModel as NvidiaImageModel))throw Error('IMAGE_MODEL_NOT_ALLOWED');
  if(!['park','official_coffee'].includes(promptCase))throw Error('IMAGE_PROMPT_NOT_ALLOWED');
  report.requestAttempts=1;
  const result=await generateNvidiaImage(key,{model:requestedModel as NvidiaImageModel,
    prompt:promptCase==='official_coffee'?NVIDIA_OFFICIAL_IMAGE_SAMPLE:SIMPLE_PARK_IMAGE_PROMPT,
    onDiagnostic:diagnostic=>{report.responseDiagnostic=diagnostic;}});
  report.imageResponseReceived=true;
  await mkdir(directory+'/quarantine',{recursive:true});
  await writeFile(directory+'/quarantine/original.'+(result.mime==='image/png'?'png':'jpg'),result.bytes);
  const prepared=await prepareAsset(result.bytes,result.mime,{kind:'generated_illustration',
    alt:promptCase==='official_coffee'?'AI-generated conceptual image of a coffee shop interior.':
      'Conceptual watercolor illustration of a park bench, a leafy tree and a winding path.',
    caption:promptCase==='official_coffee'?'官方範例提示詞的咖啡店概念圖，非現場照片。':
      '公園概念插畫，非真實事件照片。',author:'DayDay / NVIDIA '+result.model,publisher:'DayDay',
    credit:'DayDay · NVIDIA '+result.model.split('/')[1],licenseCode:'GENERATED',rightsConfirmed:true,photographedAt:null,
    generation:{provider:'nvidia',model:result.model,prompt:result.prompt,generatedAt:report.generatedAt,
      ...(result.seed!==undefined?{seed:result.seed}:{})}},directory);
  await writeFile(directory+'/image.json',JSON.stringify(prepared.image,null,2));
  report.imagesGenerated=1;report.status='generated';
}catch(error){
  const code=error instanceof Error?error.message:'';
  report.errorCode=/^IMAGE_[A-Z0-9_]+$/.test(code)?code:'IMAGE_GENERATION_FAILED';
  report.status='failed';process.exitCode=1;
}finally{
  await writeFile(directory+'/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
