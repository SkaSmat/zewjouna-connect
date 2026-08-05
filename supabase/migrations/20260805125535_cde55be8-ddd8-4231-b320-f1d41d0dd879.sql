-- 1. Lock every app function down: no anonymous execution.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.oid NOT IN (SELECT objid FROM pg_depend WHERE deptype = 'e' AND classid = 'pg_proc'::regclass)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 2. Re-grant only what the signed-in app actually calls.
GRANT EXECUTE ON FUNCTION public.get_candidates_adaptive(integer, integer, integer, integer, integer, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmatch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_report_status(uuid, report_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_photo(uuid, integer) TO authenticated;

-- Helpers used inside RLS policies must stay callable by the policy evaluator.
GRANT EXECUTE ON FUNCTION public.are_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_message(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_matched(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.array_intersect(text[], text[]) TO authenticated;

-- Server-only: rate limiting is driven by trusted server code.
GRANT EXECUTE ON FUNCTION public.rl_take(text, integer, integer) TO service_role;

-- 3. PostGIS reference table: readable, never writable through the API.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS spatial_ref_sys_read ON public.spatial_ref_sys';
  EXECUTE 'CREATE POLICY spatial_ref_sys_read ON public.spatial_ref_sys FOR SELECT TO anon, authenticated USING (true)';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'spatial_ref_sys not owned by this role; skipping';
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.spatial_ref_sys FROM anon, authenticated;