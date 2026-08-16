# Controle de Evoluções — RotinUp

> Arquivo de acompanhamento vivo para decisões de produto, QA, segurança, venda e próximos passos.
> Atualize sempre que uma correção for aplicada, validada, reprovada ou enviada para QA.
> Papéis dos chats/agentes e prompts de handoff ficam em `PROTOCOLO_AGENTES.md`.

Última atualização manual: 2026-08-13 (lote de engenharia pré-venda v4 validado localmente)

---

## 1. Status Executivo

| Área | Status | Evidência / Observação |
|---|---|---|
| Segurança P0/P1 | ✅ Fechado | Anti-escalada, RLS, cross-family, push e IA fail-closed reportados como aprovados |
| Pagamento P0 | ✅ Fechado | Reconciliação + prefill reportados como resolvidos |
| IA | ✅ Fechado | Rate-limit + fail-closed reportados como aprovados |
| LGPD | ✅ Fechado | Exclusão real + consentimento versionado reportados como aprovados |
| Erros de load | ✅ Fechado | Dashboards com erro persistente reportados como aprovados |
| Sucessão de owner | ✅ Fechado | `owner_id` transferido ao excluir dono com co-responsável |
| Cronômetro | ✅ Fechado | Cumulativo + concluir reportados como aprovados |
| QA API black-box — `create_family` | ✅ Provado | Teste API em prod (2026-07-26): RPC cria família, grava `owner_id`/`family_id`/`invite_code`, bloqueia criança e duplicidade. O P0 anterior já havia sido corrigido pelo commit `31e0706` |
| **Escalada de role no signup** | ✅ Provado (aplicado em produção) | Achado 2026-07-26: `signup` aceitava `role='admin'` → `admin_get_families` vazava 6 famílias + emails. Fix v3.1 aplicado em prod; FASE 2 verde; **prova de runtime por API 10/10 PASS** (signup admin→parent, PATCH bloqueado, falso admin "Acesso negado", `is_platform_admin()=false`). SHA aplicado `7d546fb9…`. Ver §2 |
| QA UI pública/local | ✅ Parcial aprovado | Landing/auth/Termos em 390x844 e 1440x900: sem overflow, console limpo, consentimento e foco/Esc aprovados |
| QA Chrome autenticado completo | ⏳ Pendente | Exige contas Free, Premium, co-responsável e admin no ambiente alvo |
| Venda aberta | ⏳ Pendente | Requer QA sem P0/P1 + Hotmart token + domínio/Resend |

Veredito atual: **sem P0 conhecido no ambiente vivo**, com gates locais verdes. `create_family` e a escalada de privilégio (auto-admin no signup) estão provados em produção; o hardening adicional de concorrência/ACL de `create_family` está apenas preparado. Falta para o beta pago: smoke manual do admin e QA autenticado completo. Decisão final de GO/NO-GO depende dessas provas e dos deploys do lote local.

---

## 2. Bloqueadores Atuais

### P0 — Escalada de privilégio no signup: cliente vira `admin` — ✅ PROVADO/RESOLVIDO

> **Fechado 2026-07-26.** Fix v3.1 aplicado em produção (SHA `7d546fb9…`), FASE 2 verde,
> prova de runtime por API **10/10 PASS**. Detalhes abaixo mantidos como histórico.
> Pendências residuais (não bloqueiam): smoke manual do dono no painel admin;
> defesa-em-profundidade (revogar EXECUTE de anon/service_role nas RPCs — gate já bloqueia);
> P1 separado `get_family_id_by_email`.

- Fonte: QA API black-box em produção (2026-07-26), descoberto ao testar `create_family`.
- Causa: `supabase.auth.signUp(..., { data: { role } })` grava `role` a partir do `user_metadata` controlado pelo cliente. O trigger `handle_new_user` copia esse `role` para `profiles` sem sanitizar → qualquer um cria conta com `role='admin'`.
- Prova:
  - `signup` com `data.role='admin'` → `profiles.role = 'admin'` (confirmado).
  - Auto-admin chama `admin_get_families()` → retorna **6 famílias reais** com **6 emails de responsáveis** (nome, plano, contagem de filhos).
  - RLS conteve leitura direta de `families`/`profiles` de terceiros (retornou `[]`), mas as **RPCs `SECURITY DEFINER` que gateiam só por `role='admin'`** (`admin_get_families`, e potencialmente `admin_delete_family`/`admin_*`) ignoram RLS e vazam/permitem ação cross-family.
