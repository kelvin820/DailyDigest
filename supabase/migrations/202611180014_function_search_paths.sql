-- Explicit pg_temp placement prevents temporary tables from shadowing trusted
-- application relations inside security-definer RPCs. Auth schema is managed by Supabase.
do $$declare fn record;begin
  for fn in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
      'is_member','is_admin','revision_is_published','protect_published','prohibit_published_insert',
      'publish_revision','claim_lease','commit_step','consume_admin_action','update_publishing',
      'admin_revision','revise_revision_text','revise_revision','approve_reviewed_revision',
      'require_job_lease','start_issue_job','heartbeat_job','release_job','read_generation_step',
      'save_generation_step','reserve_model_call','settle_model_call','stage_revision_artifacts',
      'mark_job_published','record_family_trial','configure_publishing','update_job_cost_status',
      'has_unacknowledged_usage','acknowledge_model_usage','record_job_error'])
  loop execute format('alter function %s set search_path = public, pg_temp',fn.signature); end loop;
end $$;
