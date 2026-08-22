# Runbook - Preview Protegido do RotinUp

Data: 2026-08-22

Status: preparado localmente; nenhum push ou deployment executado.

## 1. Objetivo

Publicar o pacote candidato em um ambiente Preview da Vercel, restrito a pessoas autorizadas, para executar os smokes externos da Etapa 7 sem alterar o dominio de producao.

Este runbook nao autoriza:

- merge em `main`;
- deployment de producao;
- promocao de Preview para Production;
- alteracao de DNS;
- aplicacao de SQL ou publicacao de Edge Functions;
- compra Hotmart sem janela e roteiro aprovados.

## 2. Fonte de Verdade

- Pacote visual/funcional: commit `b30ab53` da branch `codex/refresh-visual-etapa-7`.
- Roadmap documental posterior: commit `04d9b8f`.
- Headers e rewrite SPA: `vercel.json`.
- QA transversal: `RELATORIO_ETAPA7_QA.md`.
- Publicacao completa: `DEPLOY_PRE_VENDA.md`.

O aplicativo dos dois commits e equivalente. Para reduzir escopo, o primeiro Preview deve apontar para `b30ab53`.

## 3. Pre-Check Obrigatorio na Vercel

Execute antes de enviar qualquer branch ao GitHub:

1. Abrir o projeto RotinUp na Vercel.
2. Confirmar em **Settings > Environments > Production > Branch Tracking** que somente `main` e a branch de producao.
3. Abrir **Settings > Deployment Protection**.
4. Selecionar **Standard Protection**.
5. Selecionar **Vercel Authentication**.
6. Salvar e registrar evidencia sem expor conta, token ou configuracao sensivel.
7. Confirmar que uma Preview antiga, se existir, exige autenticacao.

Standard Protection com Vercel Authentication protege deployments e URLs de Preview sem proteger o dominio de producao e esta disponivel em todos os planos. Senha compartilhada nao e requisito deste gate e depende de plano/add-on.

Fontes oficiais:

- [Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Preview Environments](https://vercel.com/docs/deployments/environments#preview-environment-pre-production)
- [Git deployments](https://vercel.com/docs/git#preview-branches)

**Criterio fail-closed:** se a protecao nao estiver comprovada, nao fazer push da branch.

## 4. Variaveis do Ambiente Preview

Conferir no escopo **Preview**, registrando apenas presente/ausente:

| Variavel | Obrigatoria | Observacao |
|---|---|---|
| `VITE_SUPABASE_URL` | Sim | URL publica do projeto usado no smoke |
| `VITE_SUPABASE_ANON` | Sim | Chave publica/anon; nunca `service_role` |
| `VITE_VAPID_PUBLIC_KEY` | Para push | Somente chave publica |
| `VITE_APP_VERSION` | Nao | O build usa `VERCEL_GIT_COMMIT_SHA` como fallback |

Nunca configurar como `VITE_*`:

- `SERVICE_ROLE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`;
- `HOTMART_HOTTOK`;
- `GEMINI_API_KEY`;
- `VAPID_PRIVATE_KEY`;
- `CRON_SECRET`;
- token Vercel, GitHub ou qualquer segredo operacional.

O Preview pode usar o backend vivo apenas com contas sinteticas, familia isolada e limpeza LGPD comprovada. Nao executar mutacoes na conta real do dono durante QA visual.

## 5. Criacao Controlada do Preview

Somente depois dos Passos 3 e 4 e com autorizacao do dono:

```powershell
git switch codex/refresh-visual-etapa-7
git status --short
git log -1 --oneline
git push -u origin codex/refresh-visual-etapa-7
```

Resultado obrigatorio antes de continuar:

- branch remota diferente de `main`;
- Vercel classifica o deployment como `Preview`;
- nenhum alias de producao foi alterado;
- URL especifica do commit registrada;
- protecao exige login Vercel antes de entregar o app shell.

Nao usar `vercel --prod`, **Promote to Production**, merge ou rebase em `main` nesta etapa.

## 6. Smoke de Protecao

Executar primeiro, antes do smoke funcional:

| ID | Cenario | Esperado |
|---|---|---|
| PRV-01 | URL do Preview em janela anonima limpa | Barreira da Vercel; nenhum app shell ou dado RotinUp |
| PRV-02 | `/admin` anonimo no Preview | Mesma barreira; rewrite nao contorna protecao |
| PRV-03 | URL com membro autorizado | App abre normalmente |
| PRV-04 | URL do dominio de producao | Continua apontando para o deployment anterior |
| PRV-05 | Deployment no painel | Ambiente `Preview`, nunca `Production` |

Falha em qualquer item encerra a rodada.

## 7. Smoke de Headers e Integracoes

Com usuario autorizado no Preview:

| ID | Cenario | Esperado |
|---|---|---|
| HDR-01 | Documento `/` | CSP, COOP, Permissions Policy, Referrer Policy, `nosniff` e anti-frame presentes |
| HDR-02 | Supabase Auth/API | Sem bloqueio em `connect-src` e sem erro CSP no console |
| HDR-03 | Realtime | WebSocket `wss://*.supabase.co` conecta |
| HDR-04 | DiceBear/avatar | Imagem permitida, sem fallback quebrado |
| HDR-05 | Google OAuth | Popup abre e retorna; COOP nao rompe o fluxo |
| HDR-06 | Checkout Hotmart | Link oficial abre; nao concluir compra nesta verificacao |
| HDR-07 | Manifesto e service worker | Arquivos carregam depois da autenticacao |
| HDR-08 | Refresh direto em `/admin` | SPA responde sem 404 |

Registrar os valores dos headers, erros de console e requests bloqueados. Nao registrar cookies, JWTs, query strings de OAuth ou corpos com PII.

## 8. Smoke Funcional Permitido

Ordem recomendada:

1. landing, login, cadastro e termos;
2. onboarding com conta descartavel;
3. painel Free e modo crianca acompanhado;
4. erro de load/retry;
5. tema claro/escuro;
6. PWA e offline depois do primeiro carregamento autorizado;
7. admin proprietario em modo somente leitura;
8. exclusao LGPD da conta sintetica e relogin recusado.

Premium/Hotmart, alteracao de plano, exclusao administrativa, co-responsavel e push real seguem roteiros proprios e nao sao implicitamente autorizados por este runbook.

## 9. Criterios de Parada

Interromper e nao promover se:

- o Preview abrir sem autenticacao;
- a Vercel criar deployment `Production`;
- o dominio publico mudar de commit;
- algum segredo aparecer no bundle, HTML, console ou request do navegador;
- CSP bloquear Supabase, OAuth, avatar, PWA ou checkout;
- o primeiro acesso de uma janela limpa entregar o app shell sem passar pela protecao;
- surgir P0/P1 funcional, de seguranca, pagamento ou LGPD;
- a conta sintetica nao puder ser removida integralmente.

## 10. Evidencia de Fechamento

Registrar em `CONTROLE_EVOLUCOES.md`:

- commit, branch, deployment ID e URL mascarada;
- ambiente `Preview` e metodo de protecao;
- resultado PRV-01 a PRV-05;
- matriz HDR-01 a HDR-08;
- navegadores/viewports usados;
- console e rede sem erro novo;
- conta/familia sintetica criada e prova da limpeza;
- confirmacao de que producao permaneceu no deployment anterior;
- decisao `PASS`, `FAIL` ou `BLOCKED`.

O Preview aprovado continua sem autorizacao de venda. Ele apenas libera os smokes externos restantes.