- Impacto: **vazamento de PII (LGPD)** de todas as famílias + risco de ações administrativas por usuário arbitrário. Bloqueia beta pago.
- Status: **Corrigido v2 + revisado pelo Codex (MCP) = GO com ressalvas condicionado à FASE 0 — aguardando aplicação + prova.** SQL idempotente em `supabase_fix_p0_admin_escalation.sql`; parecer em `REVISAO_CODEX_P0.md` (executor não tem `service_role`; aplicação é manual no SQL Editor pelo dono).
- Revisão Codex — endurecimentos aplicados na v2: detector de `admin_*` **fail-closed** (aborta se sobrar overload/nome desconhecido sem `is_platform_admin`); FASE 1 em transação `BEGIN/COMMIT`; `REVOKE FROM PUBLIC` + grant explícito; `ENABLE RLS` em `hotmart_events`; backfill `ON CONFLICT`; gate `IS NOT TRUE`; FASE 0 ampliada (corpos/ACL/policies/RLS/roles/conta-dona/FKs). DELETE de contas QA **removido** do patch (destrutivo/fora do P0).
- Ressalvas do Codex (o operador confirma na FASE 0 antes de rodar a FASE 1): (a) só as 3 assinaturas `admin_*` vivas; (b) RLS on + sem policy permissiva alternativa em `hotmart_events`; (c) conta dona única e comprovada (0e); (d) só 1 admin legítimo; (e) `FREE=max_co_parents=1` confere com o corpo vivo (0g).
- **Achado separado (fora do P0, para triagem):** `get_family_id_by_email(text)` é `SECURITY DEFINER` sem gate de chamador — qualquer um passa um email e recebe o `family_id`. Registrar como item próprio.
- O que o SQL faz:
  1. `handle_new_user`: só `'child'` (explícito) vira child; todo o resto (vazio/null/`admin`/malformado) vira `'parent'`. NUNCA aceita `admin` do metadata. Mesma regra no backfill de órfãos.
  2. Nova `is_platform_admin()` por **allowlist de email** (`zehvistuba@gmail.com`), independente de `profiles.role`.
  3. `admin_get_families`/`admin_set_plan`/`admin_delete_family` passam a exigir `is_platform_admin()`; detector de outras `admin_*` via `RAISE NOTICE`.
  4. Policy de `hotmart_events` passa a exigir `is_platform_admin()`.
  5. Varredura corretiva: demove todo `role='admin'` cujo email ≠ dono; purga contas de teste `@rotinup-qa.test`.
- Prova executada (2026-07-26, `qa_verify_admin_fix.py`, 10/10 PASS): signup admin→parent ✅; child→child ✅; sem role→parent ✅; PATCH `role='admin'` bloqueado ("Alteração de papel não permitida") ✅; falso admin "Acesso negado" nas 3 RPCs + ex-signup-admin ✅; `create_family` de parent OK ✅; `is_platform_admin()=false` p/ comum ✅.
- **Admin legítimo provado na fronteira RPC** (2026-07-26, no smoke do hardening): `admin_get_families()` chamado com o `sub` do dono retornou 6 famílias ✅. Falta só o smoke **visual** (dono logado renderizando o painel) — checagem de UI, não de segurança.
- Achados extras da FASE 0 em produção, já tratados no fix v3: **`admin_set_admin_by_email(text)`** era `SECURITY DEFINER` executável por `anon` **sem gate** (P0 vivo independente) → **dropado**; `admin_get_all_families()` duplicava leitura global → **dropado**; policy morta `service_hotmart_all` → removida; `profiles.role` é enum `user_role` (cast aplicado); PREMIUM=10/FREE=1 confirmados e mantidos; contrato vivo de `admin_get_families` preservado.
- Notas de revisão antes de aplicar: confirmar email do dono; `admin_set_plan` assume FREE⇒`max_co_parents=1` (rode a FASE 0 do SQL se quiser bater o corpo vivo — havia divergência de `1` vs `2` no repo).

### P0 — `create_family` indisponível via API/PostgREST — ✅ PROVADO/RESOLVIDO

- Fonte: Relatório QA API black-box em produção.
- Sintoma original: `rpc create_family({ p_family_name })` retornava `PGRST202` (cache) + `42883` (`gen_random_bytes`/pgcrypto).
- Diagnóstico (2026-07-26): a função **existe, com assinatura correta `create_family(p_family_name text)`, no cache do PostgREST**. Não era cache velho nem função ausente — o P0 já havia sido corrigido pelo commit `31e0706` (`supabase_fix_create_family.sql`, troca para `md5(random())`). Não foi necessário rodar `NOTIFY` nem recriar.
- Prova (teste API em produção, responsável novo real):
  - RPC retornou UUID da família. ✅
  - `profiles.family_id` preenchido. ✅
  - `families.owner_id = auth.uid()`, `plan='free'`, `max_co_parents=1`. ✅
  - `invite_code` gerado (`1B2D5A`), `invite_expires_at` = +72h. ✅
  - Guard nome curto → "Nome muito curto". ✅
  - Guard duplicidade → "Voce ja pertence a uma familia". ✅
  - Criança sem família → "Apenas responsaveis podem criar familia". ✅
- Contas/famílias de teste removidas (`profiles`/`families`). Restam `auth.users` órfãos (sem profile, inofensivos) para purga com `service_role`.

---

## 3. Pendências Para Beta Controlado

| Prioridade | Item | Status | Critério de aceite |
|---|---|---|---|
| P0 | Corrigir/provar `create_family` | ✅ Provado | API cria família no onboarding (teste 2026-07-26) |
| P0 | Escalada de role no signup (auto-admin) | ✅ Provado | Aplicado em prod; FASE 2 verde; API 10/10 PASS. Falta só smoke manual do dono no painel |
| P2 | `get_family_id_by_email` sem gate + defesa-em-profundidade nas admin_* | ✅ Provado (aplicado em prod) | `supabase_hardening_grants.sql` aplicado (SHA `07172e57…`); FASE 2 **9/9 ok=true**; smoke webhook via service_role **PASS** (family_id resolvido); anon sem EXECUTE em todas. `get_family_id_by_email` só `service_role` |
| P3 | Default privileges amplos (anon/authenticated/service_role em funções novas) | 🟡 Aceito/tech-debt | Toda função nova nasce com EXECUTE p/ as 3 roles; exige hardening individual OU revisar `ALTER DEFAULT PRIVILEGES` (escopo próprio). Não bloqueia |
| P1 | QA Chrome autenticado completo | ⏳ Pendente | Sem P0/P1 reais nos papéis Free, Premium, co-responsável e admin |
| P1 | Triagem final dos achados Chrome | ⏳ Pendente | Separar bug real, falso positivo e risco aceito |

---

## 4. Pendências Para Venda Aberta

