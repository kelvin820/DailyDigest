create table usage_acknowledgements(
  reservation_id uuid primary key references model_reservations,reviewed_by uuid not null references auth.users,
  notes text not null check(length(trim(notes)) between 1 and 1000),reviewed_at timestamptz not null default now()
);
alter table usage_acknowledgements enable row level security;
create policy admin_read on usage_acknowledgements for select to authenticated using(is_admin());
create function has_unacknowledged_usage(day date) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from model_reservations r where r.issue_date=day and r.status in ('pending','usage_unknown')
    and not exists(select 1 from usage_acknowledgements a where a.reservation_id=r.id))
$$;
revoke all on function has_unacknowledged_usage(date) from public,anon,authenticated;
grant execute on function has_unacknowledged_usage(date) to service_role;
create function acknowledge_model_usage(target_job uuid,notes text) returns int
language plpgsql security definer set search_path=public as $$
declare affected int;
begin
  if not is_admin() or notes is null or length(trim(notes)) not between 1 and 1000 then raise exception 'Forbidden'; end if;
  perform 1 from generation_jobs where id=target_job for update;
  if not found then raise exception 'Missing job'; end if;
  if exists(select 1 from generation_jobs where id=target_job and lease_expires_at>now()) then raise exception 'Job still active'; end if;
  insert into usage_acknowledgements(reservation_id,reviewed_by,notes)
    select id,auth.uid(),acknowledge_model_usage.notes from model_reservations
    where job_id=target_job and status in ('pending','usage_unknown')
    on conflict(reservation_id) do update set notes=excluded.notes,reviewed_by=excluded.reviewed_by,reviewed_at=now();
  get diagnostics affected=row_count;
  -- Keep original unknown status, counters and reservations: this permits retry, not a fabricated zero-cost settlement.
  return affected;
end $$;
revoke all on function acknowledge_model_usage(uuid,text) from public,anon;
grant execute on function acknowledge_model_usage(uuid,text) to authenticated;
create function record_job_error(job uuid,owner uuid,error_code text) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform require_job_lease(job,owner);
  update generation_jobs set budget=jsonb_set(budget,'{lastError}',to_jsonb(left(error_code,200))),updated_at=now() where id=job;
end $$;
revoke all on function record_job_error(uuid,uuid,text) from public,anon,authenticated;
grant execute on function record_job_error(uuid,uuid,text) to service_role;
