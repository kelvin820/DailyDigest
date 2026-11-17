set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
set role authenticated;
create temporary table site_members(user_id uuid,role text,active boolean);
insert into site_members values('10000000-0000-4000-8000-000000000002','admin',true);
select public.test_assert(not public.is_admin(),'temporary membership must not spoof admin');
create temporary table issue_revisions(id uuid,status text);
insert into issue_revisions values('00000000-0000-4000-8000-000000000000','published');
select public.test_assert(not public.revision_is_published('00000000-0000-4000-8000-000000000000'),
  'temporary revision table is not trusted');
select public.test_reject($q$select public.configure_publishing('auto')$q$,'spoofed admin cannot set mode');
reset role;
drop table pg_temp.site_members;
drop table pg_temp.issue_revisions;
select 'PASS: security-definer search path resists temporary relation shadowing' as result;
