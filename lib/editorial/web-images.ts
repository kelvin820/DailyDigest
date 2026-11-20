import sharp from 'sharp';
import {createHash} from 'node:crypto';
import type {Edition} from '../../config/editions';
import {audienceConceptPrompt} from '../media/audience';
import {generateNvidiaImage} from '../providers/image';
import {changeDocument,serviceDatabase,WEB_PREFIX,type DocumentStore} from './web-store';
import type {WebJob,WebFact} from './web-types';
import type {ArticleView} from '../schemas/edition';
import {taipeiDate} from '../content/metrics';
export const webAssetKey=(id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('INVALID_ASSET');return WEB_PREFIX+'asset:'+id;};
export type WebAsset={version:number;jobId:string;id:string;webPath:string;printPath:string;image:ArticleView['image'];prompt:string;model:string;createdAt:string};
export async function generateWebImage(store:DocumentStore,job:WebJob,edition:Edition,fact:WebFact){
 const day=taipeiDate(),slot=job.id+':'+edition+':'+fact.story_id;
 await changeDocument<{version:number;slots:string[]}>(store,WEB_PREFIX+'image-budget:'+day,()=>({version:0,slots:[]}),v=>{
  if(v.slots.includes(slot))throw Error('IMAGE_ALREADY_ATTEMPTED');
  const limit=Number(process.env.MAX_IMAGE_CALLS_PER_DAY)||16;if(v.slots.length>=limit)throw Error('IMAGE_BUDGET_EXCEEDED');v.slots.push(slot);
 });
 const prompt=audienceConceptPrompt('Create a wide landscape conceptual editorial illustration for this factual story. Illustrate its central subject simply, without adding factual claims. '+fact.claims.filter(c=>c.must_keep).map(c=>c.text).join(' '),edition);
 const result=await generateNvidiaImage(process.env.NVIDIA_IMAGE_API_KEY?.trim()||process.env.LLM_API_KEY?.trim()||'',{prompt});
 const input=sharp(result.bytes,{limitInputPixels:40_000_000,animated:false,failOn:'warning'}),meta=await input.metadata();
 if(!meta.width||!meta.height||meta.width<240||meta.height<160||(meta.pages??1)>1)throw Error('IMAGE_RASTER_INVALID');
 const stats=await input.clone().stats();if(stats.channels.slice(0,3).every(c=>c.stdev<2))throw Error('IMAGE_EMPTY_OR_FLAT');
 const id=createHash('sha256').update(result.bytes).digest('hex');
 const web=await input.clone().rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer({resolveWithObject:true});
 const print=await input.clone().rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:90}).toBuffer();
 const webPath=`web-assets/${id}-web.webp`,printPath=`web-assets/${id}-print.jpg`,bucket=serviceDatabase().storage.from('issue-files');
 for(const [path,bytes,contentType] of [[webPath,web.data,'image/webp'],[printPath,print,'image/jpeg']] as const){const {error}=await bucket.upload(path,bytes,{contentType,upsert:true});if(error)throw Error('IMAGE_STORAGE_FAILED');}
 const image:ArticleView['image']={assetId:id,kind:'generated_illustration',alt:fact.claims.find(c=>c.must_keep)!.text,caption:'概念插畫，非事件照片',credit:'DayDay · NVIDIA '+result.model,rendition:{webPath:`/api/editorial/assets/${id}/web`,printPath:`/api/editorial/assets/${id}/print`,width:web.info.width,height:web.info.height},focalPoint:{x:50,y:50}};
 await store.create<WebAsset>(webAssetKey(id),{version:1,jobId:job.id,id,webPath,printPath,image,prompt,model:result.model,createdAt:new Date().toISOString()});return image;
}
