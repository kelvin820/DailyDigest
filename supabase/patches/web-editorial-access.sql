-- Idempotent, narrow server-only grants for the web editor document store.
-- Apply separately to the existing project; schema migration history is unchanged.
-- Does not recreate tables, change RLS, or grant browser roles any access.
begin;
grant usage on schema public to service_role;
grant select, insert, update on table public.app_settings to service_role;
commit;
