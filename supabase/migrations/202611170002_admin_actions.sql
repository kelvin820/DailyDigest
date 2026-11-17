create table admin_action_limits(user_id uuid not null,action_name text not null,last_at timestamptz not null,primary key(user_id,action_name));
alter table admin_action_limits enable row level security;
create function consume_admin_action(action_name text) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'Forbidden';end if;
 insert into admin_action_limits(user_id,action_name,last_at) values(auth.uid(),action_name,now())
 on conflict(user_id,action_name) do update set last_at=now() where admin_action_limits.last_at<now()-interval '30 seconds';
 return found;
end$$;
revoke all on function consume_admin_action(text) from public,anon;
grant execute on function consume_admin_action(text) to authenticated;
-- Changing publishing mode requires three actual trial issues, never DEMO fixtures.
create function update_publishing(mode text,trial_count int) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() or mode not in ('review','auto') or trial_count<0 then raise exception 'Forbidden';end if;
 if mode='auto' and trial_count<3 then raise exception 'Three trial issues required';end if;
 update app_settings set value=jsonb_build_object('mode',mode,'live_enabled',false,'trial_issues',trial_count),updated_by=auth.uid(),updated_at=now() where key='publishing';
end$$;
revoke all on function update_publishing(text,int) from public,anon;
grant execute on function update_publishing(text,int) to authenticated;

