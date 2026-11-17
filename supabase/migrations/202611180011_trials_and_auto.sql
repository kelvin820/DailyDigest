create table family_trials(
  revision_id uuid primary key references issue_revisions,recorded_by uuid not null references auth.users,
  notes text not null check(length(trim(notes)) between 1 and 2000),recorded_at timestamptz not null default now()
);
alter table family_trials enable row level security;
create policy admin_read on family_trials for select to authenticated using(is_admin());
create function record_family_trial(target uuid,notes text) returns int
language plpgsql security definer set search_path=public as $$
declare count_days int;
begin
  if not is_admin() or length(trim(notes)) not between 1 and 2000 or notes is null then raise exception 'Forbidden'; end if;
  perform 1 from issue_revisions where id=target and status='published' and gate_report->>'mode'='live';
  if not found or (select count(*) from edition_payloads where revision_id=target and payload->>'isDemo'='false')<>3
    then raise exception 'An actual published live revision is required'; end if;
  insert into family_trials(revision_id,recorded_by,notes) values(target,auth.uid(),record_family_trial.notes)
    on conflict(revision_id) do update set notes=excluded.notes,recorded_by=excluded.recorded_by,recorded_at=now();
  select count(distinct i.issue_date) into count_days from family_trials t
    join issue_revisions r on r.id=t.revision_id join issues i on i.id=r.issue_id where r.status='published';
  update app_settings set value=jsonb_set(value,'{trial_issues}',to_jsonb(count_days)),
    updated_by=auth.uid(),updated_at=now() where key='publishing';
  return count_days;
end $$;
create function configure_publishing(target_mode text) returns void
language plpgsql security definer set search_path=public as $$
declare count_days int;
begin
  if not is_admin() or target_mode is null or target_mode not in ('review','auto') then raise exception 'Forbidden'; end if;
  select count(distinct i.issue_date) into count_days from family_trials t
    join issue_revisions r on r.id=t.revision_id join issues i on i.id=r.issue_id where r.status='published';
  if target_mode='auto' and count_days<3 then raise exception 'Three trial issues required'; end if;
  update app_settings set value=jsonb_build_object('mode',target_mode,'live_enabled',target_mode='auto','trial_issues',count_days),
    updated_by=auth.uid(),updated_at=now() where key='publishing';
end $$;
revoke all on function update_publishing(text,int) from authenticated;
revoke all on function record_family_trial(uuid,text),configure_publishing(text) from public,anon;
grant execute on function record_family_trial(uuid,text),configure_publishing(text) to authenticated;
