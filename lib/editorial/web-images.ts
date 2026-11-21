import sharp from 'sharp';
import {createHash} from 'node:crypto';
import type {Edition} from '../../config/editions';
import {audienceConceptPrompt,audienceTopicPrompt} from '../media/audience';
import {generateNvidiaImage} from '../providers/image';
import {imageModelPriority} from '../providers/image-config';
import {generateWithImagePriority} from '../media/image-priority';
import {imageFailureCode} from './image-retry';
import {serviceDatabase,WEB_PREFIX,type DocumentStore} from './web-store';
import type {WebJob,WebFact} from './web-types';
import type {ArticleView} from '../schemas/edition';
import {taipeiDate} from '../content/metrics';
import {authorizedBackfill} from './backfill';
import {reserveImageSlot} from './image-budget';
import {hash} from '../pipeline/state.mjs';
export const webAssetKey=(id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('INVALID_ASSET');return WEB_PREFIX+'asset:'+id;};
export type WebAsset={version:number;jobId:string;id:string;webPath:string;printPath:string;image:ArticleView['image'];prompt:string;model:string;createdAt:string;fallbackReason?:'IMAGE_CONTENT_FILTERED'};
export async function generateWebImage(store:DocumentStore,job:WebJob,edition:Edition,fact:WebFact){
 sharp.cache(false);sharp.concurrency(1);
 const imageKey=edition+':'+fact.story_id,day=taipeiDate(),originalSlot=job.id+':'+imageKey,attempt=Math.max(0,(job.imageAttempts?.[imageKey]??1)-1),slot=originalSlot+(attempt?':retry:'+attempt:'');
 const inputHash=hash({fact,edition,contract:'ai-newspaper-image-v1'}),receiptKey=WEB_PREFIX+'image-result:'+hash(originalSlot),receipt=await store.get<{version:number;inputHash:string;image:ArticleView['image'];outputHash:string}>(receiptKey);
 if(receipt){if(receipt.inputHash!==inputHash||receipt.outputHash!==hash(receipt.image))throw Error('IMAGE_RESULT_CHANGED');return receipt.image;}
 const grant=job.campaignId?await authorizedBackfill(store,job.campaignId,job.issueDate):null;
 const ledger=WEB_PREFIX+'image-budget:'+(job.campaignId?'backfill:'+job.campaignId:day),limit=grant?.limits.images??(Number(process.env.MAX_IMAGE_CALLS_PER_DAY)||32),key=process.env.NVIDIA_IMAGE_API_KEY?.trim()||process.env.LLM_API_KEY?.trim()||'';
 const models=imageModelPriority(),model=models[0];
 let prompt=audienceConceptPrompt('Create a wide landscape conceptual editorial illustration for this factual story. Illustrate its central subject simply, without adding factual claims. '+fact.claims.filter(c=>c.must_keep).map(c=>c.text).join(' '),edition),topic=job.imageFallbackSlots?.includes(edition+':'+fact.story_id)??false,primaryAttempted=false,result;
 async function tracedImage(candidate:typeof model,attemptSlot:string,timeoutMs:number){
  const traceKey=WEB_PREFIX+'image-attempt:'+hash(attemptSlot),trace={version:1,jobId:job.id,storyId:fact.story_id,edition,model:candidate,prompt,createdAt:new Date().toISOString(),status:'started',error:null as string|null};
  await store.create(traceKey,trace);
  try{const generated=await generateNvidiaImage(key,{prompt,model:candidate,timeoutMs});await store.compare(traceKey,1,{...trace,version:2,status:'generated'});return generated;}
  catch(error){await store.compare(traceKey,1,{...trace,version:2,status:'failed',error:imageFailureCode(error)});throw error;}
 }
 if(!topic){
  primaryAttempted=true;
  try{
   const routed=await generateWithImagePriority(models.map((candidate,index)=>({id:candidate,run:async()=>{
    const attemptSlot=index?slot+':priority:'+hash(candidate).slice(0,12):slot;
    await reserveImageSlot(store,ledger,attemptSlot,limit,!!grant);
    return tracedImage(candidate,attemptSlot,models.length>1?75000:180000);
   }})));
   result=routed.result;
  }catch(error){if(!(error instanceof Error)||error.message!=='IMAGE_CONTENT_FILTERED'||models.length>1)throw error;topic=true;job.imageFallbackSlots??=[];if(!job.imageFallbackSlots.includes(imageKey))job.imageFallbackSlots.push(imageKey);}
 }
 if(topic){
  await reserveImageSlot(store,ledger,slot,limit,!!grant,primaryAttempted||attempt===0);prompt=audienceTopicPrompt(fact.primary_category,edition);
  result=await tracedImage(model,slot+':topic',90000);
 }
 if(!result)throw Error('IMAGE_RESPONSE_INVALID');
 const input=sharp(result.bytes,{limitInputPixels:40_000_000,animated:false,failOn:'warning'}),meta=await input.metadata();
 if(!meta.width||!meta.height||meta.width<240||meta.height<160||(meta.pages??1)>1)throw Error('IMAGE_RASTER_INVALID');
 const stats=await input.clone().stats();if(stats.channels.slice(0,3).every(c=>c.stdev<2))throw Error('IMAGE_EMPTY_OR_FLAT');
 const id=createHash('sha256').update(result.bytes).digest('hex');
 const web=await input.clone().rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer({resolveWithObject:true});
 const print=await input.clone().rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:90}).toBuffer();
 const webPath=`web-assets/${id}-web.webp`,printPath=`web-assets/${id}-print.jpg`,bucket=serviceDatabase().storage.from('issue-files');
 for(const [path,bytes,contentType] of [[webPath,web.data,'image/webp'],[printPath,print,'image/jpeg']] as const){const {error}=await bucket.upload(path,bytes,{contentType,upsert:true});if(error)throw Error('IMAGE_STORAGE_FAILED');}
 const image:ArticleView['image']={assetId:id,kind:'generated_illustration',alt:topic?'新聞主題概念插畫':fact.claims.find(c=>c.must_keep)!.text,caption:topic?'主題概念插畫，非事件照片':'概念插畫，非事件照片',credit:'DayDay · NVIDIA '+result.model,rendition:{webPath:`/api/editorial/assets/${id}/web`,printPath:`/api/editorial/assets/${id}/print`,width:web.info.width,height:web.info.height},focalPoint:{x:50,y:50}};
 await store.create<WebAsset>(webAssetKey(id),{version:1,jobId:job.id,id,webPath,printPath,image,prompt,model:result.model,createdAt:new Date().toISOString(),...(topic?{fallbackReason:'IMAGE_CONTENT_FILTERED' as const}:{})});
 await store.create(receiptKey,{version:1,inputHash,image,outputHash:hash(image)});return image;
}
