-- DayDay V1. Apply to a NEW Supabase project. No destructive migrations.
create extension if not exists pgcrypto;
create table public.site_members(user_id uuid primary key references auth.users(id),role text not null check(role in ('reader','admin')),active boolean not null default true);
create function public.is_member() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from site_members where user_id=auth.uid() and active)$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from site_members where user_id=auth.uid() and active and role='admin')$$;
create table sources(id uuid primary key default gen_random_uuid(),name text not null,domain text not null,feeds jsonb not null default '[]',policy jsonb not null,status text not null default 'pending' check(status in ('pending','enabled','disabled')),last_success_at timestamptz);
create table candidates(id uuid primary key default gen_random_uuid(),source_id uuid references sources,canonical_url text unique not null,title text not null,published_at timestamptz,event_at timestamptz,content_hash text,fetch_status text,expires_at timestamptz);
create table story_bundles(id uuid primary key default gen_random_uuid(),event_key text not null,category text not null,fact_payload jsonb not null,source_refs jsonb not null,evidence_hash text not null,sensitivity text not null,created_at timestamptz default now());
create index on story_bundles(event_key,created_at);
create table issues(id uuid primary key default gen_random_uuid(),issue_date date unique not null,timezone text not null default 'Asia/Taipei' check(timezone='Asia/Taipei'),current_revision_id uuid,created_at timestamptz default now());
create table issue_revisions(id uuid primary key default gen_random_uuid(),issue_id uuid not null references issues,revision_no integer not null check(revision_no>0),status text not null default 'draft' check(status in ('draft','needs_review','ready','published','failed')),story_order text[] not null,editorial_notes text,review_status jsonb not null default '{}',gate_report jsonb not null default '{}',approved_by uuid references auth.users,approved_at timestamptz,published_at timestamptz,unique(issue_id,revision_no));
alter table issues add constraint current_revision_fk foreign key(current_revision_id) references issue_revisions;
create table edition_payloads(id uuid primary key default gen_random_uuid(),revision_id uuid not null references issue_revisions,edition text not null check(edition in ('elementary','junior','senior')),payload jsonb not null,content_hash text not null,prompt_version text not null,review_result jsonb not null,unique(revision_id,edition));
create table assets(id uuid primary key default gen_random_uuid(),kind text not null,private_storage_path text not null,hash text not null,mime text,dimensions jsonb,credit text not null,rights jsonb not null,status text not null);
create table issue_files(revision_id uuid not null references issue_revisions,edition text not null check(edition in ('elementary','junior','senior')),print_mode text not null check(print_mode in ('color','ink')),asset_id uuid references assets,storage_path text not null,template_version text not null,content_hash text not null,pages int not null check(pages=2),validated boolean not null default false,primary key(revision_id,edition,print_mode));
create table generation_jobs(id uuid primary key default gen_random_uuid(),issue_date date not null,revision_id uuid not null references issue_revisions,status text not null default 'pending',lease_owner uuid,lease_expires_at timestamptz,cost_status text not null default 'cost_unknown',budget jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),unique(issue_date,revision_id));
create table generation_steps(job_id uuid not null references generation_jobs,stage text not null,story_id text not null default '',edition text not null default '',input_hash text not null,output_ref jsonb,output_hash text,prompt_version text,model text,status text not null,attempts int default 0,error text,usage jsonb,started_at timestamptz,finished_at timestamptz,primary key(job_id,stage,story_id,edition));
create table app_settings(key text primary key,value jsonb not null,updated_by uuid references auth.users,updated_at timestamptz default now());
insert into app_settings values('publishing','{"mode":"review","live_enabled":false,"trial_issues":0}',null,now());

-- Published content cannot be changed in place, even by the runner.
create function protect_published() returns trigger language plpgsql set search_path=public as $$
declare rid uuid;
begin
 if TG_TABLE_NAME='issue_revisions' then
   if OLD.status='published' then raise exception 'Published revisions are immutable'; end if;
 else
   rid=OLD.revision_id;
   if exists(select 1 from issue_revisions where id=rid and status='published') then raise exception 'Published artifacts are immutable'; end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if;return NEW;
end $$;
create trigger immutable_revision before update or delete on issue_revisions for each row execute function protect_published();
create trigger immutable_payload before update or delete on edition_payloads for each row execute function protect_published();
create trigger immutable_file before update or delete on issue_files for each row execute function protect_published();
create function prohibit_published_insert() returns trigger language plpgsql set search_path=public as $$begin if exists(select 1 from issue_revisions where id=NEW.revision_id and status='published') then raise exception 'Cannot add to published revision';end if;return NEW;end$$;
create trigger immutable_payload_insert before insert on edition_payloads for each row execute function prohibit_published_insert();
create trigger immutable_file_insert before insert on issue_files for each row execute function prohibit_published_insert();

