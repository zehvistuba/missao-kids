# Fonte de Verdade SQL - RotinUp

Este arquivo define quais artefatos podem ser usados em producao. O banco vivo
continua sendo a autoridade final; antes de aplicar qualquer patch, salve a
definicao atual das funcoes afetadas e execute a verificacao incluida no script.

## Contrato de produto

| Regra | Free | Premium |
|---|---:|---:|
| Filhos | 1 | 10 |
| Responsaveis | 1 | 10 |
| Missoes ativas | 5 | Ilimitadas |
| Recompensas ativas | 3 | Ilimitadas |
| IA por dia | 40 | 200 |

A mesma definicao usada pelo frontend esta em `src/config/product.js`.

## Aplicado e provado em producao

| Area | Artefato vigente |
|---|---|
| Criacao de familia | `supabase_fix_create_family.sql` |
| Anti-escalada/admin | `supabase_fix_p0_admin_escalation.sql` |
| ACL das RPCs criticas | `supabase_hardening_grants.sql` |
| Consentimento e exclusao | `supabase_fix_pre_venda_lote2.sql` |
| Cronometro | `supabase_cronometro_cumulativo.sql` + `supabase_cronometro_concluir.sql` |
| Rate limit da IA | `supabase_ia_rate_limit.sql` |

As provas e hashes conhecidos ficam em `CONTROLE_EVOLUCOES.md`.

## Preparado, ainda nao aplicado

Aplicar nesta ordem, com QA entre as etapas:

1. `supabase_harden_create_family.sql`
2. `supabase_fix_plan_limits_canonical.sql`
3. `supabase_app_error_reporting.sql`
4. `supabase_fix_hotmart_idempotency.sql`
5. Deploy de `supabase/functions/hotmart-webhook`
6. Deploy de `supabase/functions/delete-account`

Antes da etapa 1, execute `supabase_preflight_lote4.sql` e siga
`DEPLOY_PRE_VENDA.md`. A nova Edge Function Hotmart tambem exige allowlist
`HOTMART_PRODUCT_IDS` ou `HOTMART_PRODUCT_UCODES`; sem isso ela falha fechado.

Nenhum desses itens deve ser marcado como fechado apenas porque o arquivo foi
criado. Fechamento exige SQL/deploy, verificacao e teste black-box.

## Historico - nao executar

Os demais `supabase_*.sql` na raiz sao registros incrementais. Varios redefinem
a mesma funcao com contratos antigos. Em especial, nao reaplique:

- `supabase_admin.sql`: neutralizado; a versao antiga reabria o gate de admin.
- `supabase_plan_limits.sql`: limite Premium antigo de 20.
- `supabase_recovery_and_limits.sql`: limites/defaults antigos.
- `supabase_chrome_pendentes.sql`: patch historico de QA.
- `supabase_fix_security_p0p1_part2.sql`: contem `add_child` antigo com limite 20.
- `supabase_final_deploy.sql`: snapshot historico, nao e um deploy cumulativo atual.
- `supabase_LIVE_reference.sql`: referencia de auditoria, declara divergencia do vivo.

## Procedimento obrigatorio

1. Diagnosticar o banco vivo em somente leitura.
2. Comparar assinatura, corpo, owner, `search_path`, ACL, RLS e policies.
3. Aplicar um unico patch transacional.
4. Rodar a verificacao do proprio patch.
5. Recarregar o schema do PostgREST quando indicado.
6. Executar QA de API e UI com contas descartaveis.
7. Registrar evidencia em `CONTROLE_EVOLUCOES.md`.
