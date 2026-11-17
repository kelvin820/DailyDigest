import { z } from 'zod';
import { membership } from '../../../../../lib/auth/server';
import { json,apiError } from '../../../../../lib/api';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {db}=await membership(true),id=z.uuid().parse((await params).id);
    const {data:job,error}=await db.from('generation_jobs')
      .select('id,issue_date,status,cost_status,budget,updated_at,lease_expires_at').eq('id',id).single();
    if(error)return json({error:'NOT_FOUND'},404);
    const [steps,daily,requests]=await Promise.all([
      db.from('generation_steps').select('stage,story_id,edition,status,error,attempts,usage,model,prompt_version,started_at,finished_at,output_ref').eq('job_id',id),
      db.from('daily_usage').select('calls,tokens,spent_usd,reserved_usd,usd_limit,input_rate,output_rate,max_calls,max_tokens').eq('issue_date',job.issue_date).single(),
      db.from('model_reservations').select('id,status,usage,created_at,settled_at').eq('job_id',id),
    ]);
    if(steps.error||daily.error||requests.error)return json({error:'JOB_DETAILS_UNAVAILABLE'},503);
    return json({job,steps:steps.data,dailyUsage:daily.data,requests:requests.data});
  }catch(error){return apiError(error)}
}