| Prioridade | Item | Status | Observação |
|---|---|---|---|
| P1 Operacional | Rotacionar `HOTMART_HOTTOK` | ⏳ Pendente | Token fraco/antigo deve ser trocado no Hotmart e Supabase |
| P1 Operacional | Domínio + Resend | ⏳ Pendente | Depois religar confirmação de email no Supabase |
| P1 Legal | Identificação completa do fornecedor | ⏳ Pendente | Substituir “CNPJ em processo de abertura” por nome empresarial e CPF/CNPJ/endereço reais antes da venda aberta; exige dados do dono e revisão jurídica |
| P1 QA | QA Chrome sem P0/P1 | ⏳ Pendente | Adulto, criança, admin e cross-family |
| P2 Técnica | Modularização gradual do `App.jsx` | 🟡 Em andamento | Lint está em 0/0; contratos, modal e Supabase extraídos; dashboards ainda estão no monólito |

---

## 5. Gates de Decisão

### Gate A — Beta Pago Controlado

Pode avançar se:

- [x] `create_family` passa via API. (provado 2026-07-26)
- [x] **Escalada de role no signup (auto-admin) corrigida e provada.** (aplicada em prod + API 10/10 PASS 2026-07-26)
- [ ] QA Chrome UI completo não encontra P0/P1 real.
- [ ] Pagamento Premium está testado até ponto seguro sem compra real.
- [ ] Fluxos centrais passam: cadastro, família, filho, missão, aprovação, recompensa, resgate, cronômetro e exclusão.

Decisão esperada: **GO com ressalvas**.

### Gate B — Venda Aberta

Pode avançar se:

- [ ] Tudo do Gate A está aprovado.
- [ ] `HOTMART_HOTTOK` rotacionado.
- [ ] Domínio configurado.
- [ ] Resend/email transacional configurado.
- [ ] Confirmação de email religada e testada.
- [ ] QA regressivo final sem P0/P1.

Decisão esperada: **GO**.

---

## 6. Roadmap de Engenharia — Do Básico ao Avançado

Este é o plano de melhoria técnica e de produto para chegar em um RotinUp limpo, confiável e pronto para escala. A ordem importa: primeiro removemos bloqueadores, depois estabilizamos QA, depois limpamos código e só então sofisticamos arquitetura.

### Etapa 0 — Controle, Evidência e Disciplina

Objetivo: nunca mais perder contexto nem marcar algo como resolvido sem prova.

- Manter este arquivo como quadro mestre.
- Toda correção precisa ter evidência: SQL, build, QA, print, log ou resposta API.
- Separar claramente: bug real, falso positivo, limitação de ambiente e risco aceito.
- Registrar decisões de GO/NO-GO por gate.

Critério de pronto:

- [ ] Todo P0/P1 tem dono, status e evidência.
- [ ] Toda nova rodada de QA entra no histórico.
- [ ] Nenhum deploy importante acontece sem nota neste arquivo.

### Etapa 1 — Bloqueadores de Uso

Objetivo: garantir que qualquer usuário novo consiga entrar, criar família e usar o fluxo principal.

- Corrigir/provar `create_family` via API.
- Validar onboarding completo: cadastro, consentimento, criar família, adicionar filho.
- Validar login, logout, relogin e recuperação de sessão.
- Validar erro claro quando algo falha.

Critério de pronto:

- [ ] Usuário adulto novo cria família sem erro.
- [ ] Criança entra por código.
- [ ] Dashboard carrega ou mostra erro com tentar novamente.
- [ ] Build passa.

### Etapa 2 — Fluxos Centrais de Produto

Objetivo: garantir que o produto entrega valor sem suporte manual.

- Missões: criar, editar, arquivar, reativar, concluir, aprovar e rejeitar.
- Recompensas: criar, resgatar, aprovar, entregar, cancelar e resgatar em nome do filho.
- Cronômetro: iniciar, pausar, retomar, concluir, acumular mesma recompensa e separar recompensas diferentes.
- KidCoins/XP/streak/conquistas: validar integridade após cada ação.

Critério de pronto:

- [ ] QA Chrome passa adulto e criança sem P0/P1.
- [ ] Sem duplicação de coins em duplo clique/duas abas.
- [ ] Cronômetro passa todos os cenários.

### Etapa 3 — Segurança e Privacidade Permanente

Objetivo: manter o app seguro mesmo com usuário malicioso.

- RLS e RPCs protegendo família, papel e ownership.
- `protect_profile_columns` ativo e correto.
- IA com auth, rate-limit e fail-closed.
- Push limitado à própria família quando chamado por usuário comum.
- LGPD: consentimento versionado, exclusão real e dados de menores minimizados.

Critério de pronto:

- [ ] Probes API cross-family passam.
- [ ] Escalada de role/kidcoins/xp/family_id falha.
- [ ] Exclusão remove dados e Auth.
- [ ] Consentimento é registrado por versão.

### Etapa 4 — Pagamento e Operação de Receita

Objetivo: ninguém pagar e ficar sem Premium.

- Hotmart: compra mesmo email, email diferente e compra antes da conta.
- Reconciliação de compras órfãs.
- Cancelamento, reembolso e chargeback rebaixam plano.
- Rotacionar `HOTMART_HOTTOK`.
- Criar rotina de suporte para compra não vinculada.

Critério de pronto:

- [ ] Checkout abre oferta correta.
- [ ] Premium ativa para compra válida.
- [ ] Compra órfã é reconciliável.
- [ ] Cancelamento/reembolso volta para Free.

### Etapa 5 — UX, Acessibilidade e Confiança

Objetivo: app parecer profissional para adulto, criança e admin.

