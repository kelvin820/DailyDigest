-- Keep text editing and evidence inheritance in a single transaction.
alter function revise_revision(uuid,text,text,jsonb,text) rename to revise_revision_text;
revoke all on function revise_revision_text(uuid,text,text,jsonb,text) from public,anon,authenticated;
create function revise_revision(target uuid,expected_fingerprint text,changed_edition text,
  updated_payload jsonb,correction text) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not is_admin() then raise exception 'Forbidden'; end if;
  if exists(select 1 from generation_jobs j join issue_revisions r on r.id=j.revision_id
    where r.issue_id=(select issue_id from issue_revisions where id=target) and j.lease_expires_at>now())
    then raise exception 'An active job must finish before editing'; end if;
  new_id := revise_revision_text(target,expected_fingerprint,changed_edition,updated_payload,correction);
  insert into issue_story_bundles(revision_id,story_id,bundle_id)
    select new_id,story_id,bundle_id from issue_story_bundles where revision_id=target;
  return new_id;
end $$;
revoke all on function revise_revision(uuid,text,text,jsonb,text) from public,anon;
grant execute on function revise_revision(uuid,text,text,jsonb,text) to authenticated;

create or replace function admin_revision(target uuid) returns jsonb
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
      from edition_payloads p where p.revision_id=r.id),'[]'::jsonb),
    'facts',coalesce((select jsonb_agg(b.fact_payload order by array_position(r.story_order,ref.story_id))
      from issue_story_bundles ref join story_bundles b on b.id=ref.bundle_id where ref.revision_id=r.id),'[]'::jsonb))
  into result from issue_revisions r join issues i on i.id=r.issue_id where r.id=target;
  if result is null then raise exception 'Revision not found'; end if;
  return result;
end $$;
