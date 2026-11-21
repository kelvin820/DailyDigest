import {sleep} from 'workflow';
import {advanceEditionStep,loadDailyStep,prepareDailyStep,recordDailyFailureStep,publicationStep,publishDailyStep,loadBackfillStep,prepareBackfillStep,reportBackfillStep,finishBackfillStep} from './steps';

export async function generateEditionWorkflow(id:string){
 'use workflow';
 let pdfRetries=0,formatRetries=0;
 for(let i=0;i<100;i++){
  const state=await advanceEditionStep(id);
  if(state.status==='needs_review')return state;
  if(state.status==='needs_attention'){
   if(state.error?.startsWith('PDF_')&&pdfRetries++<2){await sleep('10s');continue;}
   if(state.error==='MODEL_SCHEMA_INVALID'&&formatRetries++<1){await sleep('10s');continue;}
   return state;
  }
  if(state.waitUntil)await sleep(new Date(state.waitUntil));else await sleep('1s');
 }
 return {status:'needs_attention',error:'WORKFLOW_STEP_LIMIT'};
}
export async function dailyEditionWorkflow(date:string){
 'use workflow';
 try{
  const plan=await loadDailyStep(date);if(!plan.enabled)return {status:'disabled'};
  await sleep(new Date(plan.prepareAt));
  const selected=await prepareDailyStep(date);if(selected.skip)return {status:'already_released_or_disabled'};
  const state=await generateEditionWorkflow(selected.id);
  if(state.status!=='needs_review'){await recordDailyFailureStep(date,state.error||'GENERATION_INCOMPLETE');return state;}
  // Render the final, non-preview PDFs before the publication deadline.
  const publication=await publicationStep(selected.id);
  await sleep(new Date(plan.publishAt));
  await publishDailyStep(selected.id,publication);return {status:'published',id:selected.id};
 }catch(error){await recordDailyFailureStep(date,error instanceof Error?error.message:'DAILY_PUBLICATION_FAILED');throw error;}
}
export async function backfillWeekWorkflow(campaignId:string){
 'use workflow';
 const dates=await loadBackfillStep(campaignId);
 // One issue at a time keeps shared provider rate limits and spending bounded.
 for(const date of dates){
  try{
   const id=await prepareBackfillStep(campaignId,date),state=await generateEditionWorkflow(id);
   if(state.status!=='needs_review'){await reportBackfillStep(campaignId,date,state.error||'GENERATION_INCOMPLETE');continue;}
   const publication=await publicationStep(id);await publishDailyStep(id,publication);await reportBackfillStep(campaignId,date);
  }catch(e){await reportBackfillStep(campaignId,date,e instanceof Error?e.message:'BACKFILL_FAILED');}
 }
 return (await finishBackfillStep(campaignId)).status;
}
