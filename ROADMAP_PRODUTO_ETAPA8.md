# Roadmap de Produto - Etapa 8 Pos-Refresh

Data: 2026-08-22

Branch: `codex/roadmap-produto-etapa-8`

Estado publicado: inalterado. Nenhum push, deploy, SQL ou liberacao foi realizado.

## 1. Veredito Executivo

O RotinUp ja cobre o nucleo comercial do produto: onboarding do responsavel, perfis infantis gerenciados, missoes, KidCoins, recompensas, aprovacao, timers, recorrencia, IA, co-responsaveis, notificacoes, LGPD, suporte e administracao.

O proximo ganho relevante nao vem de aumentar indiscriminadamente o numero de telas. A ordem correta e:

1. concluir os gates externos de release da Etapa 7;
2. medir ativacao e uso sem coletar PII infantil;
3. restaurar no modo acompanhado capacidades uteis que ficaram apenas no modo infantil legado;
4. melhorar ativacao, motivacao e retorno semanal;
5. so entao adicionar automacoes com custo e superficie de dados maiores.

**Decisao:** a Etapa 8 autoriza inventario e priorizacao, nao implementacao de novas funcoes. O aplicativo permanece fechado.

Prontidao permanece inalterada porque esta etapa e documental: **94% engenharia local, 90% beta controlado e 82% venda aberta**. Nenhum ponto percentual foi concedido sem prova de runtime.

## 2. Escopo e Fonte de Evidencia

A analise usa:

- rotas e inconsistencias do Lovable ja registradas em `PLANO_REFRESH_VISUAL.md`;
- briefing funcional enviado ao Lovable em `PROMPT_LOVABLE_LAYOUT_ROTINUP.md`;
- codigo real em `src/App.jsx`, configuracao comercial e SQL/RPCs versionados;
- riscos e gates do `RELATORIO_ETAPA7_QA.md`.

O projeto Lovable e privado e nao foi reaberto nesta rodada por link magico. Portanto, nenhuma ideia nao documentada foi tratada como requisito confirmado.

## 3. Gate Zero - Antes de Qualquer Feature

Novas funcoes nao devem entrar no pacote candidato antes de fechar:

| Gate | Estado | Criterio |
|---|---|---|
| Preview protegido | Pendente | Commit aprovado acessivel sem promover producao |
| Cabecalhos publicados | Pendente | CSP e integracoes reais sem bloqueio |
| Admin proprietario | Pendente | UI renovada com sessao real do dono |
| Premium/Hotmart | Pendente | Compra, reconciliacao, cancelamento e idempotencia |
| Segredo Hotmart | Pendente | `HOTMART_HOTTOK` rotacionado e webhook provado |
| Dominio e email | Pendente | Resend e confirmacao de email ponta a ponta |
| Juridico | Pendente | Identificacao do fornecedor e revisao final |
| Dispositivos/CWV | Pendente | iOS, Android, LCP, INP e CLS medidos |

O motivo e simples: adicionar features agora aumenta a area de regressao antes de provar o pacote que ja esta em 94% de prontidao local.

## 4. Inventario Funcional Atual

| Area | Estado | Evidencia | Lacuna real |
|---|---|---|---|
| Landing, planos e checkout | Completo local | `src/App.jsx:753`, `src/config/product.js:13` | Falta prova publicada e Hotmart E2E |
| Auth, termos e onboarding | Completo local | `src/App.jsx:986`, `src/App.jsx:1270` | Falta dominio/email e smoke final |
| Home do responsavel | Completo | `src/App.jsx:4540` | Sem tendencia historica na propria home |
| Missoes | Completo | `src/App.jsx:3748`, `src/App.jsx:4806` | Falta biblioteca inicial de modelos |
| Recompensas e timers | Completo | `src/App.jsx:3923`, `src/App.jsx:4930` | Modo acompanhado resgata apenas uma unidade |
| Estatisticas | Parcial | `src/App.jsx:5040` | Mostra principalmente hoje; nao explora os 30 dias ja carregados |
| Crianca acompanhada | Completo no nucleo | `src/App.jsx:3224` | Perdeu partes uteis do modo legado |
| Conquistas acompanhadas | Parcial | `src/App.jsx:3425` | Exibe seis niveis, nao as conquistas reais do banco |
| Notificacoes | Basico | `src/App.jsx:301`, `src/App.jsx:5163` | Liga/desliga push; sem horarios ou preferencias |
| Suporte e erros | Completo local | `src/App.jsx:1066`, `src/App.jsx:5690` | Falta rotina operacional em ambiente publicado |
| Admin de familias | Completo local | `src/App.jsx:5400` | Sem fila financeira de compras/reconciliacao |
| Produto/receita | Sem telemetria | `package.json:13` | Nao mede ativacao, retencao ou conversao por funil |

