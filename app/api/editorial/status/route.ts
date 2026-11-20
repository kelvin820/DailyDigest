import {json} from '../../../../lib/api';
import {databaseConfigured,documentStore,WEB_PREFIX} from '../../../../lib/editorial/web-store';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 let databaseConnected=false;if(databaseConfigured())try{await documentStore().get(WEB_PREFIX+'health');databaseConnected=true;}catch{}
 return json({llmConfigured:!!process.env.LLM_API_KEY?.trim(),provider:'nvidia',model:process.env.WRITER_MODEL||'nvidia/nemotron-3-ultra-550b-a55b',storageConfigured:databaseConfigured(),databaseConnected,editorConfigured:(process.env.EDITOR_ACTION_SECRET?.trim().length||0)>=24,generationBackend:'vercel'});
}
