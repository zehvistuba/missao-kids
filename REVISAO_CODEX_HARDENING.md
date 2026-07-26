# Revisão técnica — hardening residual de RPCs

## Veredito

Recomendo fechar os dois itens em um único patch de ACL, `supabase_hardening_grants.sql`. `get_family_id_by_email(text)` é **P2** no cenário comprovado, e retirar `anon` das três `admin_*` é defesa em profundidade de baixo risco. Aplicaria o patch **antes do QA Chrome**, para que o QA cubra o estado final, mas nenhum dos dois itens é, isoladamente, bloqueador de segurança do beta pago.

O patch deve ter FASE 0 e FASE 2 fora de transação, mas eu colocaria os `REVOKE`/`GRANT` da FASE 1 em uma transação curta. Embora não alterem dados, ACLs afetam disponibilidade: sem atomicidade, uma falha entre o `REVOKE` e o `GRANT` de `service_role` pode interromper o webhook.

## Confirmação da evidência

1. **Confirmada, com uma correção menor.** `supabase_final_deploy.sql:32-46` define `get_family_id_by_email(text)` como `SECURITY DEFINER`, filtra o alvo por `role IN ('parent','admin')` e não autoriza o chamador. `supabase_hotmart.sql:5-19` contém outra definição sem gate, mas filtra apenas `role = 'parent'` e não fixa `search_path`. O único chamador encontrado no repositório é `supabase/functions/hotmart-webhook/index.ts:93-94`; o client usado ali é criado com `SERVICE_ROLE_KEY` em `:25` e `:64-66`. Não há chamada dessa RPC em `src/App.jsx`.
2. **Parcialmente confirmada.** O fix P0 revoga apenas `PUBLIC` e concede `authenticated` nas três funções (`supabase_fix_p0_admin_escalation.sql:293-294`, `:327-328` e `:352-353`). O repositório não contém a ACL viva nem um `ALTER DEFAULT PRIVILEGES` que prove grant direto a `anon`; portanto, o alcance efetivo de produção precisa ser confirmado por `proacl`/`has_function_privilege` na FASE 0. Além disso, default privileges não “reconcedem” acesso depois de um `REVOKE`: eles são aplicados no momento do `CREATE`. Como o P0 faz `DROP`/`CREATE`, um default grant direto a `anon` pode ter sido aplicado na criação e não é removido por `REVOKE ... FROM PUBLIC`. Se `has_function_privilege('anon', ...)` está `true`, revogar `anon` explicitamente é correto.

## A) Severidade de `get_family_id_by_email`

**P2.** A RPC permite enumeração por lista de e-mails candidatos: `NULL` versus UUID confirma que o e-mail pertence a um responsável/admin cadastrado e expõe um identificador estável de tenant. Isso tem impacto de confidencialidade e facilita reconhecimento para ataques seguintes, sobretudo sem autenticação ou rate limit.

Não classifico como P1 porque o UUID de família não é, por si só, credencial ou autorização; no cenário informado, RLS/gates ainda impedem ler ou alterar os dados da família. A rotina também não lista contas: o atacante precisa fornecer cada e-mail candidato. Deve subir para P1 se algum endpoint aceitar esse UUID como autorização, se houver IDOR encadeável, ou se a ACL viva revelar exposição de dados adicional.

## B) Fix da RPC e `service_role`

**Concordo** com:

```sql
REVOKE ALL ON FUNCTION public.get_family_id_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_id_by_email(text)
  TO service_role;
```

O estado resultante é idempotente. O `GRANT` explícito a `service_role` é necessário: `service_role` tem `BYPASSRLS`, mas não é superuser nem owner por definição, e `BYPASSRLS` não concede `EXECUTE` em funções. Ao remover o grant herdado de `PUBLIC`, não se deve depender de default privileges ou de ACL implícita.

