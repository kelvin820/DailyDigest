import {json} from '../../../../lib/api';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 return json({llmConfigured:!!process.env.LLM_API_KEY?.trim(),provider:'nvidia',model:process.env.WRITER_MODEL||'nvidia/nemotron-3-ultra-550b-a55b',storageConfigured:!!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),editorConfigured:!!process.env.EDITOR_ACTION_SECRET?.trim()});
}
