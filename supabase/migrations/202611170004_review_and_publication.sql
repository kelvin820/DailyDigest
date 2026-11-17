-- Narrow admin revision API. Readers still receive payload columns only.
create function public.admin_revision(target uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'Forbidden'; end if;
  select jsonb_build_object(
    'id',r.id,'status',r.status,'revision',r.revision_no,'issue_date',i.issue_date,
    'gate_report',r.gate_report,'editorial_notes',r.editorial_notes,
    'fingerprint',encode(sha256(convert_to(coalesce((select jsonb_agg(p.payload order by p.edition)
      from edition_payloads p where p.revision_id=r.id),'[]'::jsonb)::text,'UTF8')),'hex'),
    'payloads',coalesce((select jsonb_agg(p.payload order by p.edition)
      from edition_payloads p where p.revision_id=r.id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object('edition',p.edition,'result',p.review_result))
      from edition_payloads p where p.revision_id=r.id),'[]'::jsonb))
  into result from issue_revisions r join issues i on i.id=r.issue_id where r.id=target;
  if result is null then raise exception 'Revision not found'; end if;
  return result;
end $$;

-- Every edit creates a new draft. No inherited review pass, files or publication.
-- updated_payload is independently validated in the route AND constrained here.
create function public.revise_revision(target uuid, expected_fingerprint text,
  changed_edition text, updated_payload jsonb, correction text) returns uuid
language plpgsql security definer set search_path=public as $$
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
     jsonb_array_length(updated_payload->'articles') is distinct from 8
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
revoke all on function admin_revision(uuid),revise_revision(uuid,text,text,jsonb,text) from public,anon;
grant execute on function admin_revision(uuid),revise_revision(uuid,text,text,jsonb,text) to authenticated;

-- Check both ends of an artifact move as well as updates/deletes.
create or replace function protect_published() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_TABLE_NAME='issue_revisions' then
    if OLD.status='published' then raise exception 'Published revisions are immutable'; end if;
  else
    if exists(select 1 from issue_revisions where id=OLD.revision_id and status='published') or
       (TG_OP='UPDATE' and exists(select 1 from issue_revisions where id=NEW.revision_id and status='published'))
      then raise exception 'Published artifacts are immutable'; end if;
  end if;
  if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;

-- Fail closed on missing JSON fields. All publishing paths use these same gates.
create or replace function publish_revision(target uuid,automatic boolean default false) returns void
language plpgsql security definer set search_path=public as $$
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
  if cardinality(r.story_order) is distinct from 8 or
     (select count(distinct x) from unnest(r.story_order) x)<>8 then raise exception 'Eight stories required'; end if;
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
       jsonb_array_length(p.payload->'articles') is distinct from 8 or
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
