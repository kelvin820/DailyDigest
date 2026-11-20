import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Client} from 'pg';
import {setupConnection,initializeDatabase} from '../lib/editorial/web-setup';
const ref='abcdefghijklmnopqrst',project='https://'+ref+'.supabase.co';
const env={SUPABASE_URL:project,SUPABASE_SECRET_KEY:'sb_secret_synthetic',POSTGRES_URL:`postgresql://postgres.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=disable`};

test('setup requires the Marketplace pair and a PostgreSQL connection for that exact project with verified TLS',()=>{
 const c=setupConnection(env);assert.equal(c.projectUrl,project);assert.equal(c.ssl.rejectUnauthorized,true);assert.equal(new URL(c.connectionString).searchParams.has('sslmode'),false);
 assert.throws(()=>setupConnection({...env,POSTGRES_URL:env.POSTGRES_URL.replace('postgres.'+ref,'postgres.zyxwvutsrqponmlkjihg')}),/SETUP_PROJECT_MISMATCH/);
 assert.throws(()=>setupConnection({...env,SUPABASE_SECRET_KEY:undefined}),/SETUP_MARKETPLACE_REQUIRED/);
 assert.throws(()=>setupConnection({...env,SUPABASE_URL:'https://127.0.0.1'}),/SETUP_INVALID_PROJECT/);
 assert.throws(()=>setupConnection({...env,POSTGRES_URL:'[SENSITIVE]'}),/SETUP_POSTGRES_NOT_CONFIGURED/);
 const prefixed={...env,DAILY_DIGEST_SUPABASE_URL:project,DAILY_DIGEST_SUPABASE_SECRET_KEY:'sb_secret_new',DAILY_DIGEST_POSTGRES_URL:env.POSTGRES_URL,POSTGRES_URL:'postgresql://postgres:old@db.zyxwvutsrqponmlkjihg.supabase.co/postgres'};
 assert.equal(setupConnection(prefixed).projectUrl,project);
 assert.throws(()=>setupConnection({...prefixed,DAILY_DIGEST_POSTGRES_URL:undefined}),/SETUP_POSTGRES_NOT_CONFIGURED/);
});

test('setup refuses nonempty databases and mismatched confirmations before executing any migrations',async()=>{
 let calls=0;const client={query:async()=>{calls++;return {rows:[{public_tables:1,buckets:0,initialized:false,editor_table:false,editor_rls:false}]};}} as unknown as Pick<Client,'query'>;
 await assert.rejects(()=>initializeDatabase(client,project,'https://wrong.supabase.co'),/SETUP_PROJECT_MISMATCH/);assert.equal(calls,0);
 await assert.rejects(()=>initializeDatabase(client,project,project),/SETUP_DATABASE_NOT_EMPTY/);assert.equal(calls,1);
});

test('fresh setup uses the guarded fifteen-migration transaction and checks the result; failures roll back',async()=>{
 let initialized=false,script='';
 const client={query:async(text:string)=>{
  if(text.startsWith('select'))return {rows:[{public_tables:initialized?15:0,buckets:initialized?3:0,initialized,editor_table:initialized,editor_rls:initialized}]};
  script=text;initialized=true;return {};
 }} as unknown as Pick<Client,'query'>;
 const result=await initializeDatabase(client,project,project);assert.equal(result.migrations,15);assert.equal(result.initialized,true);
 assert.match(script,/DAYDAY_REQUIRES_EMPTY_PUBLIC_SCHEMA/);assert.match(script,/grant select, insert, update on table public.app_settings to service_role/);assert.match(script,/DAYDAY_PRIVATE_BUCKETS_REQUIRED/);
 assert.doesNotMatch(script,/drop\s+(?:table|schema)|truncate\s+table/i);
 let rollback=false;const failed={query:async(text:string)=>{if(text==='rollback'){rollback=true;return {};}if(text.startsWith('select'))return {rows:[{public_tables:0,buckets:0,initialized:false}]};throw Error('synthetic');}} as unknown as Pick<Client,'query'>;
 await assert.rejects(()=>initializeDatabase(failed,project,project),/SETUP_INITIALIZATION_FAILED/);assert.equal(rollback,true);
});
