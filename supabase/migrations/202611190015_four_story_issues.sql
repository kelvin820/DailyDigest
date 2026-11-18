-- Four-story issues become the current policy; historical eight-story revisions remain valid.
-- Replace functions while retaining existing grants, role/lease guards and hardened search paths.

create or replace function start_issue_job(day date,owner uuid,story_ids text[],facts_hash text,
  limits jsonb,resume boolean default true,force_new_revision boolean default false) returns jsonb
language plpgsql security definer set search_path=public, pg_temp as $$
declare parent issues; rev issue_revisions; work generation_jobs; number int; intake boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
  intake := cardinality(story_ids)=0 and facts_hash like 'intake:%';
  if facts_hash is null or (not coalesce(intake,false) and (coalesce(cardinality(story_ids),0) not in (4,8) or
    (select count(distinct s) from unnest(story_ids) s)<>cardinality(story_ids))) then raise exception 'Invalid fact request'; end if;
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

create or replace function bind_issue_facts(job uuid,owner uuid,story_ids text[],facts_hash text) returns void
language plpgsql security definer set search_path=public, pg_temp as $$
declare work generation_jobs; rev issue_revisions;
begin
  perform require_job_lease(job,owner);
  select * into work from generation_jobs where id=job;
  select * into rev from issue_revisions where id=work.revision_id for update;
  if rev.status='published' or coalesce(cardinality(story_ids),0) not in (4,8) or
    (select count(distinct s) from unnest(story_ids) s)<>cardinality(story_ids) or facts_hash is null then raise exception 'Invalid facts'; end if;
  if cardinality(rev.story_order)>0 and rev.story_order is distinct from story_ids then raise exception 'Story set changed'; end if;
  if work.budget->>'factsHash' is not null and work.budget->>'factsHash' is distinct from facts_hash then raise exception 'Frozen facts changed'; end if;
  update issue_revisions set story_order=story_ids where id=rev.id;
  update generation_jobs set budget=jsonb_set(budget,'{factsHash}',to_jsonb(facts_hash)),updated_at=now() where id=job;
end $$;

create or replace function stage_revision_artifacts(job uuid,owner uuid,payloads jsonb,review_records jsonb,
  fact_records jsonb,file_records jsonb,report jsonb) returns void
language plpgsql security definer set search_path=public, pg_temp as $$
declare work generation_jobs; rev issue_revisions; p jsonb; f jsonb; fact jsonb; bundle uuid; asset uuid;
begin
  perform require_job_lease(job,owner);
  select * into work from generation_jobs where id=job;
  select * into rev from issue_revisions where id=work.revision_id for update;
  if cardinality(rev.story_order) not in (4,8) then raise exception 'Invalid story count'; end if;
  if rev.status='published' then raise exception 'Published revisions are immutable'; end if;
  if jsonb_array_length(payloads) is distinct from 3 or jsonb_array_length(fact_records) is distinct from cardinality(rev.story_order) or
     jsonb_array_length(file_records) is distinct from 6 or jsonb_array_length(review_records) is distinct from 3*cardinality(rev.story_order) or
     report->>'pass' is distinct from 'true' or report->>'mode' is distinct from 'live'
    then raise exception 'Incomplete verified artifacts'; end if;
  delete from issue_files where revision_id=rev.id;
  delete from edition_payloads where revision_id=rev.id;
  delete from issue_story_bundles where revision_id=rev.id;
  for fact in select value from jsonb_array_elements(fact_records) loop
    if fact->>'is_demo' is distinct from 'false' then raise exception 'DEMO facts rejected'; end if;
    insert into story_bundles(event_key,category,fact_payload,source_refs,evidence_hash,sensitivity)
      values(fact->>'event_key',fact->>'primary_category',fact,fact->'sources',
        encode(sha256(convert_to(fact::text,'UTF8')),'hex'),fact->>'sensitivity') returning id into bundle;
    insert into issue_story_bundles values(rev.id,fact->>'story_id',bundle);
  end loop;
  for p in select value from jsonb_array_elements(payloads) loop
    if p->'payload'->>'isDemo' is distinct from 'false' or
       p->'payload'->>'issueDate' is distinct from work.issue_date::text or
       p->'payload'->>'revision' is distinct from rev.revision_no::text or
       (select array_agg(a->>'storyId' order by ord) from jsonb_array_elements(p->'payload'->'articles') with ordinality x(a,ord))
         is distinct from rev.story_order then raise exception 'Payload revision mismatch'; end if;
    insert into edition_payloads(revision_id,edition,payload,content_hash,prompt_version,review_result)
      values(rev.id,p->'payload'->>'edition',p->'payload',p->>'content_hash','writer.v1/reviewer.v1',
        jsonb_build_object('pass',true,'articles',(select jsonb_agg(r) from jsonb_array_elements(review_records) r
          where r->>'edition'=p->'payload'->>'edition')));
  end loop;
  for f in select value from jsonb_array_elements(file_records) loop
    if f->>'textVerified' is distinct from 'true' or f->>'fontsEmbedded' is distinct from 'true' or
       f->>'noOverflow' is distinct from 'true' or f->>'pages' is distinct from '2' or
       not exists(select 1 from storage.objects where bucket_id='issue-files' and name=f->>'storagePath')
      then raise exception 'Unverified PDF or missing storage object'; end if;
    insert into assets(kind,private_storage_path,hash,mime,credit,rights,status)
      values('pdf',f->>'storagePath',f->>'fileHash','application/pdf','DayDay INC.',
        '{"kind":"original_document","fonts":"OFL embedded subsets"}','verified') returning id into asset;
    insert into issue_files(revision_id,edition,print_mode,asset_id,storage_path,template_version,content_hash,pages,validated)
      values(rev.id,f->>'edition',f->>'mode',asset,f->>'storagePath',f->>'templateVersion',f->>'contentHash',2,true);
  end loop;
  update issue_revisions set status='ready',gate_report=report,review_status=jsonb_build_object('pass',true)
    where id=rev.id;
