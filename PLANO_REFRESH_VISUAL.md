# Plano de Refresh Visual - RotinUp

Data de abertura: 2026-08-16

Referencia visual: projeto Lovable `9a0585d6-c6dd-4fbe-8ed1-5d43f40c84eb`

Branches de trabalho: uma branch `codex/refresh-visual-etapa-*` por lote aprovado.

Estado vivo: inalterado; nenhum deploy, push ou SQL aplicado.

## 1. Objetivo

Evoluir a interface do RotinUp por lotes pequenos e reversiveis, usando o Lovable como referencia visual e preservando os contratos de produto, seguranca, dados, pagamento e LGPD ja validados.

O projeto do Lovable nao sera copiado integralmente. Cada tela sera reconstruida sobre o codigo real e so avanca depois dos gates automatizados e da inspecao visual nas viewports alvo.

## 2. Inventario da Referencia

Rotas observadas no Lovable:

- Publico: `/`, `/entrar`, `/onboarding`, `/termos`.
- Responsavel: `/app`, `/app/missoes`, `/app/recompensas`, `/app/estatisticas`, `/app/conta`.
- Crianca: `/crianca`, `/crianca/loja`, `/crianca/conquistas`, `/crianca/perfil`.
- Administracao: `/admin/familias`, `/admin/erros`.

Direcao visual aproveitada:

- Superficies claras com contraste alto e hierarquia simples.
- Paleta equilibrada entre coral, verde, amarelo, azul e marinho.
- Navegacao lateral no desktop e inferior no mobile.
- Linguagem ludica, mas sem infantilizar as telas operacionais do responsavel e do admin.
- Componentes compactos, legiveis e adequados ao uso repetido.

Inconsistencias da demonstracao que nao devem entrar no produto:

- Versao de termos `2.1`, diferente da versao juridica vigente no codigo real.
- Indicador `2 de 1` no plano Free.
- Textos que sugerem login ou PIN individual da crianca; o MVP e parent-managed.
- Dados, precos, limites e estados simulados que nao correspondem aos contratos vivos.

### Backlog pos-refresh do Lovable

As funcionalidades extras observadas na referencia ficam deliberadamente adiadas ate a conclusao da Etapa 7. Elas nao fazem parte dos lotes de migracao visual em andamento.

Ao final do refresh, executar uma comparacao funcional completa entre Lovable e RotinUp e classificar cada ideia por:

- Valor para responsavel, crianca gerenciada, administracao e suporte.
- Problema real resolvido e metrica de produto esperada.
- Compatibilidade com o MVP parent-managed e com os planos Free/Premium.
- Impacto em RLS, RPCs, LGPD, pagamento, notificacoes e observabilidade.
- Complexidade, custo recorrente, dependencia externa e risco de suporte.
- Decisao `adicionar`, `prototipar`, `adiar` ou `rejeitar`, sempre com aceite explicito do dono.

Ideias aprovadas deverao entrar em roadmap proprio, com prototipo isolado e os mesmos gates de seguranca, QA e release. Este registro e um lembrete de avaliacao, nao uma autorizacao de implementacao.

## 3. Contratos Imutaveis

- Precos, ofertas e URLs Hotmart continuam centralizados em `src/config/product.js`.
- Free e Premium continuam usando os limites comerciais provados.
- Consentimento continua versionado e obrigatorio.
- A crianca permanece gerenciada pelo responsavel no MVP.
- Nenhuma mudanca visual pode contornar RLS, RPCs ou validacoes do backend.
- Erros de uso continuam sanitizados, correlacionados e reportaveis.
- Nenhum lote visual autoriza deploy por si so.

## 4. Etapas

### Etapa 0 - Guardrails tecnicos

Status: concluida localmente.

- Isolar o trabalho em branch propria.
- Fechar o lote de observabilidade anterior em commit separado.
- Manter `npm run check` e audit como gates obrigatorios.
- Inventariar o Lovable e registrar divergencias de contrato.

### Etapa 1 - Landing publica

Status: concluida localmente; nao publicada.

- Hero full-bleed com imagem real da proposta de uso.
- H1 literal `RotinUp`, mensagem adequada a adultos e criancas de diferentes idades.
- Planos ligados aos mesmos contratos comerciais e checkouts existentes.
- Termos acessiveis pelo rodape sem duplicar regra juridica.
- Responsividade validada em 1440x900, 768x1024 e 390x844.

### Etapa 2 - Autenticacao, termos e onboarding

Status: concluida localmente, incluindo smoke autenticado e limpeza comprovada.

- Entrar, cadastrar e recuperar senha agora usam formularios semanticos com rotulos, autocomplete e mensagens acessiveis.
- TermsGate e modal juridico compartilham a nova identidade sem alterar versao, conteudo ou RPC de aceite.
- Onboarding preserva recuperacao, criacao, convite e cadastro infantil, com tratamento separado para falha de `recover_family`.
- QA publico real validou teclado semantico, foco do modal, loading, erros locais e responsividade.
- Smoke autenticado com conta descartavel validou TermsGate e onboarding contra o backend vivo; perfil, familia, crianca e login foram removidos no encerramento.

