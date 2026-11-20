import {requireEditor} from '../../../../../../lib/editorial/web-auth';
import {documentStore,serviceDatabase} from '../../../../../../lib/editorial/web-store';
import {webAssetKey,type WebAsset} from '../../../../../../lib/editorial/web-images';
import {jobKey,releaseKey} from '../../../../../../lib/editorial/web-jobs';
import type {WebJob,WebRelease} from '../../../../../../lib/editorial/web-types';
import {webError} from '../../../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string;kind:string}>}){try{
 const {id,kind}=await params;if(!['web','print'].includes(kind))throw Error('NOT_FOUND');
 const store=documentStore(),asset=await store.get<WebAsset>(webAssetKey(id));if(!asset)throw Error('NOT_FOUND');
 const job=await store.get<WebJob>(jobKey(asset.jobId)),release=job?await store.get<WebRelease>(releaseKey(job.issueDate)):null;
 const published=release?.jobId===asset.jobId&&release.editions.some(i=>i.articles.some(a=>a.image.assetId===id));if(!published)await requireEditor();
 const {data,error}=await serviceDatabase().storage.from('issue-files').download(kind==='web'?asset.webPath:asset.printPath);if(error||!data)throw Error('IMAGE_STORAGE_FAILED');
 return new Response(await data.arrayBuffer(),{headers:{'Content-Type':kind==='web'?'image/webp':'image/jpeg','Cache-Control':published?'public, max-age=3600':'private, no-store'}});
}catch(e){return webError(e);}}
