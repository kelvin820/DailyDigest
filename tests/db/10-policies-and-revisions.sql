create function test_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function test_reject(statement text, label text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then return; end;
  raise exception 'EXPECTED REJECTION: %',label;
end $$;
insert into auth.users values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into site_members values
  ('10000000-0000-4000-8000-000000000001','admin',true),
  ('10000000-0000-4000-8000-000000000002','reader',true),
  ('10000000-0000-4000-8000-000000000003','reader',false);
insert into issues(id,issue_date) values('20000000-0000-4000-8000-000000000001','2026-11-17');
insert into issue_revisions(id,issue_id,revision_no,status,story_order,gate_report) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'ready',
   array['demo-1','demo-2','demo-3','demo-4','demo-5','demo-6','demo-7','demo-8'],
   '{"pass":true,"mode":"live","needs_human":false}');
insert into edition_payloads(revision_id,edition,payload,content_hash,prompt_version,review_result)
  select '30000000-0000-4000-8000-000000000001',edition,payload,'synthetic-hash-'||edition,
    'synthetic-test-only','{"pass":true}' from test_payloads;
insert into issue_files(revision_id,edition,print_mode,storage_path,template_version,content_hash,pages,validated)
  select '30000000-0000-4000-8000-000000000001',edition,mode,edition||'/'||mode||'.pdf',
    '1.0','synthetic-hash-'||edition,2,true from test_payloads cross join unnest(array['color','ink']) mode;
insert into storage.objects(bucket_id,name) select 'issue-files',storage_path from issue_files;

set role anon;
set request.jwt.claim.role='anon';
select test_assert((select count(*) from issues)=0,'anon cannot read issues');
select test_reject('select payload from edition_payloads','anon cannot read payload');
select test_assert((select count(*) from storage.objects)=0,'anon cannot download PDFs');
select test_reject($q$select publish_revision('30000000-0000-4000-8000-000000000001',false)$q$,'anon publish');
reset role;

set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
select test_assert((select count(*) from edition_payloads)=0,'reader cannot read draft');
select test_assert((select count(*) from generation_jobs)=0,'reader cannot read jobs');
select test_assert((select count(*) from story_bundles)=0,'reader cannot read evidence');
select test_assert((select count(*) from app_settings)=0,'reader cannot read settings');
select test_assert((select count(*) from site_members)=1,'reader sees only own membership');
update site_members set role='admin';
select test_assert((select role='reader' from site_members),'self promotion has no effect');
select test_reject('select content_hash from edition_payloads','internal columns denied');
select test_reject($q$select admin_revision('30000000-0000-4000-8000-000000000001')$q$,'reader admin RPC');
select test_reject($q$select publish_revision('30000000-0000-4000-8000-000000000001',false)$q$,'reader publish');
reset role;

-- Missing JSON and missing objects must fail closed, despite a passing gate flag.
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
set request.jwt.claim.role='authenticated';
set role authenticated;
select test_assert(consume_admin_action('approve'),'first admin action accepted');
select test_assert(not consume_admin_action('approve'),'repeated admin action limited');
select test_reject($q$select consume_admin_action('arbitrary-key')$q$,'action key allowlist');
reset role;
update edition_payloads set payload=payload-'issueDate' where edition='elementary';
set role authenticated;
select test_reject($q$select publish_revision('30000000-0000-4000-8000-000000000001',false)$q$,'missing issueDate');
reset role;
update edition_payloads p set payload=t.payload from test_payloads t where p.edition=t.edition;
delete from storage.objects where name='elementary/color.pdf';
set role authenticated;
select test_reject($q$select publish_revision('30000000-0000-4000-8000-000000000001',false)$q$,'missing PDF object');
reset role;
insert into storage.objects(bucket_id,name) values('issue-files','elementary/color.pdf');
set role authenticated;
select publish_revision('30000000-0000-4000-8000-000000000001',false);
select publish_revision('30000000-0000-4000-8000-000000000001',false);
reset role;

set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
select test_assert((select count(*) from edition_payloads)=3,'reader sees published editions');
select test_assert((select count(*) from storage.objects)=6,'reader sees six published files');
select test_assert((select count(*) from issue_revisions)=0,'reader cannot see editorial metadata');
reset role;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
select test_assert((select count(*) from edition_payloads)=0,'inactive reader denied');
reset role;

select test_reject($q$update edition_payloads set payload='{}' where edition='elementary'$q$,'immutable published payload');
select test_reject($q$delete from issue_files where edition='elementary'$q$,'immutable published PDFs');

set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select test_reject($q$select revise_revision('30000000-0000-4000-8000-000000000001',
  'wrong','elementary','{}','Correction')$q$,'optimistic concurrency');
select revise_revision('30000000-0000-4000-8000-000000000001',
  admin_revision('30000000-0000-4000-8000-000000000001')->>'fingerprint',
  'elementary',(admin_revision('30000000-0000-4000-8000-000000000001')->'payloads'->0),
  'Synthetic edit test; requires revalidation');
reset role;
select test_assert((select count(*) from issue_revisions)=2,'edit creates revision');
select test_assert((select count(*) from edition_payloads)=6,'clones all three editions');
select test_assert((select count(*) from issue_files)=6,'no stale PDFs cloned');
select test_assert((select bool_and(review_result->>'pass'='false') from edition_payloads
  where revision_id<>'30000000-0000-4000-8000-000000000001'),'new reviews invalidated');
select test_assert((select current_revision_id='30000000-0000-4000-8000-000000000001' from issues),'prior issue retained');
set role authenticated;
select test_reject($q$select publish_revision((select id from issue_revisions where revision_no=2),false)$q$,'unreviewed revision blocked');
select test_reject($q$select revise_revision('30000000-0000-4000-8000-000000000001',
  admin_revision('30000000-0000-4000-8000-000000000001')->>'fingerprint',
  'elementary','{}','Stale')$q$,'old base revision blocked');
reset role;
select test_reject($q$update edition_payloads set revision_id='30000000-0000-4000-8000-000000000001'
  where revision_id<>'30000000-0000-4000-8000-000000000001' and edition='elementary'$q$,'move into published rejected');
select 'PASS: anonymous/reader/admin, missing JSON/storage, immutable publication, revision invalidation' as result;
