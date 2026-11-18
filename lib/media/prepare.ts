import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {safeFetch} from '../content/safe-fetch.mjs';

export const assetRecordSchema=z.object({
  kind:z.enum(['event_photo','file_photo','illustration','generated_illustration']),
  alt:z.string().min(1),caption:z.string().min(1),author:z.string().min(1),publisher:z.string().min(1),
  credit:z.string().min(1),licenseCode:z.enum(['CC0','PUBLIC_DOMAIN','CC_BY','GENERATED']),
  licenseUrl:z.url().startsWith('https://').optional(),sourcePage:z.url().startsWith('https://').optional(),
  originalUrl:z.url().startsWith('https://').optional(),rightsConfirmed:z.literal(true),
  photographedAt:z.iso.date().nullable(),
  generation:z.object({provider:z.string().min(1),model:z.string().min(1),prompt:z.string().min(1),
    generatedAt:z.iso.datetime(),seed:z.number().int().nonnegative().optional()}).strict().optional(),
}).strict().superRefine((a,c)=>{
  if(a.kind==='generated_illustration'){
    if(a.licenseCode!=='GENERATED'||!a.generation)c.addIssue({code:'custom',message:'GENERATION_PROVENANCE_REQUIRED'});
  }else if(a.licenseCode==='GENERATED'||!a.licenseUrl||!a.sourcePage||!a.originalUrl){
    c.addIssue({code:'custom',message:'PHOTO_RIGHTS_EVIDENCE_REQUIRED'});
  }
});
export type AssetRecord=z.infer<typeof assetRecordSchema>;
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

export async function prepareAsset(bytes:Buffer,mime:string,record:AssetRecord,directory:string){
  const metadata=assetRecordSchema.parse(record);
  if(!bytes.length||bytes.length>10_000_000)throw Error('IMAGE_SIZE_LIMIT');
  const declared=mime.split(';')[0].trim().toLowerCase();
  const formats:Record<string,string>={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};
  if(!formats[declared])throw Error('IMAGE_MIME_REJECTED');
  // Validate magic bytes through the raster decoder, reject SVG, animation and decompression bombs.
  const input=sharp(bytes,{limitInputPixels:40_000_000,animated:false,failOn:'warning'});
  const info=await input.metadata();
  if(info.format!==formats[declared]||!info.width||!info.height||info.width<240||info.height<160||
    (info.pages??1)>1)throw Error('IMAGE_RASTER_INVALID');
  const quality=await input.clone().stats();
  if(quality.channels.slice(0,3).every(c=>c.stdev<2)||
    (info.hasAlpha&&quality.channels.at(-1)!.max<16))throw Error('IMAGE_EMPTY_OR_FLAT');
  const id=digest(bytes),webPath=`assets/${id}-web.webp`,printPath=`assets/${id}-print.jpg`;
  await mkdir(resolve(directory,'assets'),{recursive:true});
  // Rotation honors EXIF; default re-encoding strips location/other EXIF metadata.
  const web=await input.clone().rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true})
    .webp({quality:84}).toBuffer({resolveWithObject:true});
  const print=await input.clone().rotate().resize({width:3000,height:3000,fit:'inside',withoutEnlargement:true})
    .flatten({background:'#fff'}).jpeg({quality:92}).toBuffer({resolveWithObject:true});
  await writeFile(resolve(directory,webPath),web.data);
  await writeFile(resolve(directory,printPath),print.data);
  const manifest={...metadata,assetId:id,sourceSha256:id,sourceBytes:bytes.length,sourceMime:declared,
    web:{path:webPath,width:web.info.width,height:web.info.height,sha256:digest(web.data)},
    print:{path:printPath,width:print.info.width,height:print.info.height,sha256:digest(print.data)}};
  await writeFile(resolve(directory,'assets',id+'.json'),JSON.stringify(manifest,null,2));
  return {manifest,image:{assetId:id,alt:metadata.alt,caption:metadata.caption,kind:metadata.kind,
    credit:metadata.credit,licenseUrl:metadata.licenseUrl,sourcePage:metadata.sourcePage,
    rendition:{webPath,printPath,width:web.info.width,height:web.info.height},focalPoint:{x:50,y:50}}};
}

export async function downloadAsset(record:AssetRecord,approvedDomains:string[],directory:string){
  const metadata=assetRecordSchema.parse(record);
  if(!metadata.originalUrl)throw Error('IMAGE_SOURCE_REQUIRED');
  const result=await safeFetch(metadata.originalUrl,approvedDomains,{maxBytes:10_000_000,timeoutMs:30_000});
  return prepareAsset(result.bytes,result.mime,metadata,directory);
}
