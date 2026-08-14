# QA Pré-Venda — Lote 3

Status: roteiro de validação para o lote preparado em 2026-08-13. Não prova produção até ser executado no ambiente vivo.

## 1. Ordem de publicação

1. Aplicar `supabase_harden_create_family.sql`.
2. Aplicar `supabase_fix_plan_limits_canonical.sql`.
3. Aplicar `supabase_fix_hotmart_idempotency.sql`.
4. Publicar a Edge Function `hotmart-webhook`.
5. Publicar a Edge Function `delete-account`.
6. Publicar o frontend.
7. Executar smoke e esta matriz sem reutilizar contas com estado desconhecido.

Rollback deve ser definido antes da etapa 1. Não publicar a Edge Function Hotmart antes de existir `process_hotmart_event`.

## 2. Gates automatizados locais

| ID | Cenário | Esperado |
|---|---|---|
| A1 | `npm run lint` | 0 erros e 0 avisos (`--max-warnings=0`) |
| A2 | `npm test` | todos os testes PASS |
| A3 | `npm run build` | build web e PWA concluídos |
| A4 | `git diff --check` | sem whitespace error |
| A5 | GitHub Actions `Quality` | PASS antes de merge/deploy |

## 3. Banco e limites

| ID | Cenário | Papel | Esperado |
|---|---|---|---|
| B1 | Free adiciona primeiro filho | Responsável | PASS |
| B2 | Free tenta segundo filho | Responsável | bloqueado com mensagem de limite |
| B3 | Premium adiciona até 10 filhos | Responsável | PASS |
| B4 | Premium tenta 11º filho | Responsável | bloqueado |
| B5 | Duas requisições simultâneas no último slot | Responsável | apenas uma confirma |
| B6 | Convite válido antes de 72h | Co-responsável | entra na família |
| B7 | Convite expirado | Co-responsável | bloqueado |
| B8 | Duas entradas simultâneas no último slot | Co-responsáveis | apenas uma confirma |
| B9 | Usuário já vinculado tenta trocar de família | Qualquer | bloqueado |
| B10 | Chamada anônima às RPCs | Anônimo | sem EXECUTE/acesso negado |
| B11 | Perfil `child` tenta usar convite | Criança legada/atacante | bloqueado; MVP é gerenciado pelo responsável |
| B12 | Duas chamadas simultâneas de `create_family` pela mesma conta | Responsável | uma família criada; a segunda chamada é bloqueada |
| B13 | Chamada anônima a `create_family` | Anônimo | sem EXECUTE/acesso negado |

## 4. Hotmart e plano

| ID | Cenário | Esperado |
|---|---|---|
| H1 | Header `X-HOTMART-HOTTOK` correto | evento processado |
| H2 | Token ausente/incorreto | 401, sem persistência |
| H3 | Mesmo `event_id` reenviado | no-op idempotente |
| H4 | Evento antigo chega após evento novo | marcado stale; plano não regride |
| H5 | Compra antes da conta | entitlement pendente e reconciliável |
| H6 | Compra com mesmo e-mail da conta | família vira Premium |
| H7 | Duas assinaturas, uma cancelada | Premium permanece enquanto outra estiver ativa |
| H8 | Última assinatura cancelada com ciclo já pago | Premium até `date_next_charge`; depois volta para Free ao sincronizar |
| H9 | Payload com CPF/endereço | PII não fica em `raw_payload` minimizado |
| H10 | Evento sem ID/data/e-mail/chave de entitlement | 400, sem efeito parcial |
| H11 | Reembolso/chargeback da última compra | família volta para Free imediatamente |
| H12 | Evento Hotmart de outro produto da mesma conta | ignorado; nunca concede Premium |

## 5. LGPD, autenticação e recuperação

| ID | Cenário | Esperado |
|---|---|---|
| L1 | Cadastro sem checkbox | botão desabilitado |
| L2 | Cadastro por e-mail com aceite | aceite v3 registrado; sem segundo gate indevido |
| L3 | Google/conta antiga sem versão v3 | TermsGate antes do dashboard |
| L4 | Conta com versão v3 | entra sem novo gate |
| L5 | Falha transitória ao carregar profile | sessão preservada; retry e sair disponíveis |
| L6 | Falha após `delete_my_account`, antes de remover Auth | nova tentativa conclui exclusão |
| L7 | Dono com co-responsável exclui conta | owner transferido e família preservada |
| L8 | Único responsável exclui conta | família e Auth removidos conforme contrato |

## 6. UI, acessibilidade e PWA

| ID | Cenário | Viewport | Esperado |
|---|---|---|---|
| U1 | Landing primeira dobra | 390x844 | sem overflow, corte ou sobreposição |
| U2 | Landing e auth | desktop | layout íntegro e foco visível |
| U3 | Abrir cada modal | ambos | foco entra no modal |
| U4 | `Tab`/`Shift+Tab` | ambos | foco não escapa do modal |
| U5 | `Esc` | ambos | modal fecha e foco volta ao gatilho |
| U6 | Clique no backdrop | ambos | fecha apenas quando previsto |
| U7 | Erro de load | ambos | bloco persistente com retry; sem tela vazia |
| U8 | Notificação com URL externa forjada | PWA | abre `/`, nunca domínio externo |
| U9 | Instalação/atualização do PWA | Android/desktop | instala e atualiza sem cache quebrado |

## 7. Segurança regressiva

Reexecutar K1–K10 do `AUDITORIA_CODEX.md`: RLS cross-family, mutação cross-family, `pending_approvals`, escalada de role/kidcoins, insert direto em missões, push, resgate por filho externo, rate-limit IA e claim Premium sem compra. Todos devem permanecer PASS.

## 7.1 Observabilidade e reporte

| ID | Cenario | Papel | Esperado |
|---|---|---|---|
| O1 | Falha de consulta no dashboard | Responsavel/crianca | bloco de retry e um reporte automatico aberto |
| O2 | Mesma falha repetida apos 30 s | Responsavel/crianca | mesmo reporte; `occurrences` incrementado |
| O3 | Mesma falha repetida em menos de 30 s | Responsavel/crianca | sem inundacao; contador nao incrementa |
| O4 | Envio em Conta > Reportar um problema | Responsavel | confirma e mostra referencia curta |
| O5 | Texto com email, CPF, telefone, UUID e token | Responsavel | dados sensiveis redigidos no registro |
| O6 | 21 reportes distintos em uma hora | Responsavel | 21o bloqueado por rate limit |
| O7 | SELECT/INSERT direto em `app_error_reports` | Usuario comum | bloqueado; nenhum grant direto |
| O8 | `platform_get_error_reports`/`platform_update_error_report` | Usuario comum | acesso negado |
| O9 | Fila Erros: resolver, ignorar e reabrir | Admin real | estado atualizado e item movido da lista |
| O10 | Erro de render React controlado | Usuario autenticado | fallback recuperavel e reporte sem stack bruto |
| O11 | Retencao de dados | Operacao | fechados >90 dias e abertos >180 dias sao removidos no proximo reporte |

## 8. Gate de venda

Beta controlado exige: matriz central sem P0/P1, Hotmart vivo idempotente, exclusão viva, smoke Free/Premium e token rotacionado.

Venda aberta exige também: domínio e e-mail transacional, confirmação de e-mail reativada, identificação legal real do fornecedor nos Termos, revisão jurídica, observabilidade e regressão em dispositivo real.
