import {z} from 'zod';
import {membership,demoMode} from '../../../../../../lib/auth/server';
import {checkOrigin,json,apiError} from '../../../../../../lib/api';
const input=z.object({notes:z.string().trim().min(1).max(1000)}).strict();
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{checkOrigin(req);if(demoMode())return json({error:'DEMO_NO_BILLING'},409);
    const {db}=await membership(true),id=z.uuid().parse((await params).id),data=input.parse(await req.json());
    const {data:allowed,error:limitError}=await db.rpc('consume_admin_action',{action_name:'settings'});
    if(limitError||!allowed)return json({error:'RATE_LIMIT'},429);
    const {data:count,error}=await db.rpc('acknowledge_model_usage',{target_job:id,notes:data.notes});
    if(error)return json({error:'USAGE_REVIEW_FAILED_OR_JOB_ACTIVE'},409);
    return json({status:'retry_allowed',acknowledged:count,note:'未知費用與預留額度仍保留；沒有改成零元。'});
  }catch(error){return apiError(error)}
}
