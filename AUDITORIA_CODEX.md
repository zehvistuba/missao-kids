# 🔬 Protocolo de Auditoria Completa — RotinUp (para Codex / agente de análise)

> **Para o agente:** execute esta auditoria em **MODO SOMENTE-LEITURA**. Sua entrega é um
> **RELATÓRIO** + **ações sugeridas para aprovação humana**. Você NÃO implementa nada.
> Trabalhe em **etapas** (Fase 0 → Fase 11). Em cada achado, cite **arquivo:linha** como evidência.
> Seja **criterioso, exigente e perfeccionista** — o objetivo é um produto **100% pronto para venda**.

---

## ⛔ REGRAS ABSOLUTAS
1. **Nada de ação:** não edite arquivos, não faça commit/PR, não rode migrações, não altere o
   banco, não faça deploy, não execute comandos destrutivos. Só leitura e análise.
2. **Evidência sempre:** todo achado precisa de `arquivo:linha` (ou nome da função/trecho).
3. **Sem invenção:** se não tiver certeza, marque **"a verificar"** e diga como confirmar.
4. **Priorize demais a deixar passar:** na dúvida, reporte.

## 🎯 SEVERIDADE (use em todo achado)
- 🔴 **P0** — crítico: bug grave, falha de segurança, perda de dados, bloqueia venda.
- 🟠 **P1** — alto: quebra funcional importante, risco de receita/privacidade, UX ruim em fluxo central.
- 🟡 **P2** — médio: inconsistência, qualidade, casos de borda.
- 🟢 **P3** — polimento: estético, microcopy, nice-to-have.

## 🧾 FORMATO DE CADA ACHADO
```
[P?] Título curto
- Evidência: arquivo:linha (trecho)
- Impacto/Risco:
- Ação sugerida (NÃO executar):
- Confiança: alta/média/baixa | Confirmar no banco vivo? sim/não
```

---

## 🗺️ MAPA DO SISTEMA (onde olhar)
- **Frontend (arquivo único):** `src/App.jsx` (~4000 linhas, React 18 + Vite, estilos inline, tema escuro).
  Componentes-chave: `App` (router por `screen`), `ParentDash`, `ChildDash`, `AdminPanel`, modais
  (`EditChildModal`, `DemeritModal`, `MissionModal`, `RewardModal`, `ExtratoModal`, `UpgradeModal`,
  `RedeemForChildModal`, `TermsModal`), `Countdown`, `TimerControl`, `XPRing`, `NotifyToggle`.
- **Service worker:** `src/sw.js` (push + cache). Manifest/PWA em `vite.config.js`.
- **Edge Functions (Deno):** `supabase/functions/ai-assistant/index.ts`, `.../push-notify/index.ts`,
  `.../hotmart-webhook/index.ts`.
- **Backend SQL:** arquivos `supabase_*.sql`. ⚠️ **O banco vivo pode divergir** — `supabase_LIVE_reference.sql`
  é o mais próximo do real. Findings de SQL = "confirmar no banco vivo".
- **Mapa geral do projeto:** `CONTINUIDADE.md`.

## ⚠️ CONTEXTO IMPORTANTE — NÃO confundir com bug (mas pode reverificar)
- O trigger `protect_profile_columns` **permite de propósito** o cliente definir `role` apenas na
  primeira vez (NULL → 'parent'/'child'); bloqueia `kidcoins/xp/streak/role/family_id` depois. Isso é
  intencional (não é escalada).
- A chave `sb_publishable_...` embutida nas funções de cron é a **chave pública** (publishable),
  segura por design. O que **não** pode aparecer no frontend/SQL é a `service_role`.
- "Confirm email" está **desligado de propósito** (provedor de e-mail sem domínio verificado ainda).
- Estados do cronômetro em `redemption_logs.timer_state`: `idle | running | paused | done | merged`.
- Resgate em 3 etapas: `requested → approved → delivered` (+ `cancelled`).

---

# FASE 0 — Preparação e leitura do todo
- Leia `CONTINUIDADE.md` e a estrutura de pastas. Liste: telas/rotas, papéis, planos.
- Liste TODAS as RPCs chamadas no front (`supabase.rpc("...")`) e TODAS as tabelas acessadas
  (`supabase.from("...")`). Monte um inventário (RPC/tabela → onde é usada).
