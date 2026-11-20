import {z} from 'zod';
import {editionOf} from '../../../../config/editions';
import {requireEditor} from '../../../../lib/editorial/web-auth';
import {documentStore,serviceDatabase} from '../../../../lib/editorial/web-store';
import {jobKey,releaseKey} from '../../../../lib/editorial/web-jobs';
import type {WebJob,WebRelease} from '../../../../lib/editorial/web-types';
import {webError} from '../../../../lib/editorial/web-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const url=new URL(req.url),id=z.uuid().parse(url.searchParams.get('id')),store=documentStore();
 const job=await store.get<WebJob>(jobKey(id));if(!job)throw Error('NOT_FOUND');
 const release=await store.get<WebRelease>(releaseKey(job.issueDate));if(release?.jobId!==id)await requireEditor();
 const edition=editionOf(url.searchParams.get('edition')),mode=url.searchParams.get('mode')==='ink'?'ink':'color';
 const file=(release?.jobId===id?release.pdfs:job.pdfs).find(f=>f.edition===edition&&f.mode===mode);if(!file)throw Error('NOT_FOUND');
 const {data,error}=await serviceDatabase().storage.from('issue-files').createSignedUrl(file.path,60);if(error||!data)throw Error('PDF_STORAGE_FAILED');
 return new Response(null,{status:303,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store'}});
}catch(e){return webError(e);}}
