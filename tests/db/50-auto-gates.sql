-- Additional synthetic days exist only inside this throwaway database.
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into issues(id,issue_date) values
  ('20000000-0000-4000-8000-000000000020','2026-11-20'),
  ('20000000-0000-4000-8000-000000000022','2026-11-22');
insert into issue_revisions(id,issue_id,revision_no,status,story_order,gate_report)
  select v.new_id,v.issue_id,1,'ready',r.story_order,'{"pass":true,"mode":"live","needs_human":true}'::jsonb
    from issue_revisions r cross join (values
      ('30000000-0000-4000-8000-000000000020'::uuid,'20000000-0000-4000-8000-000000000020'::uuid),
      ('30000000-0000-4000-8000-000000000022'::uuid,'20000000-0000-4000-8000-000000000022'::uuid)) v(new_id,issue_id)
    where r.id='30000000-0000-4000-8000-000000000001';
insert into edition_payloads(revision_id,edition,payload,content_hash,prompt_version,review_result)
  select r.id,p.edition,p.payload||jsonb_build_object('issueDate',i.issue_date),'synthetic-hash-'||p.edition,'synthetic-test-only','{"pass":true}'
    from issue_revisions r join issues i on i.id=r.issue_id cross join test_payloads p
    where r.id in ('30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000022');
insert into issue_files(revision_id,edition,print_mode,storage_path,template_version,content_hash,pages,validated)
  select r.id,p.edition,mode,p.edition||'/'||mode||'.pdf','1.0','synthetic-hash-'||p.edition,2,true
    from issue_revisions r cross join test_payloads p cross join unnest(array['color','ink']) mode
    where r.id in ('30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000022');
set role authenticated;
select approve_reviewed_revision('30000000-0000-4000-8000-000000000020',
  admin_revision('30000000-0000-4000-8000-000000000020')->>'fingerprint');
select test_assert(record_family_trial('30000000-0000-4000-8000-000000000020','Third synthetic local-only trial')=3,'three actual distinct rows required');
select configure_publishing('auto');
reset role;
set request.jwt.claim.role='service_role';
select test_reject($q$select publish_revision('30000000-0000-4000-8000-000000000022',true)$q$,'sensitive content held in auto');
update issue_revisions set gate_report='{"pass":true,"mode":"live","needs_human":false}'
  where id='30000000-0000-4000-8000-000000000022';
select publish_revision('30000000-0000-4000-8000-000000000022',true);
select test_assert((select current_revision_id='30000000-0000-4000-8000-000000000022' from issues
  where issue_date='2026-11-22'),'approved auto transaction publishes');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
select test_reject($q$select publish_revision('30000000-0000-4000-8000-000000000022',true)$q$,'reader cannot invoke automatic publisher');
reset role;
select 'PASS: third-day trial gate, automatic publication, sensitive hold, role checks' as result;
