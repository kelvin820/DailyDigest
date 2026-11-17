-- Durable state tests run only in the isolated test database.
create table test_job_state(name text primary key,data jsonb);
set request.jwt.claim.role='service_role';
insert into test_job_state values('first',start_issue_job('2026-11-18',
  '40000000-0000-4000-8000-000000000001',
  array['a','b','c','d','e','f','g','h'],'test-facts',
  '{"usd":0.001,"inputRate":1,"outputRate":1,"maxCalls":3,"maxTokens":2000}',true,false));
select test_assert((select (data->>'acquired')::boolean from test_job_state where name='first'),'first lease acquired');
select test_assert((start_issue_job('2026-11-18','40000000-0000-4000-8000-000000000002',
  array['a','b','c','d','e','f','g','h'],'test-facts',
  '{"usd":999,"maxCalls":999,"maxTokens":999999}',true,false)->>'acquired')::boolean=false,'duplicate runner refused');
select test_assert((select usd_limit=0.001 from daily_usage where issue_date='2026-11-18'),'resume cannot raise budget');
select save_generation_step((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000001',
  '{"stage":"write-0","story_id":"a","edition":"elementary","input_hash":"input","output_hash":"output","status":"success","output":{"body":"synthetic checkpoint"}}');
update generation_jobs set lease_expires_at=now()-interval '1 second' where issue_date='2026-11-18';
select test_reject($q$select heartbeat_job((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000001')$q$,'expired heartbeat cannot revive lease');
select claim_lease((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',120);
select test_reject($q$select save_generation_step((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000001','{"stage":"write-0","input_hash":"x","status":"success"}')$q$,'old owner cannot commit');
select test_assert(read_generation_step((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002','write-0','a','elementary')->'output'->>'body'='synthetic checkpoint',
  'new runner reuses prior output');
insert into test_job_state values('ticket',reserve_model_call(
  (select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',100,400));
select settle_model_call((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',(select (data->>'id')::uuid from test_job_state where name='ticket'),null);
select test_assert((select reserved_usd=0.0005 and calls=1 and tokens=500 from daily_usage where issue_date='2026-11-18'),
  'unknown billing stays reserved');
insert into test_job_state values('settled-ticket',reserve_model_call(
  (select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',10,10));
select settle_model_call((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',(select (data->>'id')::uuid from test_job_state where name='settled-ticket'),
  '{"input_tokens":15,"output_tokens":10}');
select settle_model_call((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',(select (data->>'id')::uuid from test_job_state where name='settled-ticket'),
  '{"input_tokens":15,"output_tokens":10}');
select test_assert((select calls=2 and tokens=525 and spent_usd=0.000025 and reserved_usd=0.0005
  from daily_usage where issue_date='2026-11-18'),'settlement is durable and idempotent');
select test_reject($q$select reserve_model_call((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002',500,501)$q$,'budget stops before next spend');
select record_job_error((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002','SYNTHETIC_TEST_STOP');
select test_assert((select budget->>'lastError'='SYNTHETIC_TEST_STOP' from generation_jobs where issue_date='2026-11-18'),'failure reason is durable');
select release_job((select (data->>'job_id')::uuid from test_job_state where name='first'),
  '40000000-0000-4000-8000-000000000002','needs_attention');
select test_reject($q$select start_issue_job('2026-11-18','40000000-0000-4000-8000-000000000003',
  array['a','b','c','d','e','f','g','h'],'test-facts','{"usd":999,"maxCalls":999,"maxTokens":999999}',true,false)$q$,
  'automatic catchup must not retry uncertain billing without review');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
set role authenticated;
select test_assert(acknowledge_model_usage((select (data->>'job_id')::uuid from test_job_state where name='first'),
  'Synthetic provider review; retry permitted but reservations preserved')=1,'unknown call acknowledged');
reset role;
set request.jwt.claim.role='service_role';
insert into test_job_state values('resumed',start_issue_job('2026-11-18',
  '40000000-0000-4000-8000-000000000003',array['a','b','c','d','e','f','g','h'],'test-facts',
  '{"usd":999,"maxCalls":999,"maxTokens":999999}',true,false));
select test_assert((select data->>'job_id' from test_job_state where name='resumed')=
  (select data->>'job_id' from test_job_state where name='first'),'resume keeps same job');
select test_assert((select calls=2 and spent_usd=0.000025 and reserved_usd=0.0005 from daily_usage where issue_date='2026-11-18'),
  'resume cannot reset counters');
select test_reject($q$select start_issue_job('2026-11-18','40000000-0000-4000-8000-000000000003',
  array['a','b','c','d','e','f','g','h'],'changed-facts','{}',true,false)$q$,'changed facts require new revision');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
select test_assert((select count(*) from daily_usage)=0,'reader cannot see usage');
select test_assert((select count(*) from model_reservations)=0,'reader cannot see call ledger');
select test_reject($q$select claim_lease('00000000-0000-4000-8000-000000000000',
  '40000000-0000-4000-8000-000000000001',120)$q$,'reader cannot acquire lease');
reset role;
select 'PASS: lease expiry/takeover, checkpoint reuse, daily caps, unknown billing, cross-run recovery' as result;
