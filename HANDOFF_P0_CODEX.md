# Handoff — Retomada após reiniciar para ativar o MCP Codex

> Para a PRÓXIMA sessão do Claude Code (após restart + aprovação do servidor `codex`).
> O usuário NÃO deve copiar mensagens entre agentes — a delegação é feita por MCP direto.

## Estado
- **Branch:** `fix/p0-admin-escalation` (NÃO trabalhar na `main`).
- **Tarefa:** revisar/endurecer o P0 de escalada de privilégio antes de aplicar.
- **Arquivo do fix (pronto, não aplicado):** `supabase_fix_p0_admin_escalation.sql`.
- **Teste pós-aplicação (pronto):** scratchpad `qa_verify_admin_fix.py`.
- **Controle:** `CONTROLE_EVOLUCOES.md` (P0 = 🟠 corrigido, aguarda prova).
- Executor não tem `service_role`/SQL Editor → aplicação do SQL é manual pelo dono.

## Regras do orquestrador (do usuário)
- Não trabalhar na main; não fazer merge/deploy sem autorização.
- Não rodar migração destrutiva; não alterar auth/permissões/dados de prod sem aprovação.
- Claude e Codex NÃO editam os mesmos arquivos.
  - **Codex** escreve só em `REVISAO_CODEX_P0.md`.
  - **Claude** consolida em `supabase_fix_p0_admin_escalation.sql` e `CONTROLE_EVOLUCOES.md`.

## Passo 1 — Confirmar o MCP vivo
Rodar ToolSearch `select:codex` (ou keyword "codex"); o `mcp-server` do Codex expõe uma tool
para enviar prompt (ex.: `codex`/`codex-reply`). Se não aparecer, o servidor não foi aprovado
no restart — reportar ao usuário. NÃO simular resposta do Codex.

## Passo 2 — Delegar ao Codex (prompt a enviar via MCP)

```
Você é o Codex, revisor técnico sênior de backend/SQL do projeto RotinUp.
NÃO edite nenhum arquivo além de REVISAO_CODEX_P0.md. Não aplique SQL, não faça deploy.

Contexto: revisão de segurança do arquivo `supabase_fix_p0_admin_escalation.sql`, que corrige
um P0 de escalada de privilégio (signup aceitava user_metadata.role='admin'; RPCs admin_* e a
policy de hotmart_events confiavam em profiles.role='admin').

Revise o SQL e escreva seu parecer em REVISAO_CODEX_P0.md, cobrindo:
1. handle_new_user: existe QUALQUER caminho pelo qual metadata gere role='admin'? (case,
   espaços, maiúsculas, JSON aninhado, chaves alternativas).
2. is_platform_admin(): é contornável? search_path/SECURITY DEFINER corretos? allowlist por
   email robusta (case/trim)? Deveria usar auth.jwt()->>'email' em vez de auth.users?
3. As 3 RPCs (admin_get_families/admin_set_plan/admin_delete_family) estão todas gated e sem
   overload remanescente? DROP+CREATE perde algum GRANT necessário para o PostgREST?
4. Policy hotmart_events correta? Há outras policies/RPCs confiando em role='admin' que ficaram
   de fora (ex.: get_family_id_by_email, get_family_plan, claim_premium_by_email)?
5. Varredura corretiva: risco de demover admin legítimo? Interação com trg_protect_profile_columns?
   Algo destrutivo além do escopo? A DELETE de auth.users '%@rotinup-qa.test' é segura?
6. Idempotência e ordem de execução dos blocos.
7. admin_set_plan assume FREE => max_co_parents=1: risco se o corpo vivo divergir.
8. Veredito: GO / NO-GO para aplicar, com a lista priorizada de correções (P0/P1/P2).
```

## Passo 3 — Claude revisa o parecer
- Ler `REVISAO_CODEX_P0.md`, não aceitar cego. Validar cada achado contra o SQL real.
- Achou problema? Continuar a MESMA sessão do Codex (codex-reply) pedindo correção/refino.
- Consolidar as correções aceitas em `supabase_fix_p0_admin_escalation.sql` (só Claude edita).

## Passo 4 — Checks e entrega
- Rodar o que existir: `npm run build` / `npm run lint` (frontend; SQL não tem build).
- Entregar: resumo, arquivos alterados, testes, riscos/pendências, validação manual.
- NÃO aplicar SQL / merge / push / deploy sem autorização explícita do usuário.
