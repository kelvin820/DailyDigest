create or replace function consume_admin_action(action_name text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() or action_name is null or action_name not in ('dispatch','revise','approve','settings','trial') then raise exception 'Forbidden'; end if;
  insert into admin_action_limits(user_id,action_name,last_at) values(auth.uid(),consume_admin_action.action_name,now())
    on conflict on constraint admin_action_limits_pkey do update set last_at=now()
      where admin_action_limits.last_at<now()-interval '30 seconds';
  return found;
end $$;
