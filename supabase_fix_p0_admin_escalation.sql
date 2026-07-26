-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — FIX P0: Escalada de privilégio no signup (auto-admin) + PII leak
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-07-26   (v3 — trata os achados do gate de produção da FASE 0)
-- Autor: Claude Code (executor backend), sob coordenação do Codex.
--
-- CAUSA RAIZ (provada por API black-box em produção):
--   1) handle_new_user() copiava raw_user_meta_data->>'role' verbatim para
--      profiles.role. signUp({ data:{ role:'admin' } }) => profiles.role='admin'.
--   2) As RPCs admin_* e a policy de hotmart_events confiavam em profiles.role
--      ='admin' — coluna que o passo (1) deixava auto-atribuível. Resultado:
--      qualquer conta nova virava admin e admin_get_families() vazou 6 famílias
--      + 6 emails reais. (UPDATE direto de role já é barrado por
--      trg_protect_profile_columns; o único furo era o signup.)
--
-- MUDANÇAS DA v2 (após revisão Codex):
--   • Detector de admin_* agora é FAIL-CLOSED: aborta se sobrar qualquer admin_*
--     (overload ou nome desconhecido) sem is_platform_admin().
--   • FASE 0 ampliada: mostra corpos/owner/proconfig/ACL, policies+RLS, roles,
--     conta dona, FKs de auth.users, corpo vivo de admin_set_plan.
--   • hotmart_events: ENABLE RLS idempotente.
--   • FASE 1 essencial roda em TRANSAÇÃO (BEGIN/COMMIT) — tudo-ou-nada.
--   • REVOKE ... FROM PUBLIC + GRANT explícito; backfill com ON CONFLICT.
--   • search_path=pg_catalog,public no gate; gate usa IS NOT TRUE (fail-closed).
--   • Varredura corretiva pega lower(trim(role))='admin'.
--   • DELETE de contas QA REMOVIDO deste patch (era destrutivo e fora do P0).
--
-- MUDANÇAS DA v3 (após FASE 0 em produção, 2026-07-26):
--   • Remove explicitamente, sem CASCADE, as RPCs legadas observadas
--     admin_get_all_families() e admin_set_admin_by_email(text). A segunda era
--     SECURITY DEFINER, executável por anon e não tinha gate de autorização.
--   • FAIL-CLOSED agora exige o conjunto EXATO das 3 assinaturas admin_*
--     aprovadas, mesmo que uma função extra mencione is_platform_admin().
--   • Remove a policy service_hotmart_all (PERMISSIVE/ALL/USING false), que não
--     ampliava acesso, mas impediria V4 de mostrar somente a policy endurecida.
--   • Faz cast explícito do role sanitizado para public.user_role; a coluna viva
--     é enum e o handle_new_user anterior também fazia esse cast.
--
-- MUDANÇAS DA v3.1 (revisão Claude + decisões do dono, 2026-07-26):
--   • Backfill (bloco 3): adicionado o MESMO cast ::public.user_role que faltava
--     (sem ele, um órfão qualquer abortaria a transação).
--   • admin_set_plan: PREMIUM=10 (igual ao vivo), NÃO 20 (decisão do dono).
--   • admin_get_families (bloco 4): PRESERVAR contrato vivo — aplicar o corpo vivo
--     do 0a trocando só o gate (o CREATE no arquivo é referência reduzida).
--
-- ⚠️ ANTES DE APLICAR (condições de GO da revisão Codex):
--   1. Rodar a FASE 0 e CONFERIR:
--      - antes do fix só existem as 5 assinaturas revisadas em 0a: as 3 alvo e
--        as 2 legadas que o bloco 1b remove; nenhum overload/nome adicional;
--      - RLS on em hotmart_events e nenhuma policy permissiva alternativa (0b);
--      - existe UM único admin pretendido, e é o dono (0c);
--      - distribuição de role sem lixo inesperado (0d);
--      - a conta dona zehvistuba@gmail.com existe e é única (0e);
--      - corpo vivo de admin_set_plan e valor FREE de max_co_parents (0g).
--   2. Se a FASE 0 revelar overload/admin_* extra, endureça-o AQUI antes de rodar
--      a FASE 1 (senão a FASE 1 aborta de propósito — fail-closed).
--   3. Confirmar o email do dono na constante da função (bloco 1).
--   4. admin_set_plan assume FREE => max_co_parents=1 [★]: só aplicar se a FASE 0
--      confirmar (havia divergência 1 vs 2 no repo).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 0 — DIAGNÓSTICO (rode PRIMEIRO; não altera nada; guarde os resultados)
-- ═══════════════════════════════════════════════════════════════════════════