-- Reader visibility is based on publication, not the client URL.
do $$declare t text;begin foreach t in array array['sources','candidates','story_bundles','issues','issue_revisions','edition_payloads','assets','issue_files','generation_jobs','generation_steps','site_members','app_settings'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())',t);end loop;end$$;
create policy own_membership on site_members for select to authenticated using(user_id=auth.uid());
create policy published_issues on issues for select to authenticated using(is_member() and current_revision_id is not null);
create policy published_revisions on issue_revisions for select to authenticated using(is_member() and status='published');
create policy published_payload on edition_payloads for select to authenticated using(is_member() and exists(select 1 from issue_revisions r where r.id=revision_id and r.status='published'));
create policy published_files on issue_files for select to authenticated using(is_member() and exists(select 1 from issue_revisions r where r.id=revision_id and r.status='published'));
-- No client write policies. All admin writes go through narrowly scoped RPCs.

create function publish_revision(target uuid,automatic boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare r issue_revisions; i issues; n integer; p record;
begin
 if automatic then
   if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
   if not exists(select 1 from app_settings where key='publishing' and value->>'mode'='auto' and (value->>'trial_issues')::int>=3) then raise exception 'Auto mode not approved';end if;
 elsif not is_admin() then raise exception 'Forbidden';end if;
 select * into r from issue_revisions where id=target for update;
 if not found then raise exception 'Missing revision';end if;
 select * into i from issues where id=r.issue_id for update;
 if r.status='published' and i.current_revision_id=target then return;end if;
 if r.status<>'ready' or r.gate_report->>'pass' is distinct from 'true' or r.gate_report->>'mode' is distinct from 'live' then raise exception 'Gates failed';end if;
 if cardinality(r.story_order)<>8 or (select count(distinct x) from unnest(r.story_order) x)<>8 then raise exception 'Eight stories required';end if;
 if automatic and r.gate_report->>'needs_human' is distinct from 'false' then raise exception 'Human review required';end if;
 if i.current_revision_id is not null and exists(select 1 from issue_revisions old where old.id=i.current_revision_id and old.revision_no>=r.revision_no) then raise exception 'Cannot publish older revision';end if;
 select count(*) into n from edition_payloads where revision_id=target;
 if n<>3 then raise exception 'Three editions required';end if;
 for p in select * from edition_payloads where revision_id=target loop
   if p.payload->>'isDemo' is distinct from 'false' or p.payload->>'issueDate'<>i.issue_date::text or (p.payload->>'revision')::int<>r.revision_no or p.payload->>'edition'<>p.edition or jsonb_array_length(p.payload->'articles')<>8 then raise exception 'Invalid edition payload';end if;
   if p.review_result->>'pass' is distinct from 'true' then raise exception 'Review failed';end if;
   if (select array_agg(a->>'storyId' order by ord) from jsonb_array_elements(p.payload->'articles') with ordinality as x(a,ord))<>r.story_order then raise exception 'Story order mismatch';end if;
   select count(*) into n from issue_files f where f.revision_id=target and f.edition=p.edition and f.validated and f.pages=2 and f.content_hash=p.content_hash and f.template_version=p.payload->>'templateVersion';
   if n<>2 then raise exception 'Missing or stale PDFs';end if;
 end loop;
 update issue_revisions set status='published',published_at=now(),approved_by=case when automatic then null else auth.uid() end,approved_at=now() where id=target;
 update issues set current_revision_id=target where id=i.id;
end $$;
revoke all on function publish_revision(uuid,boolean) from public,anon;
grant execute on function publish_revision(uuid,boolean) to authenticated,service_role;

create function claim_lease(job uuid,owner uuid,seconds integer default 120) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.role()<>'service_role' then raise exception 'Forbidden';end if;
 update generation_jobs set lease_owner=owner,lease_expires_at=now()+make_interval(secs=>least(greatest(seconds,30),300)),updated_at=now()
 where id=job and (lease_expires_at is null or lease_expires_at<now() or lease_owner=owner);
 return found;
end $$;
create function commit_step(job uuid,owner uuid,step jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from generation_jobs where id=job and lease_owner=owner and lease_expires_at>now() for update;
 if auth.role()<>'service_role' or not found then raise exception 'Lease lost';end if;
 insert into generation_steps(job_id,stage,story_id,edition,input_hash,output_ref,output_hash,prompt_version,model,status,attempts,usage,finished_at)
 values(job,step->>'stage',coalesce(step->>'story_id',''),coalesce(step->>'edition',''),step->>'input_hash',step->'output',step->>'output_hash',step->>'prompt_version',step->>'model','success',1,step->'usage',now())
 on conflict(job_id,stage,story_id,edition) do update set input_hash=excluded.input_hash,output_ref=excluded.output_ref,output_hash=excluded.output_hash,prompt_version=excluded.prompt_version,model=excluded.model,status='success',attempts=generation_steps.attempts+1,usage=excluded.usage,finished_at=now();
end $$;
revoke all on function claim_lease(uuid,uuid,integer),commit_step(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function claim_lease(uuid,uuid,integer),commit_step(uuid,uuid,jsonb) to service_role;

insert into storage.buckets(id,name,public) values('issue-files','issue-files',false),('evidence','evidence',false),('images','images',false);
create policy reader_download on storage.objects for select to authenticated using(bucket_id='issue-files' and is_member() and exists(select 1 from issue_files f join issue_revisions r on r.id=f.revision_id where f.storage_path=name and r.status='published'));
create policy admin_storage_read on storage.objects for select to authenticated using(is_admin() and bucket_id in ('issue-files','evidence','images'));