- QA mobile 390x844 e desktop.
- Modais com X, clique fora, foco e, quando possível, Esc.
- Estados vazios bons: sem filhos, sem missões, sem recompensas, sem conquistas.
- Textos claros em erros, pagamento, exclusão e LGPD.
- Botões críticos com confirmação persistente.
- Notificações, PWA e offline com feedback compreensível.

Critério de pronto:

- [ ] Nenhum texto cortado em mobile.
- [ ] Nenhuma tela vazia silenciosa.
- [ ] Exclusão/pagamento têm confirmação clara.
- [ ] Criança entende o que fazer sem explicação externa.

### Etapa 6 — Limpeza Técnica Básica

Objetivo: reduzir risco de regressão sem reescrever o app.

- Zerar erros de lint que indicam bug real ou código morto.
- Remover imports/variáveis não usados.
- Eliminar `catch {}` silenciosos em áreas importantes.
- Padronizar helpers de erro, loading e toast.
- Criar lista de smoke tests manuais.

Critério de pronto:

- [ ] `npm run build` passa local/CI.
- [ ] Lint sem erros críticos.
- [ ] Erros legados classificados: corrigir agora ou aceitar temporariamente.

### Etapa 7 — Modularização Gradual do Frontend

Objetivo: sair de `App.jsx` gigante sem quebrar produto.

- Extrair constantes e tema.
- Extrair cliente Supabase e helpers.
- Extrair componentes compartilhados: `Btn`, `Inp`, `Notif`, `LoadErrorBlock`, modais.
- Separar telas: Auth, Onboarding, ParentDash, ChildDash, Admin.
- Separar hooks de dados: família, missões, recompensas, perfil, timers.

Critério de pronto:

- [ ] Cada extração mantém build verde.
- [ ] Nenhuma mudança de comportamento sem QA.
- [ ] Arquivos ficam menores e fáceis de revisar.

### Etapa 8 — Testes Automatizados

Objetivo: evitar regressão antes de cada deploy.

- Testes unitários para helpers de data, recorrência, XP e validações.
- Testes de integração para wrappers Supabase/RPC.
- Testes E2E com Playwright para fluxos principais.
- Scripts SQL de verificação para RLS, funções e triggers.
- Smoke test pós-deploy.

Critério de pronto:

- [ ] Smoke automatizado cobre cadastro, missão, recompensa e cronômetro.
- [ ] Verificação SQL cobre funções críticas.
- [ ] Deploy só avança com checks mínimos verdes.

### Etapa 9 — Observabilidade e Suporte

Objetivo: descobrir problema antes do usuário reclamar.

- Logs estruturados nas Edge Functions.
- Painel/admin para compras órfãs e status Premium.
- Registro de falhas críticas no frontend.
- Checklist de suporte: pagamento, login, notificação, IA, exclusão.
- Métricas: cadastro completo, família criada, primeiro filho, primeira missão, upgrade.

Critério de pronto:

- [ ] Cada falha crítica tem onde investigar.
- [ ] Suporte consegue resolver compra não vinculada.
- [ ] Admin enxerga saúde mínima das famílias.

### Etapa 10 — Escala, Produto e Excelência

Objetivo: preparar venda aberta e crescimento.

- Domínio + Resend + confirmação de email.
- Política de backup/exportação.
- Performance: bundle splitting, lazy de admin/modais pesados, cache/dedup de queries.
- Design system leve.
- App Android via TWA/Play Store.
- Funil de afiliados Hotmart e materiais de venda.

Critério de pronto:

- [ ] Venda aberta sem P0/P1.
- [ ] Email transacional confiável.
- [ ] Produto testado em dispositivos reais.
- [ ] Plano de suporte e operação definido.

---

## 7. Histórico de Evoluções

