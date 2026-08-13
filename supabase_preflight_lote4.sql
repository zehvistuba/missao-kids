-- RotinUp - preflight somente-leitura para o lote pre-venda v4.
-- Execute no SQL Editor e salve a saida antes de qualquer migration.

BEGIN TRANSACTION READ ONLY;

SELECT
  now() AS captured_at,
  current_database() AS database_name,
  current_user AS executed_by,
  version() AS postgres_version;

-- Snapshot das funcoes que podem ser substituidas. A coluna definition e a
-- fonte de rollback; salve o resultado completo fora do SQL Editor.
SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS security_definer,
  p.proconfig AS runtime_config,
  p.proacl AS acl,
  pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_family',
    'add_child',
    'join_family_by_code',
    'process_hotmart_event',
    'claim_premium_by_email'
  )
ORDER BY p.proname, identity_arguments;

-- O deploy deve parar se houver overload inesperado nas tres RPCs do app.
SELECT
  p.proname,
  count(*) AS overload_count,
  array_agg(pg_get_function_identity_arguments(p.oid) ORDER BY p.oid) AS signatures
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_family', 'add_child', 'join_family_by_code')
GROUP BY p.proname
ORDER BY p.proname;

-- create_family depende de unicidade real para resolver colisao sem TOCTOU.
SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint c
WHERE c.conrelid = 'public.families'::regclass
  AND c.contype = 'u'
  AND pg_get_constraintdef(c.oid) ILIKE '%invite_code%';

-- Estrutura atual do log e existencia da tabela nova em reaplicacoes.
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('hotmart_events', 'hotmart_entitlements')
ORDER BY table_name, ordinal_position;

-- Contagens sem PII para reconciliar antes/depois.
SELECT
  (SELECT count(*) FROM public.families) AS families_count,
  (SELECT count(*) FROM public.profiles) AS profiles_count,
  (SELECT count(*) FROM public.hotmart_events) AS hotmart_events_count,
  (SELECT count(*) FROM public.families WHERE plan = 'premium') AS premium_families_count,
  (SELECT count(*) FROM public.families WHERE plan = 'free') AS free_families_count;

SELECT
  plan,
  max_co_parents,
  count(*) AS families_count
FROM public.families
GROUP BY plan, max_co_parents
ORDER BY plan, max_co_parents;

-- RLS e policies relevantes.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('families', 'profiles', 'hotmart_events', 'hotmart_entitlements');

SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('families', 'profiles', 'hotmart_events', 'hotmart_entitlements')
ORDER BY tablename, policyname;

COMMIT;
