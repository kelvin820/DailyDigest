create function approve_reviewed_revision(target uuid,expected_fingerprint text) returns void
language plpgsql security definer set search_path=public as $$
declare parent_id uuid;
begin
  if not is_admin() then raise exception 'Forbidden'; end if;
  select issue_id into parent_id from issue_revisions where id=target;
  if parent_id is null then raise exception 'Missing revision'; end if;
  perform 1 from issues where id=parent_id for update;
  perform 1 from issue_revisions where id=target for update;
  perform 1 from edition_payloads where revision_id=target for update;
  if expected_fingerprint is distinct from (admin_revision(target)->>'fingerprint')
    then raise exception 'Stale revision'; end if;
  perform publish_revision(target,false);
end $$;
revoke all on function approve_reviewed_revision(uuid,text) from public,anon;
grant execute on function approve_reviewed_revision(uuid,text) to authenticated;
