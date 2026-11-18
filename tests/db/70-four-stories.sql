-- Synthetic database contract test only; never a real news issue.
set request.jwt.claim.role='service_role';
insert into test_job_state values('four',start_issue_job('2026-12-01',
 '40000000-0000-4000-8000-000000000001',array[]::text[],'intake:four-story-test',
 '{"usd":2,"maxCalls":70,"maxTokens":150000}',true,false));
select bind_issue_facts((select (data->>'job_id')::uuid from test_job_state where name='four'),
 '40000000-0000-4000-8000-000000000001',array['demo-1','demo-2','demo-3','demo-4'],'four-test-facts');
select test_reject($q$select start_issue_job('2026-12-01','40000000-0000-4000-8000-000000000001',
 array['demo-1','demo-2','demo-3','demo-4','demo-5'],'changed',
 '{"usd":2,"maxCalls":70,"maxTokens":150000}',true,false)$q$,'five-story requests rejected');
insert into test_artifacts values('four-payloads',(select jsonb_agg(jsonb_build_object('payload',
 jsonb_set(payload||'{"issueDate":"2026-12-01","storyCount":4}', '{articles}',
 (select jsonb_agg(a order by ord) from jsonb_array_elements(payload->'articles') with ordinality x(a,ord) where ord<=4)),
 'content_hash','synthetic-four-'||edition)) from test_payloads));
insert into test_artifacts values('four-facts',(select jsonb_agg(f) from test_artifacts,jsonb_array_elements(data) with ordinality x(f,ord) where name='facts' and ord<=4));
insert into test_artifacts values('four-reviews',(select jsonb_agg(r) from test_artifacts,jsonb_array_elements(data) r where name='reviews' and r->>'storyId' in ('demo-1','demo-2','demo-3','demo-4')));
insert into test_artifacts values('four-files',(select jsonb_agg(jsonb_set(jsonb_set(f,'{storagePath}',to_jsonb('synthetic-four/'||(f->>'edition')||'-'||(f->>'mode')||'.pdf')),'{contentHash}',to_jsonb('synthetic-four-'||(f->>'edition')))) from test_artifacts,jsonb_array_elements(data) f where name='files'));
insert into storage.objects(bucket_id,name) select 'issue-files',f->>'storagePath' from test_artifacts,jsonb_array_elements(data) f where name='four-files';
select test_reject($q$select stage_revision_artifacts((select (data->>'job_id')::uuid from test_job_state where name='four'),
 '40000000-0000-4000-8000-000000000001',(select data from test_artifacts where name='four-payloads'),
 (select data from test_artifacts where name='reviews'),(select data from test_artifacts where name='four-facts'),
 (select data from test_artifacts where name='four-files'),'{"pass":true,"mode":"live","needs_human":false}')$q$,'24 reviews do not match a four-story issue');
select stage_revision_artifacts((select (data->>'job_id')::uuid from test_job_state where name='four'),
 '40000000-0000-4000-8000-000000000001',(select data from test_artifacts where name='four-payloads'),
 (select data from test_artifacts where name='four-reviews'),(select data from test_artifacts where name='four-facts'),
 (select data from test_artifacts where name='four-files'),'{"pass":true,"mode":"live","needs_human":false}');
select test_assert((select count(*) from issue_story_bundles where revision_id=(select (data->>'revision_id')::uuid from test_job_state where name='four'))=4,'four source bundles retained');
select test_assert((select current_revision_id is null from issues where issue_date='2026-12-01'),'four-story staging does not publish');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select approve_reviewed_revision((select (data->>'revision_id')::uuid from test_job_state where name='four'),
 admin_revision((select (data->>'revision_id')::uuid from test_job_state where name='four'))->>'fingerprint');
select test_assert((select current_revision_id is not null from issues where issue_date='2026-12-01'),'four-story snapshot can be approved');
select 'PASS: four-story intake, frozen count, twelve reviews, six PDFs and atomic approval' as result;