Não há efeito colateral esperado no webhook: ele chama a RPC pelo client autenticado com a service key e continuará com `EXECUTE`. PostgREST verifica a ACL no runtime; não é preciso mudar nem fazer deploy da Edge Function. Após aplicar, convém fazer um smoke do fallback por e-mail e confirmar que a chave configurada realmente produz role `service_role`.

## C) `anon` nas três `admin_*`

**Concordo em revogar `anon` e manter `authenticated`.** O gate `is_platform_admin() IS NOT TRUE` já impede o ataque, portanto isso não corrige uma exploração viva, mas reduz superfície, ruído e dependência de uma única barreira dentro de funções `SECURITY DEFINER`. O painel chama as RPCs como usuário autenticado, então `authenticated` deve permanecer com `EXECUTE`; a autorização fina continua sendo o gate interno.

Também reaplicaria `REVOKE ... FROM PUBLIC` no patch para declarar o estado desejado, mesmo já tendo sido feito no P0. `has_function_privilege('anon', ...) = false` na FASE 2 é a prova importante, pois considera grants diretos, `PUBLIC` e herança de roles.

## D) Empacotamento e transação

**Um único patch.** Os quatro ajustes pertencem ao mesmo hardening de ACL, têm o mesmo procedimento de aplicação/verificação e devem ser testados juntos. Separar aumenta a chance de drift sem trazer isolamento útil.

Minha única divergência é deixar a FASE 1 fora de transação. `REVOKE`/`GRANT` são transacionais no Postgres; uma transação curta entrega o novo estado de forma atômica. FASE 0 deve rodar e ser revisada antes de `BEGIN`; FASE 2 deve rodar após `COMMIT`.

O patch não deve alterar default privileges neste momento: isso teria alcance sobre funções futuras e exigiria inventário próprio. Porém, qualquer migração futura que faça `DROP`/`CREATE` dessas RPCs precisa reaplicar as ACLs; `CREATE OR REPLACE` normalmente preserva a ACL existente.

### Esboço de `supabase_hardening_grants.sql`

```sql
-- RotinUp — hardening residual de EXECUTE em RPCs
-- Rodar FASE 0, revisar; depois FASE 1; por fim FASE 2.

-- ============================================================================
-- FASE 0 — DIAGNÓSTICO (não altera estado)
-- ============================================================================

WITH targets(signature) AS (
  VALUES
    ('public.get_family_id_by_email(text)'),
    ('public.admin_get_families()'),
    ('public.admin_set_plan(uuid,text)'),
    ('public.admin_delete_family(uuid)')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS oid
  FROM targets
)
SELECT
  r.signature,
  r.oid IS NOT NULL AS existe,
  p.proowner::regrole AS owner,
  p.prosecdef AS security_definer,
  p.proacl AS acl
FROM resolved r
LEFT JOIN pg_proc p ON p.oid = r.oid
ORDER BY r.signature;

WITH targets(signature) AS (
  VALUES
    ('public.get_family_id_by_email(text)'),
    ('public.admin_get_families()'),
    ('public.admin_set_plan(uuid,text)'),
    ('public.admin_delete_family(uuid)')
), roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), resolved AS (
  SELECT signature, to_regprocedure(signature) AS oid
  FROM targets
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

-- Mostra defaults explícitos para novas funções no schema public.
SELECT
  d.defaclrole::regrole AS owner_role,
  CASE WHEN d.defaclnamespace = 0 THEN '(todos os schemas)'
       ELSE d.defaclnamespace::regnamespace::text
  END AS schema_name,
  d.defaclacl AS default_acl
FROM pg_default_acl d
WHERE d.defaclobjtype = 'f'
  AND d.defaclnamespace IN (0, 'public'::regnamespace)
ORDER BY owner_role;

-- STOP se qualquer uma das quatro assinaturas estiver ausente ou divergente.

-- ============================================================================
-- FASE 1 — ACLs (atômica e idempotente)
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.get_family_id_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_family_id_by_email(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_families()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_plan(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_family(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_families()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_plan(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_family(uuid)
  TO authenticated;

COMMIT;

-- ============================================================================
-- FASE 2 — VERIFICAÇÃO (esperado: ok=true em todas as linhas)
-- ============================================================================

WITH checks(role_name, signature, esperado) AS (
  VALUES
    ('anon',          'public.get_family_id_by_email(text)', false),
    ('authenticated', 'public.get_family_id_by_email(text)', false),
    ('service_role',  'public.get_family_id_by_email(text)', true),
    ('anon',          'public.admin_get_families()',         false),
    ('authenticated', 'public.admin_get_families()',         true),
    ('anon',          'public.admin_set_plan(uuid,text)',     false),
    ('authenticated', 'public.admin_set_plan(uuid,text)',     true),
    ('anon',          'public.admin_delete_family(uuid)',     false),
    ('authenticated', 'public.admin_delete_family(uuid)',     true)
), results AS (
  SELECT
    role_name,
    signature,
    esperado,
    to_regprocedure(signature) AS oid,
    CASE WHEN to_regprocedure(signature) IS NULL THEN NULL
         ELSE has_function_privilege(
           role_name,
           to_regprocedure(signature),
           'EXECUTE'
         )
    END AS obtido
  FROM checks
)
SELECT
  role_name,
  signature,
  esperado,
  obtido,
  (oid IS NOT NULL AND obtido IS NOT DISTINCT FROM esperado) AS ok
FROM results
ORDER BY signature, role_name;
```