| Data | Evento | Status | Evidência / Nota |
|---|---|---|---|
| 2026-06-28 | Auditoria profunda pré-venda | Concluída | Base de riscos P0/P1/P2 levantada |
| 2026-06-28 | Segurança P0/P1 | Fechada | Reportado como provado no banco vivo |
| 2026-06-28 | Pagamento P0 | Fechado | Reconciliação + prefill reportados |
| 2026-06-28 | IA fail-closed | Fechada | Rate-limit/free quota validado |
| 2026-06-28 | Lote 2 pré-venda | Fechado | Consent LGPD, load errors, sucessão owner |
| 2026-06-28 | Gap cronômetro | Fechado | Cumulativo + concluir reportados como aplicados |
| 2026-06-28 | QA API black-box | Parcial | Segurança passou; P0 `create_family` encontrado |
| 2026-07-26 | Criado controle de evoluções | Fechado | Este arquivo passa a ser o quadro mestre |
| 2026-07-26 | `create_family` reprovado→provado via API | Provado | Teste black-box em prod: cria família, guards OK; era P0 já corrigido no commit `31e0706` |
| 2026-07-26 | Escalada de role no signup (auto-admin) | Aberto (P0) | `role` do metadata vira `admin`; `admin_get_families` vazou 6 famílias + emails. Aguarda triagem Codex |
| 2026-07-26 | Fix P0 escalada de role — SQL redigido | Corrigido | `supabase_fix_p0_admin_escalation.sql`: sanitiza `handle_new_user`, cria `is_platform_admin()`, endurece RPCs `admin_*` + policy hotmart, varredura corretiva. Aguarda aplicação + prova via `qa_verify_admin_fix.py` |
| 2026-07-26 | Fix P0 escalada — revisão Codex (MCP) + v2 | Revisado | Codex revisou (`REVISAO_CODEX_P0.md`): 1ª passada NO-GO; após v2 (detector fail-closed, transação, REVOKE/grant, RLS, FASE 0 ampliada) = **GO com ressalvas condicionado à FASE 0**. Lint frontend: 35 erros legados, nada desta mudança |
| 2026-07-26 | Fix P0 escalada — refinamentos FASE 2 + enum-safe | Revisado | Codex refinou verificação (prokind, V3b fail-loud, with_check, allowlist parametrizada); `p.role::text` propagado ao 0c/sweep/V5 (robusto se role for enum); 0a blindado + 0a2. SQL revalidado coerente. Aguarda FASE 0 do dono |
| 2026-07-26 | FASE 0 rodada em produção (via Codex navegador) | Gate bloqueado→v3 | FASE 0 achou: 5 RPCs admin_* (2 legadas), sendo **`admin_set_admin_by_email(text)` ungated + anon = P0 vivo à parte**; policy `service_hotmart_all` (qual=false); `profiles.role` é enum `user_role` (v2 quebraria signups); PREMIUM vivo=10 (patch=20); contrato vivo de admin_get_families mais rico. FREE=1 confirmado; único admin=dono (UUID c998cfdb…). v3 dropa legadas, cast enum, fail-closed exato, remove policy morta |
| 2026-07-26 | Revisão Claude do v3 + decisões do dono | Autorizado | Claude achou bug (backfill sem cast enum) e corrigiu (v3.1). Dono decidiu: **preservar contrato vivo** de admin_get_families, **PREMIUM=10**, e **autorizou aplicar FASE 1 em produção**. Handoff enviado ao Codex navegador |
| 2026-07-26 | FASE 1 aplicada em produção + FASE 2 | ✅ Provado | Codex aplicou (SHA `7d546fb9…`, exit 0, sem drift); FASE 2 V1–V5 verde; 2 RPCs legadas eliminadas. Claude rodou prova de runtime por API: **10/10 PASS**. P0 escalada = PROVADO/FECHADO. Resta smoke manual do dono + P1 `get_family_id_by_email` |
| 2026-07-26 | Análise conjunta hardening residual (Codex MCP) | Decidido | Codex+Claude: `get_family_id_by_email`=**P2** (só webhook via service_role); revogar `anon` das admin_* (defesa profund.). Patch `supabase_hardening_grants.sql` (ACL, transação curta, FASE 0/2). Aplicar antes do QA Chrome; não bloqueia beta. Decidido commitar artefatos P0 na branch |
| 2026-07-26 | Commit dos artefatos na branch | Feito | 2 commits em `fix/p0-admin-escalation` (sem push/merge): `a5bc5a0` (P0) e `490c586` (hardening). Sem segredos; `.env.local` ignorado |
| 2026-07-26 | Hardening ACL aplicado + provado em prod | ✅ Provado | `supabase_hardening_grants.sql` (SHA `07172e57…`); FASE 0 confirmou anon tinha EXECUTE; FASE 2 9/9 ok=true; smoke webhook service_role PASS; admin_get_families com sub do dono retornou 6 famílias. Resta só smoke visual do dono |
| 2026-07-26 | QA Chrome UI (1ª rodada) + triagem Claude | Parcial | Segurança 100% confirmada black-box (admin_get_families/get_family_id_by_email/RLS/signup/create_family). Free core sólido. **Nenhum P0/P1 de produto.** NO-GO do Premium = ambiente (contas QA não semeadas/sem plano premium). Achados reais: só P3 UX (Esc, dupla LGPD, texto convite). Falta: semear Premium + smoke admin do dono |
| 2026-07-27 | QA Chrome ciclo 1+2 consolidado + correções P3 (frontend) | Parcial | Relatório final: 0 P0, segurança sem regressão nas 2 rodadas, Free sólido, Premium BLOCKED (ambiente). Corrigidos na branch (aguardam deploy): **F5** texto de onboarding parent-managed; **F21/Esc** hook `useEscClose` nos 8 modais-diálogo (build ✅). **F16 (dupla LGPD) SEGURADO** — é o consentimento versionado autoritativo (TermsGate) + corrida com `accept_terms`; mexer é sensível (LGPD), aguarda decisão do Codex/dono |
| 2026-07-26 | Esclarecimento arquitetural: criança é parent-managed | ✅ Decidido | `add_child` cria perfil `role='child'` **sem login** (FK removido de propósito); child-login ficou órfão pós-**SEC-03**. **Dono CONFIRMOU: MVP do beta é parent-managed** (criança não loga; responsável cria/marca/aprova). F3/F4 = working-as-designed. Ações resultantes: (a) atualizar roteiro de QA; (b) corrigir texto de onboarding que promete "código de convite" p/ criança (F5, P3); (c) child-login órfão = tech-debt. Nada bloqueia beta |
| 2026-08-13 | Lote de engenharia pré-venda v3 | 🟡 Preparado localmente | Contratos Free/Premium centralizados; migrations canônicas de limites e idempotência Hotmart; webhook e delete-account endurecidos; modais acessíveis; consentimento v3; PWA segura; testes automatizados e gates de qualidade. **Nenhum SQL, Edge Function ou frontend deste lote foi aplicado em produção.** Ver `SQL_SOURCE_OF_TRUTH.md` e `QA_PRE_VENDA_LOTE3.md` |
| 2026-08-13 | Lote de qualidade e performance v4 | ✅ Validado localmente | Lint estrito 0/0; 14/14 testes; audit 0 vulnerabilidades; bundle principal 612→226 kB; singleton Supabase; hardening `create_family`; landing desktop responsiva; QA público mobile/desktop aprovado. **Sem deploy ou SQL aplicado.** |
| 2026-08-13 | Revisao final de receita Hotmart | ✅ Corrigido localmente | Webhook agora exige produto RotinUp em allowlist, versao 2.0.0 e corpo real <=1 MB; cancelamento preserva Premium ate `date_next_charge`. Runbook e preflight criados. **Exige configurar produto/segredo antes do deploy.** |
| 2026-08-13 | Observabilidade de erros de uso v5 | Validado localmente | Reporte automatico e manual com sanitizacao de PII, deduplicacao, rate limit, RLS/ACL fechadas, Error Boundary e fila administrativa. Migration `supabase_app_error_reporting.sql` preparada. **Sem SQL ou frontend publicado.** |
| 2026-08-13 | Briefing mestre de layout para Lovable | Preparado | Escopo visual completo para visitante, responsavel, crianca e admin; preserva contratos comerciais, seguranca, acessibilidade e estados de uso. Proibe publicacao, conexao com producao e migrations. Ver `PROMPT_LOVABLE_LAYOUT_ROTINUP.md`. |
| 2026-08-13 | Observabilidade e suporte Edge v6 | Validado localmente | Logs JSON correlacionados e sanitizados nas quatro Edge Functions; referencias curtas em erros de IA/exclusao; falhas de push passam ao reporte; runbook operacional criado. 21 testes PASS, lint estrito e parser das quatro funcoes verdes. **Nenhuma funcao, SQL ou frontend publicado.** |
| 2026-08-16 | Refresh visual Etapa 1 - landing | Validado localmente | Landing reconstruida a partir da direcao Lovable, com asset proprio, contratos comerciais preservados e QA em 1440x900, 768x1024 e 390x844. 22 testes PASS, lint/build/audit verdes. **Sem push, deploy, SQL ou liberacao.** Ver `PLANO_REFRESH_VISUAL.md`. |
| 2026-08-16 | Refresh visual Etapa 2 - entrada e onboarding | Validado localmente | Auth, recuperacao, termos, consentimento e onboarding migrados para o novo sistema visual. 23 testes PASS; QA publico responsivo e modal legal verdes; `recover_family` agora diferencia erro de rede de conta sem familia. **Smoke autenticado pendente; sem push, deploy, SQL ou liberacao.** |
| 2026-08-16 | Smoke autenticado do refresh Etapa 2 | Fechado e limpo | Conta QA iniciou sem termos, aceitou `2026-08-13`, criou familia Free e crianca ficticia, abriu o painel e foi excluida pela Edge LGPD. Perfil/familia/crianca ausentes, Auth ausente e relogin=`invalid_credentials`. Scroll entre telas corrigido. **Sem residuo QA, push, deploy ou SQL.** |
| 2026-08-16 | Refresh visual Etapa 3 - shell do responsavel | Validado localmente | Sidebar desktop, topbar contextual, navegacao inferior mobile e largura total implantadas sem alterar fluxos internos. 24 testes PASS; browser autenticado em 1440x900, 768x1024 e 390x844 sem overflow; console limpo em aba nova. Conta QA removida e relogin recusado. **Sem residuo QA, push, deploy, SQL ou liberacao.** |

