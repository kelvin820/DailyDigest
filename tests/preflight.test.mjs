import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('preflight defaults to no live spending; accepted flag alone cannot enable pending source policies',()=>{
  const base={...process.env,DD_PIPELINE_ACCEPTED:'false'};
  const off=spawnSync(process.execPath,['scripts/preflight.mjs'],{encoding:'utf8',env:base});
  assert.notEqual(off.status,0);assert.match(off.stderr,/LIVE_PIPELINE_NOT_ACCEPTED/);
  const pending=spawnSync(process.execPath,['scripts/preflight.mjs'],{encoding:'utf8',env:{...base,
    DD_PIPELINE_ACCEPTED:'true',LIVE_GENERATION_ENABLED:'true',DEMO_MODE:'false',LLM_PROVIDER:'nvidia',
    NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-not-a-real-key',
    LLM_API_KEY:'fixture-not-a-real-key',APP_URL:'https://dayday.example',APPROVED_FACTS_FILE:'',GITHUB_ACTIONS:'false'}});
  assert.notEqual(pending.status,0);assert.match(pending.stderr,/SOURCE_POLICIES_NOT_READY/);
});
