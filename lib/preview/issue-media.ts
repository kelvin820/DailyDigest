import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {photoRecord} from '../../config/image-preview.mjs';
import {downloadAsset,prepareAsset,type AssetRecord} from '../media/prepare';
import {selectIssueImages,shareSelectedImages,type ImageCandidate} from '../media/select';
import {articleSchema,type EditionView} from '../schemas/edition';

// A preview reuses the already tested park concept. No new image API request is made.
export async function attachPreviewImages(issues:EditionView[],directory:string,cachedImageDirectory?:string){
  const prepared=new Map<string,Awaited<ReturnType<typeof prepareAsset>>>();
  const candidates:ImageCandidate[]=[{id:'park-photo',relevant:true,record:photoRecord}];
  let cachedImageError:string|null=null;
  if(cachedImageDirectory)try{
    const root=resolve(cachedImageDirectory),report=JSON.parse(await readFile(resolve(root,'report.json'),'utf8'));
    if(report.status!=='generated'||report.imagesGenerated!==1||report.promptCase!=='park')throw Error('INVALID_CACHED_IMAGE');
    const image=articleSchema.shape.image.parse(JSON.parse(await readFile(resolve(root,'image.json'),'utf8')));
    if(!image.rendition||image.kind!=='generated_illustration')throw Error('INVALID_CACHED_IMAGE');
    const manifest=JSON.parse(await readFile(resolve(root,'assets',image.assetId+'.json'),'utf8'));
    if(manifest.generation?.provider!=='nvidia'||manifest.generation.model!==report.model)throw Error('INVALID_CACHED_IMAGE');
    const bytes=await readFile(resolve(root,image.rendition.printPath));
    if(createHash('sha256').update(bytes).digest('hex')!==manifest.print.sha256)throw Error('INVALID_CACHED_IMAGE');
    const record=Object.fromEntries(Object.entries(manifest).filter(([key])=>
      ['kind','alt','caption','author','publisher','credit','licenseCode','licenseUrl','sourcePage','originalUrl',
        'rightsConfirmed','photographedAt','generation'].includes(key))) as AssetRecord;
    prepared.set('park-concept',await prepareAsset(bytes,'image/jpeg',record,directory));
    candidates.push({id:'park-concept',relevant:true,record});
  }catch{cachedImageError='CACHED_IMAGE_NOT_AVAILABLE_OR_INVALID';}
  const selected=await selectIssueImages({stories:issues[0].articles.map((article,index)=>({
    storyId:article.storyId,category:article.category,illustrationUseful:true,conceptSafe:true,
    candidates:index===0?candidates:[],
  })),loadCandidate:async(candidate,record)=>{
    if(candidate.id==='park-photo'){
      const result=await downloadAsset(record,['upload.wikimedia.org'],directory);prepared.set(candidate.id,result);return result.image;
    }
    const cached=prepared.get(candidate.id);if(!cached)throw Error('CACHED_IMAGE_MISSING');return cached.image;
  }});
  const editions=shareSelectedImages(issues,selected);
  const media={newImageApiCalls:0,reusedImageAsset:prepared.has('park-concept'),cachedImageError,
    selections:selected,photoSearchScope:'curated-rights-reviewed-demo-candidates',
    // Other fictional scenarios have no reviewed candidate in this controlled test.
    undiscoveredNewsImages:false,automaticImageGenerationEnabled:false};
  await writeFile(resolve(directory,'media-report.json'),JSON.stringify(media,null,2));
  return{editions,media};
}
