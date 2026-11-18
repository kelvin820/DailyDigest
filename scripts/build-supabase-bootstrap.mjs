import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const project=new URL(process.argv[2]||process.env.NEXT_PUBLIC_SUPABASE_URL||'');
if(project.protocol!=='https:'||!(/^[a-z0-9]{20}\.supabase\.co$/).test(project.hostname)||project.username||project.password||project.search||project.hash||project.pathname!=='/')throw Error('SUPABASE_PROJECT_ORIGIN_REQUIRED');
const files=(await readdir('supabase/migrations')).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
if(!files.length)throw Error('MIGRATIONS_REQUIRED');
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const parts=[`-- DayDay: reviewed migrations for a NEW, empty Supabase project.
-- Intended project: ${project.origin}
-- Confirm this project in the SQL Editor before running the WHOLE file.
-- This script does not authenticate a project or change Auth signup settings.
-- No example issues, memberships, or publication records are inserted.
-- One transaction: any failed migration rolls back this initialization.
-- Refuses a repeated or non-empty installation; do not remove these guards.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
set local search_path=public,extensions,pg_catalog;
do $dayday_guard$
begin
  perform pg_advisory_xact_lock(hashtext('dayday:schema-bootstrap'));
  if to_regclass('auth.users') is null or to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null then
    raise exception 'DAYDAY_REQUIRES_SUPABASE_MANAGED_SCHEMAS';
  end if;
  if to_regnamespace('dayday_private') is not null then
    raise exception 'DAYDAY_ALREADY_INITIALIZED: stop and inspect migration history';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')) then
    raise exception 'DAYDAY_REQUIRES_EMPTY_PUBLIC_SCHEMA: existing tables were not changed';
  end if;
  if exists(select 1 from storage.buckets) then
    raise exception 'DAYDAY_REQUIRES_EMPTY_STORAGE: existing buckets were not changed';
  end if;
end $dayday_guard$;
create schema dayday_private;
revoke all on schema dayday_private from public,anon,authenticated,service_role;
create table dayday_private.schema_migrations(
  version text primary key,name text not null,sha256 text not null,
  applied_at timestamptz not null default now()
);
alter table dayday_private.schema_migrations enable row level security;
revoke all on dayday_private.schema_migrations from public,anon,authenticated,service_role;
`];
for(const file of files){
  const content=await readFile('supabase/migrations/'+file,'utf8');
  const [version,...words]=file.replace(/\.sql$/,'').split('_');
  const sha=createHash('sha256').update(content).digest('hex');
  parts.push(`\n-- BEGIN ${file}\n-- SHA-256: ${sha}\n${content.trimEnd()}\n`+
    `insert into dayday_private.schema_migrations(version,name,sha256) values(${literal(version)},${literal(words.join('_'))},${literal(sha)});\n-- END ${file}\n`);
}
parts.push(`
do $dayday_verify$
declare settings jsonb;
begin
  if (select count(*) from dayday_private.schema_migrations)<>${files.length} then
    raise exception 'DAYDAY_MIGRATION_COUNT_MISMATCH';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity) then
    raise exception 'DAYDAY_ROW_SECURITY_REQUIRED';
  end if;
  if (select count(*) from storage.buckets where id in ('issue-files','evidence','images') and not public)<>3 then
    raise exception 'DAYDAY_PRIVATE_BUCKETS_REQUIRED';
  end if;
  select value into settings from public.app_settings where key='publishing';
  if settings->>'mode' is distinct from 'review' or settings->>'live_enabled' is distinct from 'false' then
    raise exception 'DAYDAY_LIVE_PUBLICATION_MUST_REMAIN_DISABLED';
  end if;
end $dayday_verify$;
commit;
select jsonb_build_object(
  'status','schema_initialized',
  'migration_count',(select count(*) from dayday_private.schema_migrations),
  'issue_count',(select count(*) from public.issues),
  'member_count',(select count(*) from public.site_members),
  'publishing',(select value from public.app_settings where key='publishing')
) as dayday_setup_result;
`);
const output=resolve(process.argv[3]||'output/DayDay_Supabase_Setup.sql');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,parts.join('\n'));
console.log(JSON.stringify({project:project.origin,migrations:files.length,path:output,applied:false}));