-- 0a. Todas as admin_* + is_platform_admin: assinatura exata, owner, secdef,
--     search_path (proconfig), ACL e DEFINIÇÃO COMPLETA.
--     prokind IN ('f','p'): pg_get_functiondef falha em agregado/window; filtramos
--     para a query não quebrar, e a 0a2 abaixo revela qualquer admin_* de outro tipo.
SELECT
  p.oid::regprocedure                       AS assinatura,
  p.prokind                                 AS tipo,
  p.proowner::regrole                       AS owner,
  p.prosecdef                               AS security_definer,
  p.proconfig                               AS settings,
  p.proacl                                  AS acl,
  pg_get_functiondef(p.oid)                 AS definicao
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND (p.proname LIKE 'admin\_%' OR p.proname = 'is_platform_admin')
  AND p.prokind IN ('f','p')
ORDER BY p.proname, assinatura;

-- 0a2. Qualquer admin_* que NÃO seja função/procedure (esperado: 0 linhas).
SELECT p.oid::regprocedure AS assinatura, p.prokind AS tipo
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'admin\_%'
  AND p.prokind NOT IN ('f','p');

-- 0b. hotmart_events: TODAS as policies (permissive/roles/cmd/qual) + RLS ligado?
SELECT policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'hotmart_events'
ORDER BY policyname;

SELECT relrowsecurity AS rls_ligado, relforcerowsecurity AS rls_forcado
FROM pg_class WHERE oid = 'public.hotmart_events'::regclass;

-- 0c. Admins atuais (ANTES da varredura) — guarde como evidência.
--     role::text: robusto caso profiles.role seja enum (trim não aceita enum).
SELECT p.id, u.email, p.role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(trim(p.role::text)) = 'admin'
ORDER BY u.email;

-- 0d. Distribuição de role (revela valores-lixo herdados do handle_new_user antigo).
SELECT role, count(*) AS qtd
FROM public.profiles
GROUP BY role
ORDER BY qtd DESC;

-- 0e. Prova da conta dona (deve retornar EXATAMENTE 1 linha).
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE lower(email) = 'zehvistuba@gmail.com';

-- 0f. FKs que referenciam auth.users (para decidir a limpeza QA em separado).
--     confdeltype: a=no action, r=restrict, c=cascade, n=set null, d=set default.
SELECT conname, conrelid::regclass AS tabela, confrelid::regclass AS referencia, confdeltype
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'auth.users'::regclass
ORDER BY tabela;

-- 0g. admin_set_plan vivo + regra de max_co_parents (validar o FREE=1 [★]).
SELECT pg_get_functiondef(p.oid) AS admin_set_plan_vivo
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'admin_set_plan';

SELECT column_default AS max_co_parents_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'families'
  AND column_name = 'max_co_parents';

SELECT plan, max_co_parents, count(*) AS qtd
FROM public.families
GROUP BY plan, max_co_parents
ORDER BY plan, max_co_parents;


