import { execFileSync,spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { makeDemo } from '../lib/content/core.mjs';

// Disposable, network-isolated database; never reads a user's DB URL or secrets.
const name = 'dayday-test-' + randomUUID();
const image = process.env.DD_TEST_POSTGRES_IMAGE || 'postgres:17-alpine';
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', timeout: 120_000, ...options,
});
const sql = (text) => docker(['exec', '-i', name, 'psql', '-U', 'postgres',
  '-h','127.0.0.1','-X', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t'], { input: text });
const concurrentSql = text => new Promise((done,reject) => {
  const child=spawn('docker',['exec','-i',name,'psql','-U','postgres','-h','127.0.0.1','-X','-v','ON_ERROR_STOP=1','-q','-A','-t']);
  let output='',error='';child.stdout.on('data',d=>{output+=d});child.stderr.on('data',d=>{error+=d});
  child.on('error',reject);child.on('close',code=>code===0?done(output.trim()):reject(Error(error)));
  child.stdin.end(text);
});
const checks = [];
await mkdir('output',{recursive:true});
await writeFile('output/db-verification.json',JSON.stringify({status:'running',startedAt:new Date().toISOString(),mode:'local-postgresql-supabase-contract-stubs'}));
try {
  docker(['run', '--name', name, '--network', 'none', '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust', '-d', image]);
  for (let i = 0; ; i++) {
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],{stdio:'pipe'}); break; }
    catch { if (i === 60) throw Error('TEST_DB_STARTUP_TIMEOUT'); await setTimeout(250); }
  }
  sql(await readFile('tests/db/bootstrap.sql', 'utf8'));
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    sql(await readFile('supabase/migrations/' + file, 'utf8'));
    checks.push({ name: file, status: 'passed' });
  }
  const stories = JSON.parse(await readFile('fixtures/stories.json', 'utf8'));
  // Synthetic publication proofs exist only inside this throwaway test database.
  // They are deliberately NOT a live issue, source audit, or production seed.
  for (const edition of ['elementary', 'junior', 'senior']) {
    const payload = { ...makeDemo(stories, edition), isDemo: false };
    sql(`create table if not exists test_payloads(edition text primary key,payload jsonb);
      insert into test_payloads values('${edition}',$payload$${JSON.stringify(payload)}$payload$);`);
  }
  for (const file of (await readdir('tests/db')).filter(f => f.endsWith('.sql') && f !== 'bootstrap.sql').sort()) {
    const output = sql(await readFile('tests/db/' + file, 'utf8'));
    console.log(output.trim());
    checks.push({ name: file, status: 'passed' });
  }
  const owners=Array.from({length:6},()=>randomUUID());
  const attempts=await Promise.all(owners.map(owner=>concurrentSql(`set request.jwt.claim.role='service_role';
    select start_issue_job('2026-11-24','${owner}',array['a','b','c','d','e','f','g','h'],'parallel-test',
      '{"usd":0.001,"inputRate":1,"outputRate":1,"maxCalls":10,"maxTokens":5000}',true,false);`)));
  const jobs=attempts.map((text,index)=>({result:JSON.parse(text),owner:owners[index]}));
  const acquired=jobs.filter(j=>j.result.acquired);assert.equal(acquired.length,1);
  const winner=acquired[0];
  const spending=await Promise.allSettled(Array.from({length:2},()=>concurrentSql(`set request.jwt.claim.role='service_role';
    select reserve_model_call('${winner.result.job_id}','${winner.owner}',300,300);`)));
  assert.equal(spending.filter(s=>s.status==='fulfilled').length,1);
  assert.equal(spending.filter(s=>s.status==='rejected'&&s.reason.message.includes('BUDGET_EXCEEDED')).length,1);
  assert.equal(sql(`select calls from daily_usage where issue_date='2026-11-24';`).trim(),'1');
  checks.push({name:'six concurrent runners, two concurrent budget reservations',status:'passed'});
  await mkdir('output', { recursive: true });
  await writeFile('output/db-verification.json', JSON.stringify({
    status:'passed',verifiedAt:new Date().toISOString(),mode: 'local-postgresql-supabase-contract-stubs', image, checks,
    limitations: ['Hosted Auth/SMTP, PostgREST and signed Storage URLs require live Supabase tests.'],
  }, null, 2));
  console.log('PASS: local PostgreSQL migrations and policy/transaction checks.');
} catch(error) {
  await writeFile('output/db-verification.json',JSON.stringify({status:'failed',mode:'local-postgresql-supabase-contract-stubs',checks},null,2));
  throw error;
} finally {
  docker(['rm', '-f', '-v', name]);
}
