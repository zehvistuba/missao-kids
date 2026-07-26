-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Hardening residual de EXECUTE (ACL) em RPCs
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-07-26
-- Autor: Claude Code (executor), decisão conjunta com o Codex (REVISAO_CODEX_HARDENING.md).
--
-- CONTEXTO (não reabre o P0 de escalada, já fechado/provado):
--   1) get_family_id_by_email(text) — P2. SECURITY DEFINER sem gate de chamador:
--      qualquer um passa um email e recebe o family_id (account enumeration +
--      vazamento de UUID de tenant). Único chamador legítimo é o webhook Hotmart
--      (edge function, via SERVICE_ROLE). Fix: restringir EXECUTE a service_role.
--   2) Defesa em profundidade nas 3 admin_*: mesmo com o gate is_platform_admin()
--      provado, remover EXECUTE de anon reduz superfície. authenticated permanece
--      (o painel chama como usuário autenticado dono); a autorização fina segue no gate.
--
-- NÃO-DESTRUTIVO (só REVOKE/GRANT). Idempotente. NÃO altera default privileges.
-- Ordem: rodar FASE 0 e revisar → FASE 1 (transação curta) → FASE 2 (verificação).
-- ⚠️ Se a FASE 0 mostrar assinatura ausente/divergente, PARE e ajuste antes da FASE 1.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 0 — DIAGNÓSTICO (não altera estado)
-- ═══════════════════════════════════════════════════════════════════════════

-- 0a. Existência, owner, secdef e ACL bruta (proacl) das 4 funções-alvo.
WITH targets(signature) AS (
  VALUES
    ('public.get_family_id_by_email(text)'),
    ('public.admin_get_families()'),
    ('public.admin_set_plan(uuid,text)'),
    ('public.admin_delete_family(uuid)')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS oid FROM targets
)
SELECT
  r.signature,
  r.oid IS NOT NULL         AS existe,
  p.proowner::regrole       AS owner,
  p.prosecdef               AS security_definer,
  p.proacl                  AS acl
FROM resolved r
LEFT JOIN pg_proc p ON p.oid = r.oid
ORDER BY r.signature;

-- 0b. EXECUTE efetivo por role (considera grant direto, PUBLIC e herança).
WITH targets(signature) AS (
  VALUES
    ('public.get_family_id_by_email(text)'),
    ('public.admin_get_families()'),
    ('public.admin_set_plan(uuid,text)'),
    ('public.admin_delete_family(uuid)')
), roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS oid FROM targets
)
SELECT
  r.signature,
  x.role_name,
  CASE WHEN r.oid IS NULL THEN NULL
       ELSE has_function_privilege(x.role_name, r.oid, 'EXECUTE')
  END AS execute_efetivo
FROM resolved r
CROSS JOIN roles x
ORDER BY r.signature, x.role_name;

-- 0c. Default privileges de funções no schema public (contexto; não vamos alterá-los).
SELECT
  d.defaclrole::regrole AS owner_role,
  CASE WHEN d.defaclnamespace = 0 THEN '(todos os schemas)'
       ELSE d.defaclnamespace::regnamespace::text END AS schema_name,
  d.defaclacl AS default_acl
FROM pg_default_acl d
WHERE d.defaclobjtype = 'f'
  AND d.defaclnamespace IN (0, 'public'::regnamespace)
ORDER BY owner_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 — ACLs (transação curta e atômica; idempotente)
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- (1) get_family_id_by_email: só service_role (webhook). Fecha anon/authenticated.
REVOKE ALL ON FUNCTION public.get_family_id_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_id_by_email(text)
  TO service_role;

-- (2) admin_*: remove anon (defesa em profundidade); mantém authenticated (painel).
REVOKE ALL ON FUNCTION public.admin_get_families()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_plan(uuid, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_family(uuid)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_families()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_plan(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_family(uuid)   TO authenticated;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2 — VERIFICAÇÃO (esperado: ok=true em TODAS as linhas)
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(role_name, signature, esperado) AS (
  VALUES
    ('anon',          'public.get_family_id_by_email(text)', false),
    ('authenticated', 'public.get_family_id_by_email(text)', false),
    ('service_role',  'public.get_family_id_by_email(text)', true),
    ('anon',          'public.admin_get_families()',         false),
    ('authenticated', 'public.admin_get_families()',         true),
    ('anon',          'public.admin_set_plan(uuid,text)',    false),
    ('authenticated', 'public.admin_set_plan(uuid,text)',    true),
    ('anon',          'public.admin_delete_family(uuid)',    false),
    ('authenticated', 'public.admin_delete_family(uuid)',    true)
), results AS (
  SELECT
    role_name, signature, esperado,
    to_regprocedure(signature) AS oid,
    CASE WHEN to_regprocedure(signature) IS NULL THEN NULL
         ELSE has_function_privilege(role_name, to_regprocedure(signature), 'EXECUTE')
    END AS obtido
  FROM checks
)
SELECT role_name, signature, esperado, obtido,
       (oid IS NOT NULL AND obtido IS NOT DISTINCT FROM esperado) AS ok
FROM results
ORDER BY signature, role_name;

-- Smokes pós-aplicação recomendados (fora deste SQL):
--   • Webhook Hotmart: confirmar que o fallback por email (get_family_id_by_email)
--     ainda resolve family_id com a service key.
--   • Painel admin: dono autenticado ainda lista famílias (admin_get_families).