- **Entregue:** um resumo da arquitetura (1 parágrafo) + a lista de RPCs e tabelas.

# FASE 1 — Segurança do Backend (RPCs, RLS, triggers)
Para CADA RPC `SECURITY DEFINER`, verifique:
- [ ] Valida o papel do chamador (`role IN ('parent','admin')`) quando deveria?
- [ ] Valida pertencimento à família (não dá pra agir em filho/recompensa de outra família)?
- [ ] Operações de coins/xp são **atômicas** e impedem saldo negativo (ex.: `WHERE kidcoins >= x`)?
- [ ] `SET search_path = public` presente? Risco de SQL dinâmico/injeção?
- [ ] Alguma RPC permite a criança creditar a si mesma, mudar papel, ou ler dados de outra família?
Para RLS (em `supabase_*` e LIVE reference):
- [ ] Toda tabela sensível tem RLS habilitada? Policies de SELECT/INSERT/UPDATE/DELETE fazem sentido?
- [ ] Política de UPDATE em `profiles` tem `WITH CHECK` ou depende só do trigger? Risco?
- **Entregue:** achados P0–P2 + lista de RPCs sem checagem de papel/família.

# FASE 2 — Segurança das Edge Functions
- `ai-assistant`: exige autenticação em TODAS as ações? Há rate-limit? Risco de custo aberto na Gemini?
  Prompt injection (dados da criança vão pro modelo)?
- `hotmart-webhook`: valida o `hottok`? Falha fechado se o segredo faltar? O segredo é forte? Alguém
  poderia forjar uma compra e ganhar Premium?
- `push-notify`: como autentica chamadas (JWT vs `x-cron-secret`)? Algum bypass?
- CORS, headers, vazamento de stack trace em erros.
- **Entregue:** achados + confirmação de quais funções exigem auth.

# FASE 3 — LGPD e Privacidade (dados de menores)
- Coleta mínima? Consentimento do responsável documentado? (ver `TermsModal` em `src/App.jsx`).
- Exclusão de conta funciona de fato (`delete_my_account`, `delete_child`)? Apaga tudo?
- Transferência a terceiros (Gemini/Google) está disclosed e minimizada? Manda dados além do necessário?
- Retenção, direitos do titular, canal de contato presentes e coerentes?
- **Entregue:** achados de conformidade + sugestões.

# FASE 4 — Integridade de dados e regras de negócio
- Máquina de estados do **cronômetro** (`idle/running/paused/done/merged`): há transição inválida?
  Pausar/retomar/concluir/cumulativo calculam tempo certo? O cron (`cron_timer_alerts`) só age em
  `running`? Há como "duplicar" tempo ou travar um timer?
- **Resgate 3 etapas:** transições válidas? Estorno de coins em cancelamento correto? `redeem_for_child`
  debita o filho certo e cria estado coerente?
- **Coins/XP/streak/conquistas:** algum caminho credita errado, duplica ou zera indevidamente?
- **Frequência/ocorrência** de missões (janela deslizante daily/weekly/biweekly/monthly): correto?
- **Race conditions** (duplo clique, duas abas, otimismo de UI sem rollback).
- **Entregue:** achados + cenários que podem corromper saldo/estado.

# FASE 5 — Frontend: funcionalidade, bugs, contratos
- Para cada `supabase.rpc("X", {...})` no front: os parâmetros batem com a assinatura esperada?
  Aponte possíveis divergências repo↔banco (RPC inexistente/assinatura diferente) — **marcar "a verificar"**.
- Tratamento de erro: há `catch {}` vazios, erros engolidos, toasts que somem rápido demais em ações
  críticas (entrega, exclusão, pagamento)?
- Estados de carregamento, vazio e erro existem em todas as telas/listas?
- Casos de borda: saldo zero, sem filhos, sem missões, sessão expirada, offline, valores grandes,
  nomes longos, emojis, fuso horário/data.
- **Entregue:** achados + lista de RPCs com possível divergência de contrato.

