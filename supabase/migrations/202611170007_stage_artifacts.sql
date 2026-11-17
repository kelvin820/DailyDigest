create table issue_story_bundles(
  revision_id uuid not null references issue_revisions,story_id text not null,
  bundle_id uuid not null references story_bundles,primary key(revision_id,story_id)
);
alter table issue_story_bundles enable row level security;
create policy admin_read on issue_story_bundles for select to authenticated using(is_admin());
create trigger immutable_bundle_reference before update or delete on issue_story_bundles
  for each row execute function protect_published();
create trigger immutable_bundle_reference_insert before insert on issue_story_bundles
  for each row execute function prohibit_published_insert();

create function stage_revision_artifacts(job uuid,owner uuid,payloads jsonb,review_records jsonb,
  fact_records jsonb,file_records jsonb,report jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare work generation_jobs; rev issue_revisions; p jsonb; f jsonb; fact jsonb; bundle uuid; asset uuid;
begin
  perform require_job_lease(job,owner);
  select * into work from generation_jobs where id=job;
  select * into rev from issue_revisions where id=work.revision_id for update;
  if rev.status='published' then raise exception 'Published revisions are immutable'; end if;
  if jsonb_array_length(payloads) is distinct from 3 or jsonb_array_length(fact_records) is distinct from 8 or
     jsonb_array_length(file_records) is distinct from 6 or jsonb_array_length(review_records) is distinct from 24 or
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
revoke all on function stage_revision_artifacts(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function stage_revision_artifacts(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

create function mark_job_published() returns trigger language plpgsql set search_path=public as $$
begin
  if NEW.status='published' then update generation_jobs set status='published',updated_at=now()
    where revision_id=NEW.id; end if;
  return NEW;
end $$;
create trigger published_job_status after update of status on issue_revisions
  for each row when (NEW.status='published') execute function mark_job_published();
