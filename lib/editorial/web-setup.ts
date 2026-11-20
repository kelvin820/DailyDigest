import {Client} from 'pg';
import {databaseConfiguration} from './web-store';
import {buildSupabaseBootstrap} from '../db/bootstrap.mjs';

export function setupConnection(env:Record<string,string|undefined>=process.env){
 const config=databaseConfiguration(env);
 if(config.source!=='marketplace'||!config.url||!config.key)throw Error('SETUP_MARKETPLACE_REQUIRED');
 const project=new URL(config.url);
 if(project.protocol!=='https:'||!/^[a-z0-9]{20}\.supabase\.co$/.test(project.hostname)||project.pathname!=='/'||project.username||project.password||project.search||project.hash)throw Error('SETUP_INVALID_PROJECT');
 const prefixed=!!(env.DAILY_DIGEST_SUPABASE_URL?.trim()||env.DAILY_DIGEST_SUPABASE_SECRET_KEY?.trim());
 const ref=project.hostname.split('.')[0],value=prefixed?
  env.DAILY_DIGEST_POSTGRES_URL||env.DAILY_DIGEST_POSTGRES_URL_NON_POOLING:
  env.POSTGRES_URL||env.POSTGRES_URL_NON_POOLING||env.DATABASE_URL;
 if(!value||value==='[SENSITIVE]')throw Error('SETUP_POSTGRES_NOT_CONFIGURED');
 const database=new URL(value);
 if(!['postgres:','postgresql:'].includes(database.protocol)||!database.password)throw Error('SETUP_POSTGRES_NOT_CONFIGURED');
 const direct=database.hostname===`db.${ref}.supabase.co`;
 const pooled=/\.pooler\.supabase\.com$/.test(database.hostname)&&decodeURIComponent(database.username)===`postgres.${ref}`;
 if(!direct&&!pooled)throw Error('SETUP_PROJECT_MISMATCH');
 // Always use authenticated TLS. Do not let URI options disable verification.
 for(const option of ['sslmode','sslrootcert','sslcert','sslkey','ssl'])database.searchParams.delete(option);
 return {projectUrl:project.origin,connectionString:database.href,ssl:{rejectUnauthorized:true,...(env.SUPABASE_DB_CA?{ca:env.SUPABASE_DB_CA.replaceAll('\\n','\n')}:{})}};
}
type QueryClient=Pick<Client,'query'>;
export async function inspectDatabase(client:QueryClient){
 const {rows}=await client.query(`select
 (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')) as public_tables,
 (select count(*)::int from storage.buckets) as buckets,
 to_regclass('dayday_private.schema_migrations') is not null as initialized,
 to_regclass('public.app_settings') is not null as editor_table,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.app_settings')),false) as editor_rls`);
 const row=rows[0];return {empty:row.public_tables===0&&row.buckets===0&&!row.initialized,initialized:!!row.initialized,editorTable:!!row.editor_table,editorRls:!!row.editor_rls,publicTables:Number(row.public_tables),buckets:Number(row.buckets)};
}
export async function initializeDatabase(client:QueryClient,projectUrl:string,confirmedProjectUrl:string){
 if(projectUrl!==confirmedProjectUrl)throw Error('SETUP_PROJECT_MISMATCH');
 const before=await inspectDatabase(client);if(!before.empty)throw Error('SETUP_DATABASE_NOT_EMPTY');
 const script=await buildSupabaseBootstrap(projectUrl);
 // The generated SQL repeats the empty-project guards inside one transaction.
 // Failure rolls back all migrations; existing data is never reset.
 try{await client.query(script.sql);}catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';console.error('editorial_database_setup_failed',{code:/^[A-Z0-9]{5}$/.test(code)?code:'UNKNOWN'});await client.query('rollback').catch(()=>{});throw Error('SETUP_INITIALIZATION_FAILED');}
 const after=await inspectDatabase(client);if(!after.initialized||!after.editorRls)throw Error('SETUP_VERIFICATION_FAILED');
 return {projectUrl,migrations:script.migrations,...after};
}
export async function withSetupDatabase<T>(run:(client:Client,projectUrl:string)=>Promise<T>){
 const config=setupConnection(),client=new Client({connectionString:config.connectionString,ssl:config.ssl,connectionTimeoutMillis:15000,statement_timeout:120000,query_timeout:125000});
 try{await client.connect();return await run(client,config.projectUrl);}catch(error){
  const code=error instanceof Error&&'code'in error?String(error.code):'';
  if(/CERT|TLS|SELF_SIGNED/.test(code))throw Error('SETUP_TLS_FAILED');
  if(['ENOTFOUND','ENETUNREACH','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN'].includes(code))throw Error('SETUP_DATABASE_UNREACHABLE');
  if(code==='28P01')throw Error('SETUP_DATABASE_AUTH_FAILED');
  if(error instanceof Error&&/^SETUP_[A-Z_]+$/.test(error.message))throw error;
  throw Error('SETUP_CONNECTION_FAILED');
 }finally{await client.end().catch(()=>{});}
}