---

## 7.1 Estado do Lote v3 — 2026-08-13

Este lote está **implementado e validado localmente**, mas ainda não altera o estado vivo do produto.

Entregas preparadas:

- Limites comerciais canônicos: Free = 1 filho/1 responsável; Premium = 10 filhos/10 responsáveis.
- `add_child` e `join_family_by_code` com bloqueio transacional para impedir estouro de limite por concorrência.
- Hotmart com Hottok por header, parser estrito, minimização de PII, deduplicação por `event_id`, ordenação temporal e múltiplas assinaturas.
- Exclusão de conta recuperável após falha parcial entre banco e `auth.users`.
- Consentimento atualizado para v3 (`2026-08-13`), termos alinhados aos planos mensal/anual e prazo legal de incidente sem valor obsoleto.
- Diálogos com `role=dialog`, `aria-modal`, foco inicial, foco preso, `Esc`, bloqueio de scroll e retorno de foco.
- Landing mobile 390x844 sem overflow horizontal; controles legais e de autenticação acessíveis por teclado.
- Service Worker bloqueando navegação de notificação para origem externa.
- SQL histórico perigoso neutralizado e fonte de verdade documentada.
- Gate automatizado `npm run check`: lint sem erros, testes de contratos e build PWA.
- CI em `.github/workflows/quality.yml`: `npm ci`, check completo e audit de dependências de produção.

Evidência local acumulada da rodada:

- Testes Node: 14 cenários de contrato, SQL e Hotmart.
- Lint estrito: 0 erros e 0 avisos (`--max-warnings=0`).
- Build Vite/PWA: concluído; aplicação separada em `index` 225,60 kB, React 189,64 kB e Supabase 196,30 kB, todos abaixo do limite de 500 kB.
- Dependências de produção: `npm audit --omit=dev --audit-level=high` com 0 vulnerabilidades.
- Browser: consentimento bloqueia cadastro quando desmarcado e libera após aceite; modal legal prende foco, fecha com `Esc` e devolve foco; mobile 390x844 e desktop 1440x900 sem overflow nem erro de console.

Para considerar o lote fechado em produção:

1. Revisar os SQLs e aplicar na ordem definida em `SQL_SOURCE_OF_TRUTH.md`.
2. Publicar `hotmart-webhook` e `delete-account` somente depois das migrations correspondentes.
3. Rotacionar `HOTMART_HOTTOK` e validar o header oficial no endpoint vivo.
4. Rodar a matriz `QA_PRE_VENDA_LOTE3.md` com contas Free, Premium, co-responsável e famílias distintas.
5. Executar smoke pós-deploy e registrar evidências neste arquivo.
6. Informar os dados reais do fornecedor e obter revisão jurídica dos Termos antes da venda aberta.

Veredito deste lote: **código local aprovado com ressalvas; produção inalterada; não promover para venda aberta antes dos gates acima.**

