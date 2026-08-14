# Runbook de Publicacao Pre-Venda

Status: preparado em 2026-08-13. Nenhuma etapa deste documento prova que o lote foi publicado.

## 1. Gate de entrada

Interrompa antes de publicar se qualquer item estiver ausente:

- Branch revisada e `npm run check` verde.
- `npm audit --omit=dev --audit-level=high` sem vulnerabilidade alta/critica.
- Backup/exportacao recente do Supabase e responsavel pelo rollback disponivel.
- Saida completa de `supabase_preflight_lote4.sql` salva com data/hora.
- Uma unica assinatura para `create_family(text)`, `add_child(text,integer,text,date)` e `join_family_by_code(text)`.
- Constraint `UNIQUE` de `families.invite_code` confirmada.
- ID numerico ou `ucode` oficial do produto RotinUp obtido no payload Hotmart 2.0.0.
- Novo Hottok forte disponivel, sem ser gravado no repositorio ou neste documento.
- Contas descartaveis: Free, Premium, co-responsavel e duas familias isoladas.
- Deploy anterior do frontend e das duas Edge Functions identificado para rollback.

## 2. Variaveis obrigatorias

Configure os segredos da Edge Function `hotmart-webhook` antes de publicar a nova versao:

- `HOTMART_HOTTOK`: segredo oficial rotacionado.
- `HOTMART_PRODUCT_IDS`: IDs numericos permitidos, separados por virgula; ou
- `HOTMART_PRODUCT_UCODES`: `ucode`s permitidos, separados por virgula.
- `SERVICE_ROLE_KEY`: chave de servico existente no ambiente.
- `ALLOW_LEGACY_HOTTOK_QUERY`: ausente ou `false`.
- `VITE_APP_VERSION`: opcional; use o SHA do deploy. Na Vercel, o build usa `VERCEL_GIT_COMMIT_SHA` como fallback.

Ao menos uma allowlist de produto e obrigatoria. Sem ela, o webhook falha fechado com HTTP 500. Nunca use o codigo da pagina de checkout (`E105936971D`) como `product.id` sem confirmar no payload oficial.

## 3. Ordem de publicacao

Execute uma etapa por vez e pare ao primeiro resultado divergente:

1. Rodar e salvar `supabase_preflight_lote4.sql`.
2. Aplicar `supabase_harden_create_family.sql`; exigir todos os booleanos finais verdadeiros.
3. Smoke API de `create_family`: criar, validar campos e excluir a conta descartavel.
4. Aplicar `supabase_fix_plan_limits_canonical.sql`; exigir quatro verificacoes finais verdadeiras.
5. Smoke de limites Free, Premium, convite expirado e concorrencia no ultimo slot.
6. Aplicar `supabase_app_error_reporting.sql`; confirmar RLS, ausencia de grants diretos e as tres RPCs com ACL esperada.
7. Smoke autenticado de reporte manual, deduplicacao e rate limit; provar que usuario comum nao lista nem atualiza reportes.
8. Aplicar `supabase_fix_hotmart_idempotency.sql`; conferir tabela, RPC e ACL finais.
9. Configurar os segredos/allowlist e publicar `hotmart-webhook` sem verificacao JWT da plataforma, pois a autenticacao e o header `X-HOTMART-HOTTOK`.
10. Publicar `delete-account` mantendo verificacao JWT.
11. Executar toda a secao Hotmart de `QA_PRE_VENDA_LOTE3.md` antes do frontend.
12. Publicar o frontend e executar smoke publico em mobile e desktop.
13. Executar QA autenticado completo, fila administrativa de erros e regressao K1-K10.
14. Registrar hashes, horario, operador, respostas e decisao em `CONTROLE_EVOLUCOES.md`.

## 4. Criterios de parada

Pare e inicie rollback se ocorrer qualquer um destes casos:

- Uma migration nao termina em transacao confirmada ou sua verificacao retorna falso.
- Contagens de familias/perfis diminuem sem que o teste tenha criado e removido esses dados.
- `anon` ou `authenticated` obtiver `EXECUTE` em `process_hotmart_event`.
- Evento com Hottok incorreto ou produto fora da allowlist alterar plano.
- Evento repetido gerar novo efeito; evento antigo sobrescrever evento novo.
- Cancelamento de assinatura remover Premium antes de `date_next_charge`.
- Reembolso ou chargeback nao remover o ultimo direito imediatamente.
- Exclusao de conta remover familia que deveria ter sucessor, ou deixar login ativo apos resposta de sucesso.
- Erro P0/P1 novo no QA autenticado.
- Usuario comum conseguir ler a tabela ou executar as RPCs `platform_*`.
- Reporte armazenar email, documento, telefone, token ou stack trace bruto.

## 5. Rollback

Rollback de aplicacao:

1. Suspender temporariamente o webhook Hotmart no painel para impedir novos efeitos durante a reversao.
2. Restaurar o deploy anterior do frontend.
3. Republicar as versoes anteriores de `hotmart-webhook` e `delete-account` a partir do commit conhecido.
4. Restaurar `create_family`, `add_child`, `join_family_by_code` e `claim_premium_by_email` usando exatamente as definicoes capturadas pelo preflight.
5. Reaplicar as ACLs capturadas e executar `NOTIFY pgrst, 'reload schema';`.
6. Nao apagar colunas, eventos ou `hotmart_entitlements` durante rollback emergencial. Estruturas aditivas podem permanecer sem serem usadas e preservam evidencia financeira.
7. Reconciliar manualmente cada evento recebido durante a janela e confirmar `families.plan` antes de reativar o webhook.

Se a migration SQL falhar antes do `COMMIT`, nao execute DDL compensatorio: a transacao deve ter revertido o bloco. Investigue primeiro.

## 6. Evidencia minima

Para declarar o lote publicado, registre:

- SHA do commit e IDs dos deploys.
- Resultado do preflight e de cada verificacao SQL.
- Configuracao das variaveis apenas como `presente/ausente`, nunca os valores.
- Matriz QA com PASS/FAIL/BLOCKED e conta/papel usado.
- Um evento Hotmart aprovado, duplicado, antigo, cancelado com carencia, reembolsado e de produto rejeitado.
- Resultado da exclusao para unico dono e dono com sucessor.
- Horario inicial/final e decisao GO/NO-GO.
