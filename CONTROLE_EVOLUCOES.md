# Controle de Evoluções — RotinUp

> Arquivo de acompanhamento vivo para decisões de produto, QA, segurança, venda e próximos passos.
> Atualize sempre que uma correção for aplicada, validada, reprovada ou enviada para QA.
> Papéis dos chats/agentes e prompts de handoff ficam em `PROTOCOLO_AGENTES.md`.

Última atualização manual: 2026-07-26 (QA API create_family + achado de escalada de role)

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
| QA Chrome UI completo | ⏳ Pendente | Nenhum P0 aberto bloqueando; pode ser disparado |
| Venda aberta | ⏳ Pendente | Requer QA sem P0/P1 + Hotmart token + domínio/Resend |

Veredito atual: **Sem P0 aberto.** `create_family` e a escalada de privilégio (auto-admin no signup) estão ambos **provados**. Falta para o beta pago: (1) smoke manual do dono no painel admin; (2) QA Chrome UI completo; (3) triagem do P1 `get_family_id_by_email`. Decisão final de GO/NO-GO do beta é do Codex/dono.

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
- Prova executada (2026-07-26, `qa_verify_admin_fix.py`, 10/10 PASS): signup admin→parent ✅; child→child ✅; sem role→parent ✅; PATCH `role='admin'` bloqueado ("Alteração de papel não permitida") ✅; falso admin "Acesso negado" nas 3 RPCs + ex-signup-admin ✅; `create_family` de parent OK ✅; `is_platform_admin()=false` p/ comum ✅. Teste do **admin legítimo** (dono consegue chamar) exige login do dono → smoke manual pendente.
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
| P2 | `get_family_id_by_email` sem gate + defesa-em-profundidade nas admin_* | 🟠 Corrigido (aguarda aplicar) | Triado com Codex (`REVISAO_CODEX_HARDENING.md`) → P2 (não P1: UUID não é credencial, RLS protege). Patch `supabase_hardening_grants.sql`: restringe RPC do webhook a `service_role` + revoga `anon` das 3 admin_*. Aplicar antes do QA Chrome; não bloqueia beta sozinho |
| P1 | QA Chrome UI completo | ⏳ Pendente | Sem P0/P1 reais |
| P1 | Triagem final dos achados Chrome | ⏳ Pendente | Separar bug real, falso positivo e risco aceito |

---

## 4. Pendências Para Venda Aberta

| Prioridade | Item | Status | Observação |
|---|---|---|---|
| P1 Operacional | Rotacionar `HOTMART_HOTTOK` | ⏳ Pendente | Token fraco/antigo deve ser trocado no Hotmart e Supabase |
| P1 Operacional | Domínio + Resend | ⏳ Pendente | Depois religar confirmação de email no Supabase |
| P1 QA | QA Chrome sem P0/P1 | ⏳ Pendente | Adulto, criança, admin e cross-family |
| P2 Técnica | Lint/modularização gradual | ⏳ Pendente | Não bloqueia beta; reduz risco de regressão |

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

---

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