### Etapa 3 - Shell do responsavel

Status: concluida localmente, sem deploy.

- Navegacao responsiva e tokens visuais aplicados ao painel adulto.
- Contexto de filhos, plano, familia, alertas e permissoes preservado sem novas consultas ou alteracao de contrato.
- Densidade de informacao e ergonomia validadas em desktop, tablet e mobile.
- Conteudo funcional interno permanece no canvas anterior e sera tratado somente na Etapa 4.

### Etapa 4 - Fluxos centrais do responsavel

Status: em andamento; lotes 4A e 4B concluidos localmente, sem deploy.

- Home, resumo familiar, aprovacoes e cronometros: lote 4A concluido.
- Gestao completa de missoes e recorrencia: lote 4B concluido.
- Recompensas, resgates e cancelamento sem duplo estorno: proximo lote.
- Estatisticas, conta, Premium e exclusao LGPD.
- Validar estados vazio, carregando, erro, sucesso e concorrencia.

### Etapa 5 - Modo crianca parent-managed

Status: pendente.

- Adequar visual por faixa etaria sem criar login infantil inexistente.
- Revisar missao, loja, conquistas e perfil.
- Manter acoes sensiveis sob controle do responsavel.

### Etapa 6 - Administracao e suporte

Status: pendente.

- Familias, planos e fila de erros de uso.
- Manter o gate de platform admin e a minimizacao de PII.
- Priorizar leitura, filtro, triagem e rastreabilidade operacional.

### Etapa 7 - QA transversal e preparacao de release

Status: pendente.

- Regressao autenticada de adulto, crianca gerenciada e admin.
- Seguranca cross-family e planos Free/Premium.
- Acessibilidade, dispositivos reais, PWA, performance e recuperacao de falhas.
- Somente depois dos gates tecnicos, operacionais e juridicos: decisao explicita de release.

## 5. Gate de Cada Etapa

Uma etapa so pode ser fechada quando cumprir todos os itens aplicaveis:

- Diff limitado ao escopo declarado.
- Contratos existentes cobertos por teste.
- `npm run check` verde.
- `npm audit --omit=dev --audit-level=high` sem vulnerabilidade alta.
- `git diff --check` verde.
- Console sem erros ou avisos novos.
- Sem overflow horizontal nas viewports alvo.
- Navegacao por teclado e dialogos validados.
- Estados de erro e retry visiveis.
- Registro no `CONTROLE_EVOLUCOES.md`.
- Commit local separado, sem push ou deploy automatico.

## 6. Evidencia da Etapa 1

- Asset: `src/assets/rotinup-hero-family.webp` (153.088 bytes).
- Geracao: ImageGen integrado, modo padrao.
- Prompt final: ilustracao editorial clara de uma familia brasileira, com responsavel e duas criancas de idades diferentes usando um quadro fisico de missoes e recompensas; paleta coral, verde, amarelo, azul e marinho; sem texto, logotipo, celular, fundo escuro ou decoracao abstrata.
- Automacao: 22/22 testes, lint estrito e build PWA aprovados.
- Dependencias: 0 vulnerabilidades de producao.
- Contraste: cores funcionais principais entre 4,77:1 e 15,87:1 sobre branco.
- Browser: desktop, tablet e mobile sem overflow; conteudo seguinte visivel no primeiro viewport.
- Fluxos: plano mensal, checkout, cadastro, consentimento e modal juridico preservados.

## 7. Evidencia da Etapa 2

- Branch: `codex/refresh-visual-etapa-2`, derivada do commit aprovado da Etapa 1.
- Folha compartilhada: `src/styles/flow-refresh.css`, sem gradientes decorativos.
- Automacao: 23/23 testes, lint estrito e build PWA aprovados.
- Dependencias: 0 vulnerabilidades de producao.
- Contraste: combinacoes funcionais entre 4,77:1 e 15,04:1.
- Browser publico: 1440x900, 768x1024 e 390x844 sem overflow ou erro de console.
- Cadastro: consentimento aparece antes do envio, bloqueia o botao e exibe erro persistente com `role=alert`.
- Termos: 14 secoes, versao vigente, foco preso, `Esc`, scroll bloqueado e foco devolvido ao gatilho.
- Recuperacao: formulario proprio, autocomplete de email e validacao local sem chamada de rede invalida.
- Onboarding: nomes normalizados, codigo limitado a letras/numeros e falha de recuperacao com retry explicito e reporte operacional.
- Smoke autenticado: conta QA iniciou sem aceite, gravou a versao vigente, criou familia Free e uma crianca ficticia de 11 anos e abriu o painel do responsavel.
- Limpeza: `delete-account` removeu perfil, familia, crianca e `auth.users`; nova autenticacao retornou `invalid_credentials` e a sessao local voltou para a landing.
- Correcao de QA: mudancas de tela, modo de auth e etapa do onboarding agora restauram o scroll para o topo.

## 8. Evidencia da Etapa 3

