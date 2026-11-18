import {DAILY_STORY_COUNT} from '../config/issue-settings.mjs';
import { readFile } from 'node:fs/promises';
function stop(error,details){console.error(JSON.stringify({error,...details}));process.exit(1)}
// A deployment operator sets this only after actual source/model/Storage E2E acceptance.
if(process.env.DD_PIPELINE_ACCEPTED!=='true')stop('LIVE_PIPELINE_NOT_ACCEPTED',{instruction:'Complete live acceptance; see docs/STATUS.md.'});
if(process.env.LIVE_GENERATION_ENABLED!=='true'||process.env.DEMO_MODE!=='false')stop('LIVE_FLAGS_NOT_CONFIGURED');
const required=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','APP_URL','LLM_API_KEY'];
const missing=required.filter(key=>!process.env[key]);if(missing.length)stop('MISSING_SETTINGS',{missing});
if(process.env.LLM_PROVIDER!=='nvidia')stop('PROVIDER_NOT_CONFIGURED');
if(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF_NAME!==process.env.GITHUB_DEFAULT_BRANCH)stop('DEFAULT_BRANCH_REQUIRED');
if(process.env.APPROVED_FACTS_FILE){
  const facts=JSON.parse(await readFile(process.env.APPROVED_FACTS_FILE,'utf8'));
  if(!Array.isArray(facts)||facts.length!==DAILY_STORY_COUNT||facts.some(f=>f.is_demo!==false))stop('LIVE_FACTS_REQUIRED');
}else{
  const sources=JSON.parse(await readFile('config/sources.json','utf8'));
  if(!sources.some(s=>s.status==='enabled'&&s.discovery_enabled&&s.fetch_enabled&&s.reviewed_at&&
    s.rewrite_policy==='allowed'&&s.evidence_policy==='permanent_excerpt'))stop('SOURCE_POLICIES_NOT_READY');
}
console.log('Preflight configuration checks passed; no source fetching, model calls or publication performed.');