## E) Prioridade e beta pago

Aplicaria **antes do QA Chrome**, seguido de: (1) FASE 2 toda verde; (2) smoke do fallback do webhook com `service_role`; e (3) smoke do painel administrativo com o dono autenticado. Assim o QA valida a configuração que irá para o beta.

Não é bloqueador de segurança do beta pago nas premissas atuais: a exposição é P2 e as `admin_*` já negam `anon` no gate provado em runtime. Mesmo assim, como o patch é pequeno e o risco operacional é controlável, recomendo fechá-lo antes da abertura do beta em vez de carregar uma enumeração anônima conhecida. Isso é prioridade de release, não reabertura do P0.

## F) Commit dos artefatos P0

**Sim, recomendo commitar agora na branch `fix/p0-admin-escalation`, sem merge/push.** O SQL aplicado em produção continuar untracked cria risco de perda, `git clean`, divergência entre produção e repositório e ausência de trilha auditável. Um commit local dá ponto de restauração e revisão; não equivale a backup remoto, portanto o risco de perda do disco só será resolvido quando houver push autorizado.

O commit deve ser seletivo, após revisão de segredos: no mínimo `supabase_fix_p0_admin_escalation.sql`, `REVISAO_CODEX_P0.md` e o registro correspondente em `CONTROLE_EVOLUCOES.md`; `HANDOFF_P0_CODEX.md` pode entrar se for mantido como evidência histórica. Não usar `git add .` e não incluir automaticamente `.mcp.json`, `.env.local` ou arquivos locais não relacionados. O hardening residual e seu parecer podem ficar em um commit separado do P0 para preservar a fronteira histórica entre o incidente já corrigido e a defesa em profundidade.

## Decisão final

- `get_family_id_by_email(text)`: **P2**, corrigir por ACL exclusiva de `service_role`.
- `service_role`: **precisa de `GRANT EXECUTE` explícito** após retirar `PUBLIC`; webhook preservado.
- três `admin_*`: **revogar `anon`**, manter `authenticated` e o gate interno.
- empacotamento: **um patch**, com diagnóstico/verificação fora e mudanças dentro de transação curta.
- ordem: **antes do QA Chrome**, sem reabrir P0 e sem bloquear sozinho o beta pago.
- Git: **commitar seletivamente os artefatos P0 na branch atual**, sem merge/push.

Esta revisão apenas especifica o patch; nenhum SQL foi aplicado e nenhum deploy foi realizado.
