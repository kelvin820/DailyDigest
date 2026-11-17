create or replace function start_issue_job(day date,owner uuid,story_ids text[],facts_hash text,
  limits jsonb,resume boolean default true,force_new_revision boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare parent issues; rev issue_revisions; work generation_jobs; number int; intake boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  intake := cardinality(story_ids)=0 and facts_hash like 'intake:%';
  if facts_hash is null or (not coalesce(intake,false) and (cardinality(story_ids) is distinct from 8 or
    (select count(distinct s) from unnest(story_ids) s)<>8)) then raise exception 'Invalid fact request'; end if;
  insert into issues(issue_date) values(day) on conflict(issue_date) do nothing;
  select * into parent from issues where issue_date=day for update;
  if exists(select 1 from generation_jobs where issue_date=day and lease_expires_at>now() and lease_owner is distinct from owner)
    then return jsonb_build_object('status','lease_active','acquired',false); end if;
  if parent.current_revision_id is not null and not force_new_revision then
    return jsonb_build_object('status','already_published','acquired',false,'revision_id',parent.current_revision_id);
  end if;
  if has_unacknowledged_usage(day) then raise exception 'USAGE_RECONCILIATION_REQUIRED'; end if;
  select * into rev from issue_revisions where issue_id=parent.id order by revision_no desc limit 1;
  if rev.id is not null and not force_new_revision then
    if not resume then raise exception 'Draft exists; resume or explicitly create a new revision'; end if;
    if not intake and rev.story_order is distinct from story_ids then raise exception 'Story set changed; new revision required'; end if;
    select * into work from generation_jobs where revision_id=rev.id;
    if work.id is null then
      insert into generation_jobs(issue_date,revision_id,budget) values(day,rev.id,
        limits||jsonb_build_object('requestHash',facts_hash,'factsHash',case when intake then null else facts_hash end)) returning * into work;
    elsif coalesce(work.budget->>'requestHash',work.budget->>'factsHash') is distinct from facts_hash
      then raise exception 'Facts changed; new revision required'; end if;
  else
    number := coalesce(rev.revision_no,0)+1;
    insert into issue_revisions(issue_id,revision_no,story_order) values(parent.id,number,story_ids) returning * into rev;
    insert into generation_jobs(issue_date,revision_id,budget) values(day,rev.id,
      limits||jsonb_build_object('requestHash',facts_hash,'factsHash',case when intake then null else facts_hash end)) returning * into work;
  end if;
  insert into daily_usage(issue_date,usd_limit,input_rate,output_rate,max_calls,max_tokens)
    values(day,(limits->>'usd')::numeric,(limits->>'inputRate')::numeric,(limits->>'outputRate')::numeric,
      (limits->>'maxCalls')::int,(limits->>'maxTokens')::bigint) on conflict(issue_date) do nothing;
  if not claim_lease(work.id,owner,120) then return jsonb_build_object('status','lease_active','acquired',false,'job_id',work.id); end if;
  update generation_jobs set status=case when rev.status='ready' then 'needs_review' else 'running' end,updated_at=now() where id=work.id;
  return jsonb_build_object('status',rev.status,'acquired',true,'job_id',work.id,'revision_id',rev.id,'revision',rev.revision_no);
end $$;

create function bind_issue_facts(job uuid,owner uuid,story_ids text[],facts_hash text) returns void
language plpgsql security definer set search_path=public as $$
declare work generation_jobs; rev issue_revisions;
begin
  perform require_job_lease(job,owner);
  select * into work from generation_jobs where id=job;
  select * into rev from issue_revisions where id=work.revision_id for update;
  if rev.status='published' or cardinality(story_ids) is distinct from 8 or
    (select count(distinct s) from unnest(story_ids) s)<>8 or facts_hash is null then raise exception 'Invalid facts'; end if;
  if cardinality(rev.story_order)>0 and rev.story_order is distinct from story_ids then raise exception 'Story set changed'; end if;
  if work.budget->>'factsHash' is not null and work.budget->>'factsHash' is distinct from facts_hash then raise exception 'Frozen facts changed'; end if;
  update issue_revisions set story_order=story_ids where id=rev.id;
  update generation_jobs set budget=jsonb_set(budget,'{factsHash}',to_jsonb(facts_hash)),updated_at=now() where id=job;
end $$;
revoke all on function bind_issue_facts(uuid,uuid,text[],text) from public,anon,authenticated;
grant execute on function bind_issue_facts(uuid,uuid,text[],text) to service_role;
