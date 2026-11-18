import {mkdir,writeFile} from 'node:fs/promises';
import {generateNvidiaImage,NVIDIA_IMAGE_MODEL} from '../lib/providers/image';
import {prepareAsset} from '../lib/media/prepare';

const directory='output/nvidia-image-preview';
await mkdir(directory,{recursive:true});
const report={status:'not_started',model:NVIDIA_IMAGE_MODEL,generatedAt:new Date().toISOString(),
  requestAttempts:0,imageResponseReceived:false,imagesGenerated:0,estimatedUsd:null,costStatus:'cost_unknown',
  automaticDailyBudgetVerified:false,databaseWritten:false,published:false,errorCode:null as string|null};
try{
  const key=process.env.LLM_API_KEY||process.env.NVIDIA_API_KEY||'';
  if(!key.trim())throw Error('IMAGE_KEY_MISSING');
  report.requestAttempts=1;
  const result=await generateNvidiaImage(key);
  report.imageResponseReceived=true;
  const prepared=await prepareAsset(result.bytes,result.mime,{kind:'generated_illustration',
    alt:'Watercolor sketchbook showing ideas for a possible community park.',
    caption:'公園規劃概念，非真實事件照片。',author:'DayDay / NVIDIA '+NVIDIA_IMAGE_MODEL,publisher:'DayDay',
    credit:'DayDay · NVIDIA '+NVIDIA_IMAGE_MODEL.split('/')[1],licenseCode:'GENERATED',rightsConfirmed:true,photographedAt:null,
    generation:{provider:'nvidia',model:result.model,prompt:result.prompt,generatedAt:report.generatedAt}},directory);
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