## 7.2 Estado do Lote v4 — 2026-08-13

Melhorias concluídas localmente:

- Estado derivado de navegação e carregamentos ajustados para conformidade com React Hooks.
- Lint promovido a gate estrito: qualquer novo aviso reprova `npm run check` e a CI.
- Cliente Supabase extraído para singleton em desenvolvimento, evitando múltiplos clientes Auth durante hot reload.
- Hook de diálogo acessível e contratos comerciais extraídos do monólito.
- Preços, ofertas Hotmart e limites Free/Premium centralizados e testados.
- Bundle dividido por domínio: aplicação, React e Supabase; o alerta de chunk acima de 500 kB foi eliminado.
- Landing desktop passou de 430 px para composição responsiva de 1040 px, com grades; mobile preservado.
- `supabase_harden_create_family.sql` preparado com `search_path` seguro, ACL explícita, trava por responsável, colisão atômica de convite e limite de nome.
- Webhook Hotmart falha fechado sem allowlist do produto e rejeita eventos de outros produtos da mesma conta.
- Cancelamento de assinatura respeita `date_next_charge`; reembolso e chargeback continuam imediatos.
- `DEPLOY_PRE_VENDA.md` e `supabase_preflight_lote4.sql` definem publicacao, parada, evidencia e rollback.

Restrições desta evidência:

- O QA local não autenticou nem alterou dados; dashboards de responsável, criança e admin continuam pendentes no ambiente alvo.
- `supabase_harden_create_family.sql`, migrations do lote v3, Edge Functions e frontend não foram publicados.
- O aviso `inlineDynamicImports` vem do build interno do service worker do plugin PWA; não afeta o bundle web e deve ser acompanhado em atualização do plugin.
- Venda aberta continua bloqueada pelos dados jurídicos reais, rotação do Hottok, domínio/e-mail e regressão autenticada.

---

## 7.3 Estado do Lote v5 - Reporte de erros

Implementado e validado localmente em 2026-08-13:

- Captura global de erros JavaScript, rejeicoes nao tratadas e falhas de render React.
- Registro contextual de falhas em loads, cronometro, resgates, Premium, exclusao de conta e operacoes administrativas.
- Formulario acessivel em `Conta > Reportar um problema`, com referencia curta para suporte.
- Agrupamento por assinatura, deduplicacao de 30 segundos e contador de ocorrencias.
- Sanitizacao no cliente e no banco para email, UUID, telefone, documento, cartao e tokens.
- Rate limit de 20 reportes distintos por hora e 50 por dia, serializado por usuario.
- Retencao automatica: 90 dias para fechados/ignorados e 180 dias para abertos.
- Tabela sem acesso direto para `anon`/`authenticated`; leitura e triagem apenas via gate `is_platform_admin()`.
- Fila administrativa com filtros de status, resolver, ignorar e reabrir.
- Versao do app associada ao reporte por `VITE_APP_VERSION` ou SHA da Vercel.

Evidencia local: `npm run check` verde, 17 testes PASS, audit de producao com 0 vulnerabilidades, build PWA concluido e QA publico 390x844/1440x900 sem overflow ou erros de console.

Estado vivo: **nao aplicado**. A migration `supabase_app_error_reporting.sql` deve ser aplicada e verificada antes de publicar o frontend deste lote. Depois, executar O1-O11 de `QA_PRE_VENDA_LOTE3.md` com contas descartaveis.

## 7.4 Estado do Lote v6 - Observabilidade Edge e suporte

Implementado e validado localmente em 2026-08-13:

- Logger compartilhado em JSON para `hotmart-webhook`, `delete-account`, `ai-assistant` e `push-notify`.
- `request_id` unico em respostas e logs; o frontend mostra somente uma referencia curta nos erros correlacionaveis.
- Sanitizacao defensiva de email, UUID, token, documento, telefone, cartao, query string e metadados sensiveis.
- Erros internos e respostas brutas de provedores deixaram de ser devolvidos ao usuario.
- IA valida acao e entitlement Premium antes de consumir cota; consulta de plano falha fechada.
- Push limita corpo e destinatarios, valida UUIDs, restringe URL a caminho local, prova a familia e verifica todos os erros de consulta.
- Falhas de push em segundo plano agora entram no reporte de erros sem interromper a acao principal.
- Comparacao em tempo constante aplicada aos segredos aceitos pela funcao push.
- `OPERACAO_SUPORTE.md` define coleta minima, correlacao, severidade, roteiros e gate de ativacao.
- `DEPLOY_PRE_VENDA.md` inclui as quatro funcoes, smoke de logs sem PII e rollback completo.

Evidencia local: 21 testes PASS, lint estrito sem avisos, `git diff --check` sem erros e parser/bundle das quatro Edge Functions concluido. O build PWA final deve permanecer verde no fechamento do lote.

Estado vivo: **nao aplicado**. Nao houve deploy, push, migration nem liberacao do app. A ativacao exige seguir o gate de `OPERACAO_SUPORTE.md` e a ordem de `DEPLOY_PRE_VENDA.md`.

## 7.5 Estado do Refresh Visual - Etapa 1

Implementado e validado localmente em 2026-08-16:

- Trabalho isolado na branch `codex/refresh-visual-etapa-1`.
- Projeto Lovable inventariado como referencia, sem copiar contratos ou dados simulados.
- Landing publica migrada para uma linguagem visual clara, multicolorida e responsiva.
- Hero full-bleed usa asset WebP proprio de 153.088 bytes e mantém a proxima secao visivel no primeiro viewport.
- Planos Free/Premium continuam consumindo as constantes reais e os mesmos checkouts Hotmart.
- Cadastro, consentimento e modal juridico continuam ligados aos fluxos existentes.
- Teste contratual impede regressao de H1, links comerciais, breakpoint, foco, asset e uso de gradientes na landing.
- QA em browser: 1440x900, 768x1024 e 390x844 sem overflow; um H1; imagens com `alt`; controles nomeados; modal fecha com `Esc`; console limpo.
- Gates: 22/22 testes, lint estrito, build PWA, `git diff --check` e audit de producao aprovados.