-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1 — FIX (TRANSACIONAL: tudo-ou-nada). Rode como bloco único.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. is_platform_admin(): allowlist por email (fonte de verdade do admin) ──
--   SECURITY DEFINER p/ ler auth.users. STABLE. Não depende de profiles.role.
--   Hardening futuro (recomendado pelo Codex): trocar email por UUID imutável do
--   dono, obtido na FASE 0 (0e). Mantido email por decisão de produto.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'zehvistuba@gmail.com'   -- ← dono/admin de plataforma
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon;  -- anon: policy eval retorna false


-- ── 1b. Remover RPCs admin legadas reveladas pela FASE 0 ───────────────────
--   Somente as assinaturas exatas observadas são removidas. Sem CASCADE: uma
--   dependência inesperada aborta a transação em vez de ser removida junto.
--   admin_get_all_families() duplicava a leitura global de famílias.
--   admin_set_admin_by_email(text) permitia a anon promover qualquer email.
DROP FUNCTION IF EXISTS public.admin_get_all_families();
DROP FUNCTION IF EXISTS public.admin_set_admin_by_email(TEXT);


-- ── 2. handle_new_user(): sanitiza role. NUNCA aceita 'admin' do cliente ─────
--   Só 'child' (após trim/lower) vira child; qualquer outra coisa (vazio, null,
--   'admin', 'ADMIN', ' Admin ', JSON aninhado, chave alternativa, malformado)
--   vira 'parent'. Preserva display_name e ON CONFLICT do corpo original.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := CASE
    WHEN lower(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '')) = 'child' THEN 'child'
    ELSE 'parent'
  END;

  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      split_part(NEW.email, '@', 1)
    ),
    v_role::public.user_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
-- (o trigger on_auth_user_created continua apontando para esta função; não recriar)


-- ── 3. Backfill de órfãos com a MESMA regra de sanitização ───────────────────
--   Nunca gera admin. ON CONFLICT protege contra corrida com signup concorrente.
--   Exclui contas de teste de QA e o diagtest para não recriá-las.
INSERT INTO public.profiles (id, display_name, role)
SELECT
  au.id,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'display_name'), ''),
    split_part(au.email, '@', 1)
  ),
  (CASE
    WHEN lower(NULLIF(TRIM(au.raw_user_meta_data->>'role'), '')) = 'child' THEN 'child'
    ELSE 'parent'
  END)::public.user_role   -- enum: mesmo cast do handle_new_user (v2/v3 o omitia aqui)
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
  AND lower(au.email) NOT LIKE '%@rotinup-qa.test'
  AND lower(au.email) <> 'diagtest_delete@test.invalid'
ON CONFLICT (id) DO NOTHING;


-- ── 4. admin_get_families(): gate via is_platform_admin() (fail-closed) ──────
--   DECISÃO DO DONO: contrato e consulta vivos preservados integralmente;
--   somente o gate de autorização foi trocado por is_platform_admin().
DROP FUNCTION IF EXISTS public.admin_get_families();
CREATE FUNCTION public.admin_get_families()
RETURNS TABLE (
  family_id    UUID,
  family_name  TEXT,
  invite_code  TEXT,
  plan         TEXT,
  created_at   TIMESTAMPTZ,
  member_count BIGINT,
  parent_name  TEXT,
  parent_email TEXT,
  children     JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    f.id                              AS family_id,
    f.name                            AS family_name,
    f.invite_code,
    f.plan,
    f.created_at,
    COUNT(p.id)                       AS member_count,
    MAX(CASE WHEN p.role = 'parent' THEN p.display_name END) AS parent_name,
    MAX(CASE WHEN p.role = 'parent' THEN u.email END)         AS parent_email,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',           p.id,
          'name',         p.display_name,
          'role',         p.role,
          'kidcoins',     p.kidcoins,
          'streak',       p.streak,
          'avatar_emoji', p.avatar_emoji
        )
      ) FILTER (WHERE p.id IS NOT NULL),
      '[]'::jsonb
    )                                 AS children
  FROM public.families f
  LEFT JOIN public.profiles p ON p.family_id = f.id
  LEFT JOIN auth.users u ON u.id = p.id AND p.role = 'parent'
  GROUP BY f.id, f.name, f.invite_code, f.plan, f.created_at
  ORDER BY f.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_families() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_families() TO authenticated;


