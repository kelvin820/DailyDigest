import {json} from '../../../../lib/api';
import {databaseConfigured,documentStore,WEB_PREFIX} from '../../../../lib/editorial/web-store';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 let databaseConnected=false,databaseError:string|null=null;if(databaseConfigured())try{await documentStore().get(WEB_PREFIX+'health');databaseConnected=true;}catch(e){const code=e instanceof Error?e.message:'';databaseError=/^DATABASE_[A-Z_]+$/.test(code)?code:'DATABASE_READ_FAILED';}
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()||'',databaseKeyType=key.startsWith('sb_secret_')?'secret':/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)?'legacy-jwt':'unrecognized';
 return json({llmConfigured:!!process.env.LLM_API_KEY?.trim(),provider:'nvidia',model:process.env.WRITER_MODEL||'nvidia/nemotron-3-ultra-550b-a55b',storageConfigured:databaseConfigured(),databaseConnected,databaseError,databaseKeyType,editorConfigured:(process.env.EDITOR_ACTION_SECRET?.trim().length||0)>=24,generationBackend:'vercel'});
}