Estado vivo: **inalterado**. Nenhum push, deploy, SQL ou liberacao foi realizado. A sequencia visual e controlada por `PLANO_REFRESH_VISUAL.md`; a Etapa 2 cobre autenticacao, termos e onboarding em commit separado.

## 7.6 Estado do Refresh Visual - Etapa 2

Implementado e validado localmente em 2026-08-16:

- Branch isolada `codex/refresh-visual-etapa-2`, baseada na landing aprovada.
- Login, cadastro e recuperacao convertidos em formularios semanticos, com rotulos, autocomplete, envio por formulario e alertas persistentes.
- Navegacao de retorno para a landing adicionada sem alterar a maquina de estados de autenticacao.
- Cadastro continua bloqueado ate o checkbox juridico e registra `TERMS_VERSION` pela RPC `accept_terms`.
- Modal legal claro preserva as 14 secoes, versao vigente, foco preso, `Esc`, bloqueio de scroll e retorno de foco.
- TermsGate preserva o consentimento explicito do responsavel e a opcao de sair.
- Onboarding mantem `recover_family`, `create_family`, `add_child` e `join_family_by_code`; nomes sao normalizados e o convite aceita apenas letras e numeros.
- Falha de `recover_family` nao e mais confundida com ausencia de familia: agora exibe retry e envia reporte operacional sanitizado.
- QA publico real em 1440x900, 768x1024 e 390x844 sem overflow ou erros de console; login, cadastro, recuperacao e modal legal exercitados sem chamada mutavel.
- Gates: 23/23 testes, lint estrito, build PWA, audit com 0 vulnerabilidades e contrastes AA aprovados.

Smoke autenticado concluido com conta descartavel:

- Perfil inicial nasceu `parent`, sem familia e sem aceite previo.
- TermsGate bloqueou o avanco ate o checkbox, exibiu a versao `2026-08-13` e gravou `terms_accepted_at`.
- Modal legal mostrou 14 secoes, prendeu foco, fechou com `Esc` e devolveu foco ao gatilho.
- Onboarding validou escolha, convite normalizado, nome minimo, `create_family` e `add_child`.
- Painel abriu no plano Free com owner correto e a crianca ficticia de 11 anos.
- O QA encontrou scroll herdado entre telas; auth, App e onboarding agora restauram o topo a cada transicao.
- `delete-account` removeu perfil, familia, crianca e login; nova autenticacao retornou `invalid_credentials`.
- Sessao do browser foi encerrada e voltou para a landing sem o nome QA.

Estado vivo do produto: **codigo inalterado e sem dados QA residuais**. Nenhum push, deploy ou SQL foi realizado. Etapa 2 fechada localmente; Etapa 3 pode iniciar em lote separado.

## 7.7 Estado do Refresh Visual - Etapa 3

Implementado e validado localmente em 2026-08-16:

- Branch isolada `codex/refresh-visual-etapa-3`, baseada na Etapa 2 aprovada.
- Painel do responsavel deixou o enquadramento estreito e agora usa toda a viewport com sidebar no desktop.
- Mobile usa navegacao inferior de cinco destinos, labels compactas, area segura do dispositivo e indicador de pendencias.
- Topbar mostra saudacao, aba atual, filhos, plano e resumo operacional sem adicionar consultas ao backend.
- As chaves `home`, `missions`, `rewards`, `stats` e `settings` e todos os componentes internos foram preservados.
- Plano Free/Premium, limites, permissoes, pendencias, resgates, timers, loading, erro e retry continuam consumindo os mesmos estados.
- Troca de aba restaura o topo; no desktop somente o workspace rola e o header fica estavel; no mobile a pagina rola naturalmente.
- Contrato automatizado cobre destinos, `aria-current`, breakpoint 767 px, safe area, foco, largura total e ausencia de gradiente no novo shell.
- QA autenticado somente leitura: 1440x900, 768x1024 e 390x844 sem overflow; todas as abas abriram o titulo correto e voltaram ao topo.
- Uma nova aba do preview carregou o painel sem erros ou avisos no console.
- Conta descartavel criada para isolamento foi eliminada pela Edge LGPD; perfil ausente e novo login retornou `Invalid login credentials`.
- Gates: 24/24 testes, lint estrito, build PWA e `git diff --check` aprovados.

Estado vivo do produto: **codigo e release inalterados, sem dados QA residuais**. Nenhum push, deploy, SQL ou liberacao foi realizado. O conteudo interno do painel permanece no visual anterior e sera migrado de forma segmentada na Etapa 4.

## 8. Modelo Para Novas Entradas

Copie e cole este bloco ao registrar qualquer evolução:

```md
### AAAA-MM-DD — Título curto

- Tipo: correção | QA | decisão | risco | deploy | operação
- Status: aberto | em andamento | fechado | rejeitado
- Severidade: P0 | P1 | P2 | P3 | operacional
- Evidência:
- Impacto:
- Decisão:
- Próximo passo:
```

---

## 9. Regra de Ouro

Nenhum item deve ser marcado como **fechado** sem uma evidência mínima:

- SQL aplicado + verificação.
- Build/teste executado.
- QA Chrome com print/passos.
- Log/API response.
- Decisão explícita de aceitar risco.
