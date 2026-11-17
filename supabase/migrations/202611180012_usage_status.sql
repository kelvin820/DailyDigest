-- Reflect the durable call ledger in the job summary without exposing credentials.
create function update_job_cost_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update generation_jobs set cost_status=case
    when exists(select 1 from model_reservations where job_id=NEW.job_id and status='usage_unknown') then 'usage_unknown'
    when exists(select 1 from model_reservations where job_id=NEW.job_id and status='pending') then 'pending'
    when exists(select 1 from model_reservations where job_id=NEW.job_id and not known_price) then 'cost_unknown'
    else 'estimated' end,updated_at=now() where id=NEW.job_id;
  return NEW;
end $$;
create trigger job_cost_status after insert or update of status on model_reservations
  for each row execute function update_job_cost_status();