end $$;

create or replace function public.revise_revision(target uuid, expected_fingerprint text,
  changed_edition text, updated_payload jsonb, correction text) returns uuid
language plpgsql security definer set search_path=public, pg_temp as $$
declare src issue_revisions; parent_id uuid; next_no int; new_id uuid;
  before_payload jsonb; before_article jsonb; after_article jsonb; current_fingerprint text;
begin
  if not is_admin() then raise exception 'Forbidden'; end if;
  if changed_edition not in ('elementary','junior','senior') or
     length(trim(correction)) not between 1 and 500 then raise exception 'Invalid revision input'; end if;
  select issue_id into parent_id from issue_revisions where id=target;
  if parent_id is null then raise exception 'Revision not found'; end if;
  perform 1 from issues where id=parent_id for update;
  select * into src from issue_revisions where id=target for update;
  if exists(select 1 from issue_revisions where issue_id=parent_id and revision_no>src.revision_no)
    then raise exception 'Stale revision'; end if;
  perform 1 from edition_payloads where revision_id=target for update;
  current_fingerprint := admin_revision(target)->>'fingerprint';
  if expected_fingerprint is distinct from current_fingerprint then raise exception 'Stale revision'; end if;
  select payload into before_payload from edition_payloads where revision_id=target and edition=changed_edition;
  if before_payload is null or jsonb_typeof(updated_payload) is distinct from 'object' or
     (updated_payload-'articles') is distinct from (before_payload-'articles') or
     jsonb_array_length(updated_payload->'articles') is distinct from cardinality(src.story_order)
    then raise exception 'Invalid revision payload'; end if;
  for before_article,after_article in
    select b.value,a.value from jsonb_array_elements(before_payload->'articles') with ordinality b
      join jsonb_array_elements(updated_payload->'articles') with ordinality a on a.ordinality=b.ordinality
  loop
    if (before_article-array['headline','bodyParagraphs','vocabulary','wordCount','correctionNote'])
      is distinct from (after_article-array['headline','bodyParagraphs','vocabulary','wordCount','correctionNote'])
      then raise exception 'Only editorial text may change'; end if;
    if jsonb_typeof(after_article->'headline') is distinct from 'string' or
       length(after_article->>'headline') not between 1 and 130 or
       jsonb_typeof(after_article->'bodyParagraphs') is distinct from 'array' or
       jsonb_array_length(after_article->'bodyParagraphs') not between 1 and 2 or
       jsonb_array_length(after_article->'vocabulary') is distinct from 2
      then raise exception 'Invalid article'; end if;
  end loop;
  next_no := src.revision_no+1;
  insert into issue_revisions(issue_id,revision_no,status,story_order,editorial_notes,review_status,gate_report)
    values(parent_id,next_no,'draft',src.story_order,trim(correction),
      '{"pass":false,"reason":"Text revision requires review and six new PDFs"}',
      '{"pass":false,"mode":"live","needs_human":true,"errors":["Revalidation required"]}') returning id into new_id;
  insert into edition_payloads(revision_id,edition,payload,content_hash,prompt_version,review_result)
    select new_id,p.edition,
      (case when p.edition=changed_edition then updated_payload else p.payload end)
        ||jsonb_build_object('revision',next_no,'publishedAt',null),
      encode(sha256(convert_to(((case when p.edition=changed_edition then updated_payload else p.payload end)
        ||jsonb_build_object('revision',next_no,'publishedAt',null))::text,'UTF8')),'hex'),
      p.prompt_version,'{"pass":false,"reason":"Revision requires validation"}'
    from edition_payloads p where p.revision_id=target;
  -- Deliberately no issue_files copy. Old PDF hashes and reviews are not reusable as approval.
  return new_id;
