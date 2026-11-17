set request.jwt.claim.role='service_role';
insert into test_job_state values('intake',start_issue_job('2026-11-21',
  '40000000-0000-4000-8000-000000000001',array[]::text[],'intake:test-registry',
  '{"usd":2,"maxCalls":100,"maxTokens":200000}',true,false));
select test_assert((select (data->>'acquired')::boolean from test_job_state where name='intake'),'intake has a lease before model work');
select bind_issue_facts((select (data->>'job_id')::uuid from test_job_state where name='intake'),
  '40000000-0000-4000-8000-000000000001',array['a','b','c','d','e','f','g','h'],'frozen-source-facts');
select release_job((select (data->>'job_id')::uuid from test_job_state where name='intake'),
  '40000000-0000-4000-8000-000000000001','needs_attention');
select test_assert((start_issue_job('2026-11-21','40000000-0000-4000-8000-000000000002',array[]::text[],
  'intake:test-registry','{"usd":2,"maxCalls":100,"maxTokens":200000}',true,false)->>'job_id')=
  (select data->>'job_id' from test_job_state where name='intake'),'intake resumes after facts are bound');
select test_reject($q$select bind_issue_facts((select (data->>'job_id')::uuid from test_job_state where name='intake'),
  '40000000-0000-4000-8000-000000000002',array['a','b','c','d','e','f','g','h'],'other-facts')$q$,'frozen facts cannot change');
select test_assert((select cost_status='usage_unknown' from generation_jobs where issue_date='2026-11-18'),'job exposes unknown billing');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
set role authenticated;
select test_reject($q$select configure_publishing('auto')$q$,'auto refused before trials');
select test_reject($q$select update_publishing('auto',3)$q$,'cannot supply an invented trial count');
select test_reject($q$select record_family_trial((select (data->>'revision_id')::uuid from test_job_state where name='intake'),'not published')$q$,'draft cannot be a trial');
select test_assert(record_family_trial('30000000-0000-4000-8000-000000000001','Synthetic local DB test; not actual family use')=1,'one distinct trial day');
select test_assert(record_family_trial('30000000-0000-4000-8000-000000000001','Repeat synthetic record')=1,'repeated revision does not add a day');
select test_assert(record_family_trial((select (data->>'revision_id')::uuid from test_job_state where name='stage'),'Second synthetic test day')=2,'second distinct day');
select test_reject($q$select configure_publishing('auto')$q$,'two trials are insufficient');
select configure_publishing('review');
reset role;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
select test_assert((select count(*) from family_trials)=0,'reader cannot see family notes');
select test_reject($q$select configure_publishing('review')$q$,'reader cannot set publishing');
reset role;
select 'PASS: intake recovery, frozen facts, honest billing, real-date trial gate, reader privacy' as result;
