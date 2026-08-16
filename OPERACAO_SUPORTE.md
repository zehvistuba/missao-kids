# Operacao de Suporte e Observabilidade

Status: preparado localmente em 2026-08-13. Este documento nao autoriza deploy nem prova que a observabilidade esta ativa em producao.

## 1. Objetivo

Permitir que suporte, produto e engenharia identifiquem falhas de uso sem solicitar senha, token, documento, dados de pagamento ou informacoes da crianca. O diagnostico usa duas fontes complementares:

- Reportes do frontend: fila administrativa criada por `supabase_app_error_reporting.sql`.
- Logs das Edge Functions: eventos JSON correlacionados pelo campo `request_id`.

## 2. O que pedir ao usuario

Solicite somente:

- referencia curta exibida pelo app, por exemplo `ref. A1B2C3D4`;
- horario aproximado e fuso;
- tela e acao que estava executando;
- resultado esperado e resultado observado;
- dispositivo, navegador e tipo de conexao, se forem relevantes.

Nunca solicite senha, codigo de verificacao, JWT, Hottok, chave Supabase, numero de cartao, CPF, endereco, nome completo da crianca ou captura contendo esses dados.

## 3. Correlacao por referencia

As Edge Functions geram um `request_id` completo por requisicao. O frontend mostra somente os oito ultimos caracteres, em maiusculas, quando a resposta de erro chega ao cliente.

1. Abra os logs da Edge Function correspondente no Supabase.
2. Restrinja a busca ao intervalo de horario informado.
3. Pesquise os oito caracteres da referencia curta.
4. Confirme `service`, `event`, `level` e `request_id` no mesmo registro.
5. Nao use coincidencia fora da janela de horario como prova definitiva.

O reporte automatico/manual do frontend tem sua propria referencia curta e deve ser consultado na fila administrativa. Referencias de frontend e Edge Function podem ser diferentes para o mesmo incidente; registre ambas no atendimento quando existirem.

## 4. Formato dos logs Edge

Cada linha e um objeto JSON com os campos:

- `timestamp`: instante UTC.
- `level`: `info`, `warn` ou `error`.
- `service`: `hotmart-webhook`, `delete-account`, `ai-assistant` ou `push-notify`.
- `event`: evento estavel para filtro e alerta.
- `request_id`: correlacao da requisicao.
- metadados tecnicos permitidos, como acao, tamanho, status do provedor e contagens.

O logger compartilhado remove emails, UUIDs, tokens, documentos, telefones, cartoes, query strings e chaves de metadados sensiveis. Nao adicione payloads, cabecalhos de autorizacao, objetos de usuario ou respostas brutas de provedores aos logs.

## 5. Dicionario de eventos

### Hotmart

- `event_processed`: evento valido processado.
- `event_ignored`: tipo de evento sem efeito no plano.
- `legacy_query_token_used`: integracao ainda enviou o segredo na URL; migrar e desativar o legado.
- `unauthorized`: Hottok ausente ou incorreto.
- `product_not_allowed`: produto fora da allowlist.
- `missing_entitlement_key`: compra sem identificador seguro para reconciliacao.
- `processing_failed`: RPC transacional rejeitou ou falhou.
- `server_misconfigured`: segredo, allowlist ou credencial obrigatoria ausente.

### Exclusao de conta

- `account_deleted`: dados e usuario Auth removidos.
- `app_data_deletion_failed`: a RPC LGPD falhou; o Auth nao deve ser removido nessa tentativa.
- `push_cleanup_failed`: limpeza de inscricoes push falhou.
- `auth_deletion_failed`: dados do app foram apagados, mas o usuario Auth nao foi removido; tratar como incidente LGPD prioritario.
- `unauthorized`: sessao ausente ou invalida.

### Assistente de IA

- `request_completed`: resposta valida entregue.
- `quota_rejected`: limite diario atingido ou controle de cota indisponivel.
- `premium_required`: acao exclusiva recusada para plano Free.
- `plan_lookup_failed`: plano nao pode ser confirmado; a funcao falha fechada.
- `provider_failed`: provedor respondeu com erro.
- `invalid_provider_response`: provedor respondeu sem conteudo utilizavel.
- `invalid_action`, `invalid_body`, `payload_too_large`: entrada rejeitada antes de consumir o servico.

### Notificacoes push

- `delivery_completed`: tentativa concluida, com contagens de envio e falha.
- `delivery_failed`: provedor rejeitou uma inscricao.
- `expired_subscription_removed`: inscricao expirada removida.
- `family_members_lookup_failed`: nao foi possivel provar os destinatarios da familia; nenhum envio cego deve ocorrer.
- `subscriptions_lookup_failed`: consulta de inscricoes falhou.
- `no_recipients`: chamada valida sem destinatario permitido.

`server_misconfigured` e `unexpected_error` podem ocorrer em qualquer servico e sempre exigem triagem tecnica.

## 6. Severidade e prazo interno

