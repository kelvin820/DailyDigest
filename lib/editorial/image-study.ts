import {hash} from '../pipeline/state.mjs';
import {audienceConceptPrompt} from '../media/audience';
import {compactIllustrationSheetPrompt,cropIllustrationSheet} from '../media/illustration-sheet';
import {generateNvidiaImage,type NvidiaImageModel} from '../providers/image';
import type {Edition} from '../../config/editions';
import {jobKey} from './web-jobs';
import {WEB_PREFIX,serviceDatabase,type DocumentStore} from './web-store';
import type {WebJob} from './web-types';
import {reserveImageSlot} from './image-budget';
import {authorizedBackfill} from './backfill';
import {taipeiDate} from '../content/metrics';
import {imageFailureCode} from './image-retry';
export async function runImageStudy(store:DocumentStore,input:{id:string;probeId:string;storyId:string;edition:Edition;mode:'single'|'sheet';model:NvidiaImageModel}){
 const documentKey=WEB_PREFIX+'image-study:'+input.probeId,prior=await store.get<{inputHash:string}>(documentKey),inputHash=hash(input);if(prior){if(prior.inputHash!==inputHash)throw Error('IDEMPOTENCY_CONFLICT');return prior;}
 const job=await store.get<WebJob>(jobKey(input.id)),fact=job?.facts.find(f=>f.story_id===input.storyId);if(!job||!fact)throw Error('NOT_FOUND');
 const grant=job.campaignId?await authorizedBackfill(store,job.campaignId,job.issueDate):null;
 const concept='Create a wide landscape conceptual editorial illustration for this factual story. Illustrate its central subject simply, without adding factual claims. '+fact.claims.filter(c=>c.must_keep).map(c=>c.text).join(' '),prompt=input.mode==='sheet'?compactIllustrationSheetPrompt(fact.claims.find(c=>c.must_keep)!.text):audienceConceptPrompt(concept,input.edition);
 const base={version:1,inputHash,...input,prompt,status:'started',createdAt:new Date().toISOString()};
 await reserveImageSlot(store,WEB_PREFIX+'image-budget:'+(job.campaignId?'backfill:'+job.campaignId:taipeiDate()),job.id+':study:'+input.probeId,grant?.limits.images??(Number(process.env.MAX_IMAGE_CALLS_PER_DAY)||32),!!grant);
 if(!await store.create(documentKey,base))throw Error('JOB_CONFLICT');
 let diagnostic:unknown=null;
 try{
  const result=await generateNvidiaImage(process.env.NVIDIA_IMAGE_API_KEY?.trim()||process.env.LLM_API_KEY?.trim()||'',{model:input.model,prompt,timeoutMs:90000,onDiagnostic:value=>{diagnostic=value;}}),bucket=serviceDatabase().storage.from('issue-files');
  const paths:{key:string;path:string}[]=[],images=[{key:'original',bytes:result.bytes},...(input.mode==='sheet'?await cropIllustrationSheet(result.bytes):[])];
  for(const image of images){const path='image-studies/'+input.probeId+'/'+image.key+(image.key==='original'&&result.mime==='image/jpeg'?'.jpg':'.png'),{error}=await bucket.upload(path,image.bytes,{contentType:image.key==='original'?result.mime:'image/png',upsert:true});if(error)throw Error('IMAGE_STORAGE_FAILED');paths.push({key:image.key,path});}
  const study={...base,version:2,status:'generated',publicationEligible:false,reviewStatus:'needs_visual_review',diagnostic,paths};if(!await store.compare(documentKey,1,study))throw Error('JOB_CONFLICT');return study;
 }catch(error){const study={...base,version:2,status:'failed',error:imageFailureCode(error),diagnostic};await store.compare(documentKey,1,study);return study;}
}
