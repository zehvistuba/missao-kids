# QA Chrome — Ciclo 1 (produção) — 2026-07-26

Relatório do Claude Chrome (QA caixa-preta) + 1ª triagem técnica do Claude Code.
Fonte da verdade de status: `CONTROLE_EVOLUCOES.md`.

## Veredito do QA
NO-GO para venda ampla; GO só para beta controlado FREE. Prontidão ~55% —
travada pela impossibilidade de testar o Premium (contas QA não estavam premium).

## Resultado por severidade (QA)
- P0: 0. P1: 2 (contas sem seed; premium inativo). P2: 3. P3: 2. BLOCKED: 4.

## Segurança — CONFIRMADA íntegra (black-box)
- admin_get_families → "Acesso negado" p/ usuário comum (F12). ✅
- get_family_id_by_email → permission denied p/ anon (401) e authenticated (403) (F13). ✅
- RLS profiles → só o próprio perfil (F14). ✅
- signup role='admin' → 'parent' (F1/D1). ✅  create_family ×3 (F/D). ✅
- Nenhuma regressão de segurança.

## Núcleo FREE — PASS
Limites 5 missões/3 recompensas (F7); resgate/entrega/saldo sem negativo (F8);
tropeço com chão em zero + ledger real (F9); sem duplo crédito em duplo clique (F10);
CRUD de missões com toasts (F11); estados vazios claros.

## Achados (F1–F19) e triagem do Claude Code

| ID | Achado (QA) | Sev QA | Triagem Claude Code (com evidência de código) |
|---|---|---|---|
| F1 | Contas QA sem família/seed | P1 | **Ambiente**, não bug: contas nunca semeadas; Chrome criou contas novas (nascem FREE). |
| F2 | Contas "premium" sem plano premium | P1 | **Ambiente**: bloqueia Seção B. Ação: provisionar family Premium real. |
| F3 | "Não existe login de filho" | P2 | **FALSO/artefato**: existe `child_join` + `join_family_by_code`/`claim_child_profile` (App.jsx:498,512,539,4501). Re-testar após seed. |
| F4 | "Crédito imediato sem aprovação" | Div. | **Artefato**: conta sem filho real. Modelo real: criança marca → `review_mission` (pai aprova). Re-testar. |
| F5 | Texto cadastro cita "código de convite" p/ criança | P2 | **P3 conteúdo**: coexistem `add_child` (direto) e convite por código; verificar UX. |
| F6 | Free co-responsável | FP | **Não é bug**: Free `max_co_parents=1` (0 extras) por design; "10" no Premium confere (não regressão). |
| F7 | Limite 6ª missão/4ª recompensa bloqueia | PASS | PASS. |
| F8 | Resgate/entrega/saldo | PASS | PASS (sem negativo). |
| F9 | Tropeço com saldo 0 | PASS | PASS (chão em zero, ledger real). |
| F10 | Duplo clique não duplica | PASS | PASS. |
| F11 | CRUD missões | PASS | PASS. |
| F12 | admin_get_families → Acesso negado | PASS | PASS (segurança). |
| F13 | get_family_id_by_email → denied anon/auth | PASS | PASS (hardening confirmado). |
| F14 | RLS profiles = 1 linha | PASS | PASS. |
| F15 | Modais não fecham com Esc | P3 | **P3 real** (X e clique-fora ok). Já no roadmap. |
| F16 | Dupla tela LGPD (checkbox + tela cheia) | P3 | **P3 real**; verificar se a tela cheia é o consent versionado intencional. |
| F17 | Painel admin do dono não testado | BLOCKED | Intencional (senha do dono). Smoke pelo dono. |
| F18 | Mobile 390×844 não aplicou | BLOCKED | Limitação da ferramenta; re-testar. |
| F19 | approve_mission → 404 | BLOCKED | **Erro do script**: RPC real é `review_mission` (App.jsx:3261). Segurança já coberta por C2/C3/C4. |

## Rodada 1b — Arquitetura de criança (resolve F3/F4 com evidência de código)
Investigação black-box (Chrome) + leitura de código (Claude Code):
- `add_child` (supabase_add_child.sql) cria `profiles.role='child'` **sem `auth.users`**
  (derruba o FK `profiles.id→auth.users` de propósito: "perfis de filhos sem conta de login").
- Não há entrada na UI para criar conta autenticada `role='child'` (signup é sempre `parent`;
  `userType` fixo em App.jsx:979). `claim_child_profile`/`child_join`/`ChildDash` existem mas
  ficaram ÓRFÃOS após o fix **SEC-03** ("cadastro direto como criança removido do AuthScreen").
- **Modelo atual = PARENT-MANAGED (intencional, pós-SEC-03):** o responsável cria o filho,
  marca e aprova a missão (mission_log já nasce `status='approved', reviewed_by=<pai>`).

Reclassificação:
- F3 (sem login de filho) e F4 (aprovação instantânea) = **working as designed**, NÃO bug.
- Seed "filho" com role='parent' = lacuna de dado de teste **irrelevante** (nem com role='child'
  haveria login pela UI).
- C1 (criança auto-aprova) = **N/A** — não existe criança autenticada; `review_mission` exige
  pai/admin e negou o não-vinculado ("Nao autorizado" P0001) = segurança OK.

## DECISÃO DE PRODUTO — ✅ DECIDIDA (dono, 2026-07-26): MVP do beta é PARENT-MANAGED
O dono confirmou: crianças NÃO logam; o responsável cria/marca/aprova. Ações resultantes:
- atualizar o roteiro de QA (o "criança marca→pai aprova" está morto);
- revisar/corrigir o texto de onboarding que promete "código de convite" para crianças (F5);
- decidir destino do código órfão de child-login (limpar OU reabilitar no futuro) — tech-debt, não bloqueia.
Se o beta PRECISA de login de criança, então é um GAP a construir (entrada de UI ausente).

## Conclusão do Claude Code
Sem P0/P1 de produto real. Nenhum achado de segurança novo. O grande item aberto virou uma
DECISÃO DE PRODUTO (parent-managed vs child-login), não um bug. Falta p/ fechar beta:
(1) confirmar o modelo parent-managed; (2) provisionar Premium real + re-testar Seção B;
(3) smoke admin do dono; (4) batch dos P3 de UX (Esc, dupla LGPD, texto de convite).