end $$;

create or replace function publish_revision(target uuid,automatic boolean default false) returns void
language plpgsql security definer set search_path=public, pg_temp as $$
declare r issue_revisions; i issues; parent_id uuid; n int; p record; file record;
begin
  if automatic then
    if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
    if not exists(select 1 from app_settings where key='publishing' and value->>'mode'='auto'
      and (value->>'trial_issues')::int>=3 and value->>'live_enabled'='true')
      then raise exception 'Auto mode not approved'; end if;
  elsif not is_admin() then raise exception 'Forbidden'; end if;
  select issue_id into parent_id from issue_revisions where id=target;
  if parent_id is null then raise exception 'Missing revision'; end if;
  select * into i from issues where id=parent_id for update;
  select * into r from issue_revisions where id=target for update;
  if r.status='published' and i.current_revision_id=target then return; end if;
  if r.status<>'ready' or r.gate_report->>'pass' is distinct from 'true' or
     r.gate_report->>'mode' is distinct from 'live' then raise exception 'Gates failed'; end if;
  if coalesce(cardinality(r.story_order),0) not in (4,8) or
     (select count(distinct x) from unnest(r.story_order) x)<>cardinality(r.story_order) then raise exception 'Four or historical eight stories required'; end if;
  if automatic and r.gate_report->>'needs_human' is distinct from 'false' then raise exception 'Human review required'; end if;
  if i.current_revision_id is not null and exists(select 1 from issue_revisions old
    where old.id=i.current_revision_id and old.revision_no>=r.revision_no) then raise exception 'Cannot publish older revision'; end if;
  select count(*) into n from edition_payloads where revision_id=target;
  if n<>3 then raise exception 'Three editions required'; end if;
  for p in select * from edition_payloads where revision_id=target for update loop
    if p.payload->>'isDemo' is distinct from 'false' or
       p.payload->>'schemaVersion' is distinct from '1.0' or
       p.payload->>'issueDate' is distinct from i.issue_date::text or
       p.payload->>'revision' is distinct from r.revision_no::text or
       p.payload->>'edition' is distinct from p.edition or
       jsonb_array_length(p.payload->'articles') is distinct from cardinality(r.story_order) or
       coalesce(p.payload->>'storyCount','8') is distinct from cardinality(r.story_order)::text or
       coalesce(p.payload->>'templateVersion','')='' then raise exception 'Invalid edition payload'; end if;
    if p.review_result->>'pass' is distinct from 'true' then raise exception 'Review failed'; end if;
    if (select array_agg(a->>'storyId' order by ord)
      from jsonb_array_elements(p.payload->'articles') with ordinality x(a,ord))
      is distinct from r.story_order then raise exception 'Story order mismatch'; end if;
    select count(*) into n from issue_files f where f.revision_id=target and f.edition=p.edition
      and f.validated and f.pages=2 and f.content_hash=p.content_hash
      and f.template_version=p.payload->>'templateVersion' and length(f.storage_path)>0;
    if n<>2 then raise exception 'Missing or stale PDFs'; end if;
    for file in select f.* from issue_files f where f.revision_id=target and f.edition=p.edition loop
      if not exists(select 1 from storage.objects o where o.bucket_id='issue-files' and o.name=file.storage_path)
        then raise exception 'PDF storage object missing'; end if;
    end loop;
  end loop;
  update issue_revisions set status='published',published_at=now(),
    approved_by=case when automatic then null else auth.uid() end,approved_at=now() where id=target;
  update issues set current_revision_id=target where id=i.id;
end $$;

insert into app_settings(key,value) values('issue_policy','{"story_count":4,"minimum_categories":3,"max_per_category":2}'::jsonb) on conflict(key) do update set value=excluded.value;
