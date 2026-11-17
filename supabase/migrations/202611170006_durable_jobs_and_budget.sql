-- Daily counters include pending/unknown calls even after a runner crashes.
create table daily_usage(
  issue_date date primary key, usd_limit numeric not null check(usd_limit>=0),
  input_rate numeric check(input_rate>=0),output_rate numeric check(output_rate>=0),
  max_calls int not null check(max_calls>0),max_tokens bigint not null check(max_tokens>0),
  calls int not null default 0,tokens bigint not null default 0,
  reserved_usd numeric not null default 0,spent_usd numeric not null default 0
);
create table model_reservations(
  id uuid primary key default gen_random_uuid(),job_id uuid not null references generation_jobs,
  issue_date date not null references daily_usage,status text not null default 'pending'
    check(status in ('pending','settled','usage_unknown')),
  reserved_tokens bigint not null,reserved_cost numeric not null,known_price boolean not null,
  usage jsonb,created_at timestamptz not null default now(),settled_at timestamptz
);
alter table daily_usage enable row level security;
alter table model_reservations enable row level security;
create policy admin_read on daily_usage for select to authenticated using(is_admin());
create policy admin_read on model_reservations for select to authenticated using(is_admin());

create function require_job_lease(job uuid,owner uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  perform 1 from generation_jobs where id=job and lease_owner=owner and lease_expires_at>now() for update;
  if not found then raise exception 'Lease lost'; end if;
end $$;

create function start_issue_job(day date,owner uuid,story_ids text[],facts_hash text,
  limits jsonb,resume boolean default true,force_new_revision boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare parent issues; rev issue_revisions; work generation_jobs; number int;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  if cardinality(story_ids) is distinct from 8 or (select count(distinct s) from unnest(story_ids) s)<>8
    or facts_hash is null then raise exception 'Eight distinct stories and facts hash required'; end if;
  insert into issues(issue_date) values(day) on conflict(issue_date) do nothing;
  select * into parent from issues where issue_date=day for update;
  if exists(select 1 from generation_jobs where issue_date=day and lease_expires_at>now()
    and lease_owner is distinct from owner) then
    return jsonb_build_object('status','lease_active','acquired',false);
  end if;
  if parent.current_revision_id is not null and not force_new_revision then
    return jsonb_build_object('status','already_published','acquired',false,'revision_id',parent.current_revision_id);
  end if;
  select * into rev from issue_revisions where issue_id=parent.id order by revision_no desc limit 1;
  if rev.id is not null and not force_new_revision then
    if not resume then raise exception 'Draft exists; resume or explicitly create a new revision'; end if;
    if rev.story_order is distinct from story_ids then raise exception 'Story set changed; new revision required'; end if;
    select * into work from generation_jobs where revision_id=rev.id;
    if work.id is null then
      insert into generation_jobs(issue_date,revision_id,budget) values(day,rev.id,limits||jsonb_build_object('factsHash',facts_hash)) returning * into work;
    elsif work.budget->>'factsHash' is distinct from facts_hash then
      raise exception 'Facts changed; new revision required';
    end if;
  else
    number := coalesce(rev.revision_no,0)+1;
    insert into issue_revisions(issue_id,revision_no,story_order)
      values(parent.id,number,story_ids) returning * into rev;
    insert into generation_jobs(issue_date,revision_id,budget)
      values(day,rev.id,limits||jsonb_build_object('factsHash',facts_hash)) returning * into work;
  end if;
  insert into daily_usage(issue_date,usd_limit,input_rate,output_rate,max_calls,max_tokens)
    values(day,(limits->>'usd')::numeric,(limits->>'inputRate')::numeric,(limits->>'outputRate')::numeric,
      (limits->>'maxCalls')::int,(limits->>'maxTokens')::bigint) on conflict(issue_date) do nothing;
  if not claim_lease(work.id,owner,120) then
    return jsonb_build_object('status','lease_active','acquired',false,'job_id',work.id);
  end if;
  update generation_jobs set status=case when rev.status='ready' then 'needs_review' else 'running' end,
    updated_at=now() where id=work.id;
  return jsonb_build_object('status',rev.status,'acquired',true,'job_id',work.id,
    'revision_id',rev.id,'revision',rev.revision_no);
end $$;

create function heartbeat_job(job uuid,owner uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform require_job_lease(job,owner);
  update generation_jobs set lease_expires_at=now()+interval '120 seconds',updated_at=now() where id=job;
end $$;
create function release_job(job uuid,owner uuid,final_status text) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform require_job_lease(job,owner);
  if final_status not in ('needs_review','needs_attention','published') then raise exception 'Invalid status'; end if;
  update generation_jobs set status=final_status,lease_owner=null,lease_expires_at=null,updated_at=now() where id=job;
end $$;
create function read_generation_step(job uuid,owner uuid,stage_name text,story text,edition_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare step generation_steps;
begin
  perform require_job_lease(job,owner);
  select * into step from generation_steps where job_id=job and stage=stage_name and story_id=story and edition=edition_name;
  if not found then return null; end if;
  return jsonb_build_object('status',step.status,'inputHash',step.input_hash,
    'output',step.output_ref,'outputHash',step.output_hash);
end $$;
create function save_generation_step(job uuid,owner uuid,step jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform require_job_lease(job,owner);
  if step->>'status' not in ('running','success','failed') or step->>'status' is null
    or coalesce(step->>'input_hash','')='' or coalesce(step->>'stage','')=''
    then raise exception 'Invalid step'; end if;
  insert into generation_steps(job_id,stage,story_id,edition,input_hash,output_ref,output_hash,
    prompt_version,model,status,attempts,error,usage,started_at,finished_at)
  values(job,step->>'stage',coalesce(step->>'story_id',''),coalesce(step->>'edition',''),
    step->>'input_hash',step->'output',step->>'output_hash',step->>'prompt_version',step->>'model',
    step->>'status',case when step->>'status'='running' then 1 else 0 end,step->>'error',step->'usage',now(),
    case when step->>'status'='running' then null else now() end)
  on conflict(job_id,stage,story_id,edition) do update set input_hash=excluded.input_hash,
    output_ref=excluded.output_ref,output_hash=excluded.output_hash,prompt_version=coalesce(excluded.prompt_version,generation_steps.prompt_version),
    model=coalesce(excluded.model,generation_steps.model),status=excluded.status,error=excluded.error,usage=excluded.usage,
    attempts=generation_steps.attempts+case when excluded.status='running' then 1 else 0 end,
    started_at=case when excluded.status='running' then now() else generation_steps.started_at end,
    finished_at=excluded.finished_at;
end $$;

create function reserve_model_call(job uuid,owner uuid,input_tokens bigint,output_tokens bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare day date; ledger daily_usage; cost numeric; ticket uuid; known boolean;
begin
  perform require_job_lease(job,owner);
  if input_tokens<0 or output_tokens<1 or input_tokens is null or output_tokens is null then raise exception 'Invalid token reservation'; end if;
  select issue_date into day from generation_jobs where id=job;
  select * into ledger from daily_usage where issue_date=day for update;
  if not found then raise exception 'Budget not initialized'; end if;
  known := ledger.input_rate is not null and ledger.output_rate is not null;
  cost := case when known then (input_tokens*ledger.input_rate+output_tokens*ledger.output_rate)/1000000 else 0 end;
  if ledger.usd_limit<=0 or ledger.calls+1>ledger.max_calls or ledger.tokens+input_tokens+output_tokens>ledger.max_tokens or
    ledger.spent_usd+ledger.reserved_usd+cost>ledger.usd_limit then raise exception 'BUDGET_EXCEEDED'; end if;
  insert into model_reservations(job_id,issue_date,reserved_tokens,reserved_cost,known_price)
    values(job,day,input_tokens+output_tokens,cost,known) returning id into ticket;
  update daily_usage set calls=calls+1,tokens=tokens+input_tokens+output_tokens,
    reserved_usd=reserved_usd+cost where issue_date=day;
  return jsonb_build_object('id',ticket,'tokens',input_tokens+output_tokens,'cost',cost,'known',known);
end $$;
create function settle_model_call(job uuid,owner uuid,ticket uuid,usage jsonb default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare reservation model_reservations; ledger daily_usage; actual_cost numeric; used bigint; over_budget boolean;
begin
  perform require_job_lease(job,owner);
  select * into reservation from model_reservations where id=ticket and job_id=job for update;
  if not found then raise exception 'Unknown reservation'; end if;
  if reservation.status<>'pending' then return jsonb_build_object('status',reservation.status); end if;
  select * into ledger from daily_usage where issue_date=reservation.issue_date for update;
  if usage is null then
    -- Unknown billing remains fully reserved; a restart cannot silently reset it.
    update model_reservations set status='usage_unknown',settled_at=now() where id=ticket;
    return jsonb_build_object('status','usage_unknown');
  end if;
  if (usage->>'input_tokens') is null or (usage->>'output_tokens') is null or
     (usage->>'input_tokens')::bigint<0 or (usage->>'output_tokens')::bigint<0 then raise exception 'Invalid usage'; end if;
  used := (usage->>'input_tokens')::bigint+(usage->>'output_tokens')::bigint;
  actual_cost := case when reservation.known_price then
    ((usage->>'input_tokens')::numeric*ledger.input_rate+(usage->>'output_tokens')::numeric*ledger.output_rate)/1000000 else 0 end;
  update daily_usage set reserved_usd=reserved_usd-reservation.reserved_cost,spent_usd=spent_usd+actual_cost,
    tokens=tokens-reservation.reserved_tokens+used where issue_date=reservation.issue_date returning * into ledger;
  update model_reservations set status='settled',usage=settle_model_call.usage,settled_at=now() where id=ticket;
  over_budget := ledger.tokens>ledger.max_tokens or ledger.spent_usd+ledger.reserved_usd>ledger.usd_limit;
  -- Return after recording actual spend; raising here would roll back the ledger.
  return jsonb_build_object('status','settled','over_budget',over_budget);
end $$;

do $$declare fn text;begin
  foreach fn in array array[
    'require_job_lease(uuid,uuid)',
    'start_issue_job(date,uuid,text[],text,jsonb,boolean,boolean)',
    'heartbeat_job(uuid,uuid)','release_job(uuid,uuid,text)',
    'read_generation_step(uuid,uuid,text,text,text)','save_generation_step(uuid,uuid,jsonb)',
    'reserve_model_call(uuid,uuid,bigint,bigint)','settle_model_call(uuid,uuid,uuid,jsonb)'
  ] loop
    execute 'revoke all on function '||fn||' from public,anon,authenticated';
    execute 'grant execute on function '||fn||' to service_role';
  end loop;
end $$;