- Branch: `codex/refresh-visual-etapa-3`, derivada da Etapa 2 aprovada.
- Folha isolada: `src/styles/parent-shell-refresh.css`, sem gradientes decorativos.
- Shell: largura total, sidebar desktop, topbar contextual e navegacao inferior mobile com `aria-current`.
- Contratos: as abas `home`, `missions`, `rewards`, `stats` e `settings` continuam apontando para os mesmos fluxos.
- Estado: plano Free/Premium, filhos, pendencias, resgates, timers, loading e retry continuam derivados das mesmas fontes.
- Rolagem: desktop mantem header fixo e rola somente o workspace; mobile rola a pagina; troca de aba restaura o topo nos dois modos.
- Browser autenticado em modo somente leitura: 1440x900, 768x1024 e 390x844 sem overflow horizontal; cinco abas e rotulos responsivos aprovados.
- Console: uma nova aba do preview abriu sem erros ou avisos.
- Conta QA: criada apenas para isolamento, removida pela Edge `delete-account`; perfil ausente e novo login retornou `Invalid login credentials`.
- Automacao: 24/24 testes, lint estrito e build PWA aprovados.
- Estado vivo: nenhum push, deploy, SQL ou liberacao; nenhum dado QA residual.

## 9. Evidencia da Etapa 4A

- Branch: `codex/refresh-visual-etapa-4a`, derivada da Etapa 3 aprovada.
- Folha isolada: `src/styles/parent-home-refresh.css`, sem gradientes decorativos.
- Home: resumo familiar, progresso diario, KidCoins, pendencias, timers e sequencia reorganizados para leitura rapida.
- Acoes: aprovacoes, entregas, revisao de missoes, controles de timer e gestao dos filhos preservam os handlers e RPCs existentes.
- Concorrencia: revisao de missao agora bloqueia reenvio enquanto a chamada esta em andamento; filas e timers mantem estados `disabled` e `aria-busy`.
- Filhos: progresso acessivel, extrato, tropeço, edicao, resgate e marcacao rapida permanecem disponiveis sem consulta adicional.
- Hierarquia de acoes: edicao fica no cabecalho do perfil; extrato e resgate formam o grupo operacional; tropeço aparece separado como acao de correcao.
- Convite: limites Free/Premium, copia e regeneracao continuam usando os contratos comerciais existentes.
- Acessibilidade: um `main`, barras de progresso nomeadas, nenhum botao sem nome, nenhum `id` duplicado e foco visivel.
- Browser autenticado em modo somente leitura: 1440x900, 768x1024 e 390x844 sem overflow horizontal ou sobreposicao da navegacao; transicao entre Inicio e Missoes restaura o topo.
- Console: nova aba do preview sem erros ou avisos da aplicacao.
- Automacao: 25/25 testes, lint estrito e build PWA aprovados; dependencias de producao sem vulnerabilidade alta.
- Estado vivo: nenhum dado foi criado, editado ou excluido; nenhum push, deploy, SQL ou liberacao.

## 10. Evidencia da Etapa 4B

- Branch: `codex/refresh-visual-etapa-4b`, derivada da Etapa 4A aprovada.
- Folha isolada: `src/styles/parent-missions-refresh.css`, sem gradientes decorativos e com breakpoints dedicados.
- Hierarquia: cabecalho resume missoes ativas, arquivadas e limite Free; criacao, catalogo ativo e arquivo possuem areas distintas.
- Criacao: formulario semantico com titulo, icone, recorrencia, KidCoins, XP, duracao, validacao local e estado ocupado.
- Catalogo: frequencia, valores e duracao sao escaneaveis; reordenacao por arrastar no desktop e por botoes acessiveis em qualquer dispositivo.
- Edicao: dialogo acessivel preserva recorrencia, valores, duracao e arquivamento, permanecendo aberto quando o backend rejeita a operacao.
- Corretude: criacao e edicao tratam respostas `success: false`; falha de duracao nao e sobrescrita por sucesso; reordenacao trata erro e restaura o estado autoritativo.
- Plano: reativacao no Free falha fechada no frontend; `supabase_harden_reactivation_limits.sql` prepara limite atomico compartilhado por trigger e RPC com lock e ACL restrita.
- Banco: a migration foi apenas preparada e referenciada no source of truth; nao foi aplicada.
- Browser autenticado em modo somente leitura: 1440x900, 768x1024 e 390x844 sem overflow horizontal, texto cortado ou sobreposicao com a navegacao mobile.
- Acessibilidade: dialogo nomeado, `Esc`, foco visivel, controles rotulados, `aria-pressed`, `aria-expanded`, `aria-busy` e retorno de status da ordenacao.
- Automacao: 27/27 testes, lint estrito, build PWA, `git diff --check` e audit de producao aprovados.
- Estado vivo: nenhum dado foi criado, editado, reordenado, reativado ou arquivado; nenhum push, deploy, SQL ou liberacao.

## 11. Proxima Decisao

Iniciar a Etapa 4C em nova branch/commit para migrar recompensas, resgates e cancelamento sem duplo estorno. Estatisticas, conta e Premium permanecem em lotes posteriores; funcionalidades extras do Lovable continuam reservadas para triagem depois da Etapa 7.