## 5. Paridade Que Deve Ser Restaurada

O modo infantil autenticado e legado e nao deve voltar como rota de negocio. Ele, porem, revela funcoes que podem ser reaproveitadas com os contratos do responsavel.

| Item | Estado atual | Decisao | Fundamentacao |
|---|---|---|---|
| Progresso semanal por crianca | Existe no legado (`src/App.jsx:2302`) | **Adicionar** | Os ultimos 30 dias ja sao carregados em `src/App.jsx:3805`; alto valor sem novo schema |
| Conquistas reais e bonus | Existe no legado (`src/App.jsx:1874`, `src/App.jsx:2507`) | **Adicionar** | O acompanhado mostra apenas niveis; perde 16 conquistas ja contratadas no plano |
| Resgate em quantidade | RPC e UI legada existem (`src/App.jsx:2119`) | **Prototipar** | Util para recompensas unitarias, mas pode acelerar gasto por toque e precisa confirmacao clara |
| Capitao Rotina | IA/fallback no legado (`src/App.jsx:1781`) | **Prototipar sem chamada automatica** | Nao deve consumir cota/custo ao abrir a tela; priorizar mensagem deterministica |
| Missao surpresa Premium | Existe no legado e backend | **Prototipar** | Pode reforcar Premium, sempre mediada pelo responsavel e sem promessa automatica |
| Ranking entre irmaos | Existe no legado (`src/App.jsx:2600`) | **Rejeitar** | Incentiva comparacao punitiva e conflito; nao e necessario para criar habito |
| Timer local de missao | Existe no legado | **Rejeitar como autoridade** | Relogio do dispositivo e manipulavel; qualquer retorno deve ser server-authoritative |
| Login individual infantil | Divida legada | **Rejeitar no MVP** | Contraria a decisao parent-managed e amplia Auth, LGPD e suporte |

## 6. Modelo de Priorizacao

Cada oportunidade recebeu notas de 1 a 5. O indice e:

`2 x valor do usuario + retencao + receita + evidencia - complexidade - risco`

Risco inclui seguranca, LGPD infantil, custo recorrente, suporte e possibilidade de comportamento punitivo. O indice orienta a ordem, mas nao substitui gate tecnico nem aprovacao do dono.

| Oportunidade | Valor | Retencao | Receita | Evidencia | Complex. | Risco | Indice | Decisao |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Telemetria minima de produto | 5 | 5 | 5 | 5 | 3 | 3 | 19 | Adicionar como fundacao |
| Rotinas iniciais por modelos | 5 | 5 | 3 | 4 | 2 | 1 | 19 | Adicionar |
| Tendencia de 7/30 dias | 5 | 4 | 3 | 5 | 2 | 1 | 19 | Adicionar |
| Meta de recompensa | 5 | 5 | 4 | 4 | 3 | 2 | 18 | Adicionar apos prototipo |
| Conquistas reais no acompanhado | 4 | 4 | 3 | 5 | 2 | 2 | 16 | Adicionar |
| Operacao financeira no admin | 5 | 3 | 5 | 5 | 4 | 4 | 15 | Adicionar apos Hotmart E2E |
| Lembretes por horario | 5 | 5 | 4 | 3 | 5 | 4 | 13 | Prototipar |
| Resumo semanal por email/push | 4 | 4 | 4 | 3 | 4 | 4 | 11 | Adiar ate Resend |
| Capitao Rotina acompanhado | 3 | 3 | 3 | 4 | 3 | 4 | 9 | Prototipar com fallback local |
| Exportacao de dados da familia | 4 | 2 | 2 | 3 | 3 | 4 | 8 | Adicionar na trilha de confianca |
| Resgate em quantidade | 2 | 2 | 1 | 5 | 2 | 2 | 8 | Prototipar, nao priorizar |
| Calendario familiar completo | 4 | 4 | 3 | 2 | 5 | 4 | 8 | Adiar ate haver evidencia |
| Log de atividade de co-responsavel | 3 | 3 | 3 | 2 | 4 | 4 | 6 | Adiar |
| Ranking entre irmaos | 1 | 1 | 1 | 2 | 2 | 5 | -1 | Rejeitar |

## 7. Roadmap Recomendado

### Etapa 8A - Fundacao de Produto

Objetivo: saber se o produto ativa e retem antes de adicionar complexidade.

