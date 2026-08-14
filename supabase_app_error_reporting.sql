-- RotinUp - application error reporting (idempotent)
-- Apply in Supabase SQL Editor before publishing the matching frontend.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('automatic', 'user')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  role TEXT,
  source TEXT NOT NULL,
  action TEXT,
  screen TEXT,
  error_name TEXT,
  message TEXT NOT NULL,
  stack_hash TEXT,
  app_version TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS app_error_reports_user_key_uidx
  ON public.app_error_reports (user_id, report_key)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_error_reports_status_seen_idx
  ON public.app_error_reports (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS app_error_reports_family_idx
  ON public.app_error_reports (family_id, last_seen_at DESC)
  WHERE family_id IS NOT NULL;

ALTER TABLE public.app_error_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_error_reports FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sanitize_app_error_text(p_value TEXT, p_max_length INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_value TEXT := COALESCE(p_value, '');
  v_limit INTEGER := greatest(1, least(COALESCE(p_max_length, 500), 1000));
BEGIN
  v_value := regexp_replace(v_value, '[[:cntrl:]]', ' ', 'g');
  v_value := regexp_replace(v_value, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[email]', 'gi');
  v_value := regexp_replace(v_value, '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', '[id]', 'gi');
  v_value := regexp_replace(v_value, 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]{10,}', '[token]', 'g');
  v_value := regexp_replace(v_value, '[A-Za-z0-9_-]{32,}', '[token]', 'g');
  v_value := regexp_replace(v_value, '[0-9]([ -]?[0-9]){12,18}', '[payment]', 'g');
  v_value := regexp_replace(v_value, '[0-9]{3}[. -]?[0-9]{3}[. -]?[0-9]{3}[-. ]?[0-9]{2}', '[document]', 'g');
  v_value := regexp_replace(v_value, '[(]?[0-9]{2}[)]?[ .-]?[0-9]{4,5}[ .-]?[0-9]{4}', '[phone]', 'g');
  v_value := regexp_replace(v_value, '[0-9]{6,}', '[number]', 'g');
  RETURN left(trim(v_value), v_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_app_error_text(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_app_error(
  p_report_key TEXT,
  p_kind TEXT,
  p_source TEXT,
  p_action TEXT,
  p_screen TEXT,
  p_error_name TEXT,
  p_message TEXT,
  p_stack_hash TEXT,
  p_app_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_family_id UUID;
  v_role TEXT;
  v_report_id UUID;
  v_last_seen TIMESTAMPTZ;
  v_new_reports INTEGER;
  v_daily_reports INTEGER;
  v_message TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria';
  END IF;

  -- Data minimization: closed reports live for 90 days; unresolved reports for 180.
  DELETE FROM public.app_error_reports r
   WHERE (r.status IN ('resolved', 'ignored') AND r.last_seen_at < now() - interval '90 days')
      OR (r.status = 'open' AND r.last_seen_at < now() - interval '180 days');

  IF p_report_key IS NULL OR p_report_key !~ '^[0-9a-f]{16,64}$' THEN
    RAISE EXCEPTION 'Chave de reporte invalida';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('automatic', 'user') THEN
    RAISE EXCEPTION 'Tipo de reporte invalido';
  END IF;
  IF length(COALESCE(p_source, '')) NOT BETWEEN 1 AND 80
     OR length(COALESCE(p_action, '')) > 80
     OR length(COALESCE(p_screen, '')) > 80
     OR length(COALESCE(p_error_name, '')) > 60
     OR length(COALESCE(p_stack_hash, '')) > 64
     OR length(COALESCE(p_app_version, '')) > 40 THEN
    RAISE EXCEPTION 'Contexto de reporte invalido';
  END IF;
  IF p_source !~ '^[a-z0-9._:/-]+$'
     OR COALESCE(p_action, '') !~ '^[a-z0-9._:/-]*$'
     OR COALESCE(p_screen, '') !~ '^[a-z0-9._:/-]*$'
     OR COALESCE(p_error_name, '') !~ '^[a-z0-9._:/-]*$'
     OR COALESCE(p_stack_hash, '') !~ '^[0-9a-f]*$'
     OR COALESCE(p_app_version, '') !~ '^[A-Za-z0-9._+-]*$' THEN
    RAISE EXCEPTION 'Formato de contexto invalido';
  END IF;

  v_message := public.sanitize_app_error_text(p_message, 500);
  IF length(v_message) < 3 THEN
    RAISE EXCEPTION 'Descricao muito curta';
  END IF;

  SELECT p.family_id, p.role::TEXT
    INTO v_family_id, v_role
    FROM public.profiles p
   WHERE p.id = v_user_id;

  -- One lock per user serializes both deduplication and per-user quotas.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT r.id, r.last_seen_at
    INTO v_report_id, v_last_seen
    FROM public.app_error_reports r
   WHERE r.user_id = v_user_id
     AND r.report_key = p_report_key
   FOR UPDATE;

  IF FOUND THEN
    IF v_last_seen <= now() - interval '30 seconds' THEN
      UPDATE public.app_error_reports
         SET occurrences = occurrences + 1,
             last_seen_at = now(),
             status = 'open',
             resolved_at = NULL,
             resolved_by = NULL
       WHERE id = v_report_id;
    END IF;
  ELSE
    SELECT
      count(*) FILTER (WHERE r.first_seen_at >= now() - interval '1 hour'),
      count(*)
      INTO v_new_reports, v_daily_reports
      FROM public.app_error_reports r
     WHERE r.user_id = v_user_id
       AND r.first_seen_at >= now() - interval '1 day';

    IF v_new_reports >= 20 OR v_daily_reports >= 50 THEN
      RAISE EXCEPTION 'Limite de reportes atingido. Tente novamente mais tarde.';
    END IF;

    INSERT INTO public.app_error_reports (
      report_key, kind, user_id, family_id, role, source, action, screen,
      error_name, message, stack_hash, app_version
    ) VALUES (
      p_report_key,
      p_kind,
      v_user_id,
      v_family_id,
      v_role,
      p_source,
      p_action,
      p_screen,
      p_error_name,
      v_message,
      lower(p_stack_hash),
      p_app_version
    )
    RETURNING id INTO v_report_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reportId', v_report_id,
    'reference', upper(right(replace(v_report_id::TEXT, '-', ''), 8))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_get_error_reports(
  p_status TEXT DEFAULT 'open',
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  report_id UUID,
  reference TEXT,
  report_kind TEXT,
  family_id UUID,
  user_role TEXT,
  source TEXT,
  action TEXT,
  screen TEXT,
  error_name TEXT,
  message TEXT,
  stack_hash TEXT,
  app_version TEXT,
  occurrences INTEGER,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  report_status TEXT,
  resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'Status invalido';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    upper(right(replace(r.id::TEXT, '-', ''), 8)),
    r.kind,
    r.family_id,
    r.role,
    r.source,
    r.action,
    r.screen,
    r.error_name,
    r.message,
    r.stack_hash,
    r.app_version,
    r.occurrences,
    r.first_seen_at,
    r.last_seen_at,
    r.status,
    r.resolved_at
  FROM public.app_error_reports r
  WHERE r.status = p_status
  ORDER BY r.last_seen_at DESC
  LIMIT greatest(1, least(COALESCE(p_limit, 100), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_error_reports(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_error_reports(TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_update_error_report(
  p_report_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'Status invalido';
  END IF;

  UPDATE public.app_error_reports
     SET status = p_status,
         resolved_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END,
         resolved_by = CASE WHEN p_status = 'open' THEN NULL ELSE auth.uid() END
   WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte nao encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_error_report(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_error_report(UUID, TEXT) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Verification: expected RLS=true, no direct authenticated grants, 3 RPC rows.
SELECT c.relrowsecurity AS rls_enabled
FROM pg_class c
WHERE c.oid = 'public.app_error_reports'::regclass;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'app_error_reports';

SELECT p.oid::regprocedure AS signature, p.prosecdef, p.proconfig, p.proacl
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('report_app_error', 'platform_get_error_reports', 'platform_update_error_report')
ORDER BY p.proname;