# FASE 6 — UX, UI, Layout e Acessibilidade
- Consistência visual (cores, espaçamentos, cantos, tipografia, componentes repetidos divergentes).
- Hierarquia e clareza: o usuário entende o que fazer? Fluxos com cliques demais?
- **Criança pequena (4–6) sem celular** vs **adolescente (13+)**: a experiência serve aos dois?
- Telas vazias e de erro são amigáveis? Microcopy PT-BR claro e sem erro?
- Acessibilidade: `aria-label`, foco de teclado, ordem de leitura, contraste de texto (especialmente
  `textMuted`), área de toque mínima, `alt` em imagens/avatares.
- Responsividade mobile (maxWidth ~430px) e em telas maiores/desktop.
- Modais: todos fecham (✕ + clicar fora + Esc)? Travam scroll do fundo?
- **Entregue:** achados de UX/UI/a11y por tela (Início, Missões, Recompensas, Stats, Conta; Loja,
  Conquistas, Perfil; Admin; Onboarding; Login).

# FASE 7 — Performance e qualidade de código
- `src/App.jsx` com ~4000 linhas num arquivo só: riscos de manutenção; sugerir modularização (sem executar).
- Re-renders desnecessários, `useEffect` com dependências erradas, listas sem `key` estável,
  intervals/timers sem cleanup, queries repetidas/N+1, payloads grandes.
- Dead code, duplicação, `console.*` esquecidos, valores mágicos hardcoded.
- Tamanho do bundle e oportunidades (code-splitting, lazy de modais/admin).
- **Entregue:** achados + top oportunidades de performance/manutenção.

# FASE 8 — PWA, Service Worker e Notificações
- `src/sw.js`: cache (workbox) e estratégia; `skipWaiting`/`clientsClaim`; risco de servir versão velha.
- Push: ícone/badge corretos, payload, clique abre a rota certa, permissão/erro tratados.
- Offline: o app degrada bem? Manifest/instalação corretos (`vite.config.js`)?
- **Entregue:** achados.

# FASE 9 — Pagamentos e Planos (Hotmart / Free vs Premium)
- Gating de Premium no **servidor** (não só na UI): limites de filhos/missões/recompensas, IA premium.
- Webhook concede/revoga plano corretamente (PURCHASE_APPROVED/CANCELED/REFUNDED/CHARGEBACK)?
- É possível burlar o limite Free pelo cliente? Reembolso/cancelamento rebaixa o plano?
- **Entregue:** achados + confirmação de onde o limite é realmente aplicado.

# FASE 10 — Matriz de QA (para humano executar)
Monte uma tabela cobrindo caminho feliz + erro + segurança, por papel:
| # | Cenário | Papel | Pré-condição | Passos | Resultado esperado |
Cubra no mínimo: cadastro/login/logout, onboarding/criar família, adicionar filho, criar missão
(normal e com duração), criança enviar missão, responsável aprovar/marcar, criar recompensa (normal
e de tempo), criança resgatar, 3 etapas de aprovação/entrega, resgatar em nome do filho, cronômetro
(iniciar/pausar/retomar/concluir/cumulativo/2 simultâneos diferentes), tropeço/extrato, conquistas,
upgrade/limites Free, admin (toggle plano/remover), exclusão de conta, notificações.

# FASE 11 — Consolidação
- **TOP 10 prioridades** para "100% para venda", em ordem, com esforço estimado (P/M/G).
- **Veredito de lançamento:** GO / GO-com-ressalvas / NO-GO, justificando.
- Resumo por severidade (quantos P0/P1/P2/P3).

---

## ✅ CHECKLIST FINAL DA ENTREGA
- [ ] Inventário de RPCs/tabelas (Fase 0)
- [ ] Achados por fase, com evidência `arquivo:linha`, impacto, ação sugerida, confiança
- [ ] Itens de SQL marcados como "confirmar no banco vivo" quando aplicável
- [ ] Matriz de QA (Fase 10)
- [ ] Top 10 + veredito (Fase 11)
- [ ] **Nenhuma alteração feita no código/banco/app** (somente relatório)
