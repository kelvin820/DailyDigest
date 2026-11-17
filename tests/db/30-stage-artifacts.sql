set request.jwt.claim.role='service_role';
insert into test_job_state values('stage',start_issue_job('2026-11-19',
  '40000000-0000-4000-8000-000000000001',
  array['demo-1','demo-2','demo-3','demo-4','demo-5','demo-6','demo-7','demo-8'],'test-staged-facts',
  '{"usd":2,"maxCalls":100,"maxTokens":200000}',true,false));
create table test_artifacts(name text primary key,data jsonb);
insert into test_artifacts values('payloads',(select jsonb_agg(jsonb_build_object(
  'payload',payload||'{"issueDate":"2026-11-19"}', 'content_hash','synthetic-hash-'||edition)) from test_payloads));
insert into test_artifacts values('facts',(select jsonb_agg(jsonb_build_object(
  'story_id','demo-'||n,'event_key','synthetic-event-'||n,'primary_category','science','is_demo',false,
  'sources','[]'::jsonb,'sensitivity','low')) from generate_series(1,8) n));
insert into test_artifacts values('reviews',(select jsonb_agg(jsonb_build_object('storyId','demo-'||n,
  'edition',edition,'factual_status','pass','level_fit','suitable','suitability','pass',
  'publish_recommendation','pass','issues','[]'::jsonb)) from generate_series(1,8) n cross join test_payloads));
insert into test_artifacts values('files',(select jsonb_agg(jsonb_build_object('edition',edition,'mode',mode,
  'storagePath','synthetic-19/'||edition||'-'||mode||'.pdf','contentHash','synthetic-hash-'||edition,
  'templateVersion','1.0','fileHash','test-only','pages',2,'noOverflow',true,'textVerified',true,'fontsEmbedded',true))
  from test_payloads cross join unnest(array['color','ink']) mode));
insert into storage.objects(bucket_id,name) select 'issue-files',f->>'storagePath'
  from test_artifacts,jsonb_array_elements(data) f where name='files';
select test_reject($q$select stage_revision_artifacts((select (data->>'job_id')::uuid from test_job_state where name='stage'),
  '40000000-0000-4000-8000-000000000001',(select data from test_artifacts where name='payloads'),
  (select data from test_artifacts where name='reviews'),(select data from test_artifacts where name='facts'),
  '[]','{"pass":true,"mode":"live","needs_human":false}')$q$,'incomplete staged files');
select test_assert((select count(*) from edition_payloads where revision_id=
  (select (data->>'revision_id')::uuid from test_job_state where name='stage'))=0,'failed stage rolls back');
select stage_revision_artifacts((select (data->>'job_id')::uuid from test_job_state where name='stage'),
  '40000000-0000-4000-8000-000000000001',(select data from test_artifacts where name='payloads'),
  (select data from test_artifacts where name='reviews'),(select data from test_artifacts where name='facts'),
  (select data from test_artifacts where name='files'),'{"pass":true,"mode":"live","needs_human":false}');
select test_assert((select count(*) from issue_story_bundles where revision_id=
  (select (data->>'revision_id')::uuid from test_job_state where name='stage'))=8,'eight evidence references retained');
select test_assert((select current_revision_id is null from issues where issue_date='2026-11-19'),'staging does not publish');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
-- Test with a real database role as well as JWT claims.
grant select on test_job_state to authenticated;
set role authenticated;
select test_reject($q$select approve_reviewed_revision((select (data->>'revision_id')::uuid
  from test_job_state where name='stage'),'stale')$q$,'stale approval refused');
select approve_reviewed_revision((select (data->>'revision_id')::uuid from test_job_state where name='stage'),
  admin_revision((select (data->>'revision_id')::uuid from test_job_state where name='stage'))->>'fingerprint');
reset role;
select test_assert((select status='published' from generation_jobs where id=
  (select (data->>'job_id')::uuid from test_job_state where name='stage')),'publication updates job status');
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
select test_assert((select count(*) from issue_story_bundles)=0,'reader cannot inspect raw bundle references');
reset role;
select 'PASS: atomic private staging, evidence retention, snapshot approval, publication status' as result;
