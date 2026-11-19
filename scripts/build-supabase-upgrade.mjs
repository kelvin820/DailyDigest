import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function buildSupabaseUpgrade(projectUrl){
const project=new URL(projectUrl);
if(project.protocol!=='https:'||!(/^[a-z0-9]{20}\.supabase\.co$/).test(project.hostname)||project.pathname!=='/'||project.search||project.hash||project.username||project.password)throw Error('SUPABASE_PROJECT_ORIGIN_REQUIRED');
const files=(await readdir('supabase/migrations')).filter(f=>/^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
if(files.length!==15)throw Error('THIS_UPGRADE_REQUIRES_EXACTLY_FIFTEEN_SOURCE_MIGRATIONS');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const history=await Promise.all(files.slice(0,14).map(async f=>({version:f.split('_')[0],sha:createHash('sha256').update(await readFile('supabase/migrations/'+f)).digest('hex')})));
const file=files[14],migration=await readFile('supabase/migrations/'+file,'utf8');
const [version,...name]=file.replace(/\.sql$/,'').split('_');
const sha=createHash('sha256').update(migration).digest('hex');
const sql=`-- DayDay: upgrade the existing 14-migration SQL-Editor installation to 15.
-- Intended project: ${project.origin}; verify this project in Supabase before execution.
-- Generated offline. This file does not connect to a database or execute itself.
-- Preserves issue data, users, permissions, publishing mode and historical eight-story editions.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
set local search_path=public,extensions,pg_catalog;
do $guard$
declare expected record; publishing jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('dayday:schema-bootstrap'));
 if to_regclass('dayday_private.schema_migrations') is null then raise exception 'DAYDAY_BOOTSTRAP_HISTORY_REQUIRED'; end if;
 if (select count(*) from dayday_private.schema_migrations)<>14 then raise exception 'DAYDAY_UPGRADE_REQUIRES_14_MIGRATIONS'; end if;
 for expected in select * from (values ${history.map(h=>'('+literal(h.version)+','+literal(h.sha)+')').join(',\n')}) v(version,sha) loop
  if (select sha256 from dayday_private.schema_migrations where version=expected.version) is distinct from expected.sha then raise exception 'DAYDAY_MIGRATION_HISTORY_MISMATCH'; end if;
 end loop;
 select value into publishing from public.app_settings where key='publishing';
 if publishing->>'mode' is distinct from 'review' or publishing->>'live_enabled' is distinct from 'false' then raise exception 'DAYDAY_REVIEW_MODE_REQUIRED'; end if;
 if exists(select 1 from public.generation_jobs where lease_expires_at>now()) then raise exception 'DAYDAY_ACTIVE_JOB_MUST_FINISH'; end if;
end $guard$;
${migration}
insert into dayday_private.schema_migrations(version,name,sha256) values(${literal(version)},${literal(name.join('_'))},${literal(sha)});
commit;
select jsonb_build_object('status','schema_upgraded','migration_count',(select count(*) from dayday_private.schema_migrations),
 'publishing',(select value from public.app_settings where key='publishing'));
`;
return sql;
}

if(process.argv[1]?.endsWith('build-supabase-upgrade.mjs')){
const sql=await buildSupabaseUpgrade(process.argv[2]||process.env.NEXT_PUBLIC_SUPABASE_URL||'');
await mkdir('output',{recursive:true});await writeFile('output/supabase-upgrade-15.sql',sql);
console.log('Prepared guarded offline SQL: output/supabase-upgrade-15.sql. No cloud database was contacted.');
}