- eventos first-party, pseudonimizados e em quantidade minima;
- nunca gravar nome infantil, email, texto livre, token ou conteudo de erro;
- eventos iniciais: onboarding concluido, primeiro filho, primeira missao, primeira conclusao, primeira recompensa, primeiro resgate, convite e upgrade iniciado/concluido;
- funil de ativacao e coortes semanais no admin, sem perfil comportamental infantil;
- politica de retencao e revisao juridica antes de coletar.

Gate: testes de minimizacao, RLS/ACL, opt-out quando aplicavel e zero PII no payload.

### Etapa 8B - Ativacao e Paridade

Objetivo: fazer a primeira familia chegar ao valor percebido mais rapido.

- oferecer modelos curados por faixa etaria e momento do dia;
- permitir selecionar ate cinco missoes iniciais, respeitando o Free;
- mostrar tendencia semanal usando os logs ja carregados;
- carregar conquistas reais no modo acompanhado;
- modularizar somente os componentes tocados, sem reescrita total de `App.jsx`.

Metricas: tempo ate primeira missao, percentual que conclui onboarding + primeira missao e retorno em D7.

### Etapa 8C - Motivacao Saudavel

Objetivo: tornar KidCoins mais concretos sem ansiedade ou competicao.

- responsavel/crianca escolhem uma recompensa ativa como meta;
- mostrar saldo, falta em KidCoins e estimativa baseada na rotina atual;
- permitir trocar ou remover a meta sem perda;
- usar linguagem de progresso, nunca medo de perder streak;
- prototipar resgate em quantidade apenas para recompensas marcadas como unitarias.

Metricas: familias com meta, conclusoes apos definir meta e resgates entregues.

### Etapa 8D - Retencao e Comunicacao

Objetivo: lembrar sem gerar spam ou culpa.

- horarios e dias definidos pelo responsavel;
- quiet hours, fuso da familia e limite de frequencia;
- resumo semanal opt-in somente depois de dominio/Resend;
- fallback quando push/email falhar e painel de entrega operacional;
- nunca enviar detalhes sensiveis na tela bloqueada do dispositivo.

Metricas: opt-in, entrega, abertura, desativacao e retorno apos lembrete.

### Etapa 8E - Operacao e Escala

Objetivo: impedir perda de receita e reduzir suporte manual.

- fila administrativa de compra orfa, reconciliacao, status da assinatura e proxima cobranca;
- exportacao autenticada dos dados da familia;
- trilha de acoes de co-responsaveis apenas para eventos relevantes;
- remocao gradual do `ChildDash` legado apos migrar o que foi aprovado;
- divisao de `App.jsx` por superficie e carregamento sob demanda.

## 8. Regras de Arquitetura Para Novas Funcoes

- Toda mutacao financeira, KidCoins, XP, streak ou timer permanece atomica no banco.
- Toda RPC nova nasce sem `EXECUTE` para `PUBLIC`/`anon` e com grants minimos explicitos.
- Toda tabela infantil usa RLS por familia e teste cross-family positivo e negativo.
- Eventos de produto nao reutilizam a tabela de erros e nao aceitam texto livre.
- IA nunca roda automaticamente apenas por abrir uma tela.
- Notificacao exige opt-in, preferencia e limite de frequencia.
- Novos recursos Premium precisam falhar fechados no backend, nao apenas esconder botao.
- Cada lote inclui estados loading, vazio, erro persistente, offline e concorrencia.
- Nenhum lote amplia o papel `admin` ou consulta tabelas globais diretamente no frontend.

## 9. Top 10 de Produto

1. Instrumentar o funil minimo de ativacao sem PII infantil.
2. Oferecer modelos de rotina no fim do onboarding.
3. Mostrar progresso de 7/30 dias para responsavel e crianca acompanhada.
4. Restaurar as conquistas reais no modo acompanhado.
5. Adicionar meta de recompensa com progresso saudavel.
6. Prototipar lembretes configuraveis com quiet hours.
7. Criar operacao financeira de compras orfas e assinaturas no admin.
8. Enviar resumo semanal opt-in depois de Resend e dominio.
9. Preparar exportacao autenticada de dados da familia.
10. Remover o modo infantil legado depois da migracao aprovada e modularizar as superficies tocadas.

## 10. Proxima Decisao

O proximo passo de engenharia continua sendo o **Gate Zero da Etapa 7**, com preview protegido e smokes externos. Em paralelo, a unica preparacao de produto permitida e detalhar o contrato da Etapa 8A, sem migration, deploy ou coleta real.

Depois dos gates, o primeiro lote funcional recomendado e **Etapa 8B: modelos iniciais + tendencia semanal + conquistas reais**, precedido pela telemetria minima aprovada. Ele entrega valor perceptivel com baixo risco e sem mudar o modelo parent-managed.