-- ── 5. admin_set_plan(): gate via is_platform_admin() ────────────────────────
--   [★] FASE 0 confirmou: FREE=1 e PREMIUM=10 no corpo vivo. Mantido igual ao
--   vivo (decisão do dono: hotfix não muda produto). NÃO usar 20.
DROP FUNCTION IF EXISTS public.admin_set_plan(UUID, TEXT);
CREATE FUNCTION public.admin_set_plan(p_family_id UUID, p_plan TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_plan NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido — use "free" ou "premium"';
  END IF;

  UPDATE public.families
     SET plan           = p_plan,
         max_co_parents = CASE WHEN p_plan = 'premium' THEN 10 ELSE 1 END  -- [★] igual ao vivo
   WHERE id = p_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_plan(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_plan(UUID, TEXT) TO authenticated;


-- ── 6. admin_delete_family(): gate via is_platform_admin() ───────────────────
DROP FUNCTION IF EXISTS public.admin_delete_family(UUID);
CREATE FUNCTION public.admin_delete_family(p_family_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  DELETE FROM public.families WHERE id = p_family_id;  -- CASCADE remove dependentes

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_family(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_family(UUID) TO authenticated;


-- ── 7. FAIL-CLOSED: conjunto exato + gate em TODA admin_* ───────────────────
--   Aborta se existir qualquer assinatura além das 3 aprovadas, inclusive uma
--   extra que já mencione is_platform_admin(), ou se uma das 3 perder o gate.
--   Também cobre overloads e objetos admin_* de outro prokind.
DO $$
DECLARE
  unexpected text;
  ungated text;
BEGIN
  SELECT string_agg(
           '  - ' || p.oid::regprocedure::text,
           E'\n' ORDER BY p.oid::regprocedure::text
         )
    INTO unexpected
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname LIKE 'admin\_%'
     AND p.oid NOT IN (
       to_regprocedure('public.admin_get_families()'),
       to_regprocedure('public.admin_set_plan(uuid,text)'),
       to_regprocedure('public.admin_delete_family(uuid)')
     );

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION E'FAIL-CLOSED: assinatura(s) admin_* inesperada(s):\n%', unexpected;
  END IF;

  SELECT string_agg(
           '  - ' || p.oid::regprocedure::text,
           E'\n' ORDER BY p.oid::regprocedure::text
         )
    INTO ungated
    FROM pg_proc p
   WHERE p.oid IN (
       to_regprocedure('public.admin_get_families()'),
       to_regprocedure('public.admin_set_plan(uuid,text)'),
       to_regprocedure('public.admin_delete_family(uuid)')
     )
     AND pg_get_functiondef(p.oid) NOT ILIKE '%is_platform_admin%';

  IF ungated IS NOT NULL THEN
    RAISE EXCEPTION E'FAIL-CLOSED: funcao(oes) admin_* sem is_platform_admin:\n%', ungated;
  END IF;
END $$;


-- ── 8. hotmart_events: garantir RLS ligado + policy via is_platform_admin() ──
--   ⚠️ policies permissivas de SELECT combinam por OR. Confirme na FASE 0 (0b)
--   que NÃO há outra policy de leitura permissiva; se houver, remova/endureça.
ALTER TABLE public.hotmart_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_hotmart_all" ON public.hotmart_events;
DROP POLICY IF EXISTS "Admins can view hotmart events" ON public.hotmart_events;
CREATE POLICY "Admins can view hotmart events"
  ON public.hotmart_events
  FOR SELECT
  USING (public.is_platform_admin());


-- ── 9. Varredura corretiva de admins ilegítimos ──────────────────────────────
--   Demove todo role admin (incl. 'ADMIN'/' Admin ') cujo email != dono.
--   Roda como 'postgres' no SQL Editor -> trg_protect_profile_columns não barra.
UPDATE public.profiles p
   SET role = 'parent'
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(trim(p.role::text)) = 'admin'   -- ::text: robusto a enum
   AND lower(u.email) IS DISTINCT FROM 'zehvistuba@gmail.com';

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2 — VERIFICAÇÃO (rode após o COMMIT; resultados esperados nos comentários)
-- ═══════════════════════════════════════════════════════════════════════════

-- V1. is_platform_admin: existe, secdef, e search_path fixo.  (esperado: 1 linha)
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'is_platform_admin';

-- V2. handle_new_user sanitiza role.  (esperado: sanitiza=true, sem_role_cru=true)
SELECT
  pg_get_functiondef(oid) ILIKE '%= ''child'' THEN ''child''%' AS sanitiza,
  pg_get_functiondef(oid) NOT ILIKE '%NULLIF(TRIM(NEW.raw_user_meta_data->>''role''), ''''),%'
    AS sem_role_cru
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'handle_new_user';

-- V3. Smoke estático: TODA admin_* menciona is_platform_admin. (esperado: 0 linhas)
--     Nota: é textual — a prova SEMÂNTICA (falso admin recebe 'Acesso negado') é
--     feita pelo qa_verify_admin_fix.py, não por esta consulta.
SELECT p.oid::regprocedure AS admin_nao_endurecida
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'admin\_%'
  AND p.prokind IN ('f','p')
  AND pg_get_functiondef(p.oid) NOT ILIKE '%is_platform_admin%';

-- V3b. Conjunto EXATO das 3 assinaturas aprovadas. (esperado: 0 linhas)
--      Reporta tanto assinatura inesperada quanto assinatura esperada ausente.
WITH expected(assinatura_esperada, oid) AS (
  VALUES
    ('admin_get_families()', to_regprocedure('public.admin_get_families()')),
    ('admin_set_plan(uuid,text)', to_regprocedure('public.admin_set_plan(uuid,text)')),
    ('admin_delete_family(uuid)', to_regprocedure('public.admin_delete_family(uuid)'))
), actual AS (
  SELECT p.oid
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname LIKE 'admin\_%'
)
SELECT COALESCE(a.oid::regprocedure::text, e.assinatura_esperada) AS assinatura,
       CASE WHEN a.oid IS NULL THEN 'ausente' ELSE 'inesperada' END AS problema
FROM actual a
FULL JOIN expected e ON e.oid = a.oid
WHERE a.oid IS NULL OR e.oid IS NULL
ORDER BY assinatura;

-- V4. Policy de hotmart_events (inclui with_check) + RLS ligado/forçado.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'hotmart_events'
ORDER BY policyname, cmd;
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class WHERE oid = 'public.hotmart_events'::regclass;   -- relrowsecurity deve ser true

-- V5. Admins ilegítimos (esperado: 0 linhas). Allowlist parametrizada; role::text robusto a enum.
WITH allowed_admin(email) AS (VALUES ('zehvistuba@gmail.com'))
SELECT u.email, p.role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(trim(p.role::text)) = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM allowed_admin a
    WHERE lower(trim(a.email)) = lower(trim(u.email))
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- OPCIONAL (NÃO faz parte do P0) — Limpeza das contas de teste de QA.
-- ⚠️ DESTRUTIVO e dependente das FKs vivas (ver FASE 0 / 0f). NÃO rodar junto.
-- Aprovar e rodar SEPARADAMENTE só após auditar 0f (owner_id sem ON DELETE pode
-- fazer este DELETE FALHAR). Os profiles QA já foram removidos por delete_my_account;
-- estes auth.users são órfãos inofensivos.
-- ---------------------------------------------------------------------------
-- DELETE FROM auth.users WHERE lower(email) LIKE '%@rotinup-qa.test';
-- ═══════════════════════════════════════════════════════════════════════════
