-- Reader access must not expose editorial notes, evidence or gate reports.
drop policy published_revisions on issue_revisions;
create function public.revision_is_published(rid uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from issue_revisions where id=rid and status='published')$$;
drop policy published_payload on edition_payloads;
create policy published_payload on edition_payloads for select to authenticated using(is_member() and revision_is_published(revision_id));
drop policy published_files on issue_files;
create policy published_files on issue_files for select to authenticated using(is_member() and revision_is_published(revision_id));
drop policy reader_download on storage.objects;
create policy reader_download on storage.objects for select to authenticated using(bucket_id='issue-files' and is_member() and exists(select 1 from issue_files f where f.storage_path=name and revision_is_published(f.revision_id)));
-- Limit reader-visible columns. The reader API selects only payload.
revoke all on edition_payloads from anon,authenticated;
grant select(payload,revision_id,edition) on edition_payloads to authenticated;