| Nivel | Criterio | Acao inicial |
|---|---|---|
| P0 | Vazamento cross-family, escalada de privilegio, cobranca/plano incorreto em escala ou indisponibilidade total | Suspender o fluxo afetado, preservar evidencia e acionar engenharia imediatamente |
| P1 | Exclusao LGPD incompleta, onboarding bloqueado, perda financeira individual ou falha recorrente de fluxo principal | Triagem no mesmo ciclo operacional e correcao antes de ampliar o beta |
| P2 | Funcao secundaria indisponivel com contorno seguro | Registrar, reproduzir e priorizar no proximo lote |
| P3 | Texto, acabamento visual ou comportamento sem perda funcional | Agrupar no backlog de polimento |

Nunca altere dados diretamente para “destravar” um usuario sem identificar a causa, registrar o antes/depois e ter um procedimento aprovado.

## 7. Roteiros de triagem

### Pagamento ou Premium

1. Confirme horario, email usado na compra e email da conta sem registrar o valor completo no ticket.
2. Procure os eventos do `hotmart-webhook` na janela informada.
3. Confirme produto permitido, tipo do evento e resultado de `process_hotmart_event`.
4. Verifique entitlement e plano pelo procedimento administrativo; nao edite `families.plan` como primeira resposta.
5. Em divergencia financeira, marque P0/P1 conforme alcance e preserve o identificador oficial do evento em local restrito.

### Login e onboarding

1. Diferencie falha de Auth, aceite de termos, criacao de familia e carregamento do dashboard.
2. Consulte a fila de reportes pelo horario, tela e referencia.
3. Reproduza com conta descartavel do mesmo papel.
4. Se usuario novo nao consegue criar familia, trate como P0 de conversao ate prova em contrario.

### Notificacao

1. Confirme permissao do navegador, suporte a push e existencia de inscricao.
2. Correlacione `delivery_completed`, `delivery_failed` e limpeza de inscricoes expiradas.
3. Verifique se o destinatario pertence a familia do caller; nunca contorne a validacao cross-family.

### Assistente de IA

1. Identifique a acao e o plano, sem copiar o conteudo familiar enviado ao modelo.
2. Diferencie cota, Premium obrigatorio, falha de plano e indisponibilidade do provedor.
3. Use `request_id`, status do provedor e comprimento da resposta; nao solicite prompt ou resposta bruta com PII.

### Exclusao de conta

1. Trate `push_cleanup_failed`, `auth_deletion_failed` e relatos de login ainda ativo como P1 LGPD.
2. Confirme se a RPC de dados terminou antes da remocao do Auth.
3. Verifique sucessao do dono e permanencia da familia quando havia outro responsavel.
4. Nao execute exclusao manual parcial sem plano de reconciliacao.

### Erro geral do app

1. Consulte a fila administrativa pela referencia, tela, acao e horario.
2. Compare quantidade de ocorrencias e versao do app.
3. Reproduza na mesma classe de viewport e navegador.
4. Marque `resolvido` somente depois de validar a correcao; use `ignorado` apenas para duplicata ou comportamento esperado documentado.

## 8. Alertas minimos antes da venda aberta

Configurar alertas por janela, evitando notificacao por evento isolado de usuario:

- qualquer `auth_deletion_failed`;
- qualquer `server_misconfigured` em ambiente de producao;
- aumento de `processing_failed` ou `product_not_allowed` no Hotmart;
- repeticao de `family_members_lookup_failed` ou `subscriptions_lookup_failed`;
- taxa elevada de `provider_failed` da IA;
- novos reportes P0/P1 ou pico de uma mesma assinatura no frontend.

Definir proprietario, canal, janela e limite de cada alerta durante a preparacao operacional. Sem monitoramento externo, fazer revisao manual diaria dos logs e da fila durante o beta controlado.

## 9. Retencao e acesso

- A fila do frontend retira fechados/ignorados apos 90 dias e abertos apos 180 dias, conforme a migration preparada.
- Restrinja logs e fila a operadores autorizados.
- Nao exporte logs completos para chats ou documentos publicos.
- Em evidencias compartilhadas, use referencias curtas, contagens, status HTTP e eventos; remova dados pessoais.

## 10. Gate de ativacao

Antes de publicar este lote:

1. Aplicar e validar `supabase_app_error_reporting.sql`.
2. Publicar as quatro Edge Functions com o modulo `_shared/observability.ts`.
3. Executar `npm run check` e o smoke de cada funcao.
4. Forcar um erro controlado por funcao e confirmar JSON valido, `request_id` e ausencia de PII.
5. Confirmar que IA e exclusao exibem referencia curta sem vazar detalhes internos.
6. Executar O1-O11 de `QA_PRE_VENDA_LOTE3.md`.
7. Registrar SHA, deploys, horario, evidencias e decisao em `CONTROLE_EVOLUCOES.md`.

Na data deste documento, todas essas mudancas permanecem somente no repositorio local e o app nao deve ser liberado.
