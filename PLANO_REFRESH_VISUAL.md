# Plano de Refresh Visual - RotinUp

Data de abertura: 2026-08-16

Referencia visual: projeto Lovable `9a0585d6-c6dd-4fbe-8ed1-5d43f40c84eb`

Branch de trabalho: `codex/refresh-visual-etapa-1`

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

Status: proxima.

- Atualizar entrar, cadastrar, recuperar senha e estados de erro.
- Harmonizar TermsGate e modal juridico sem alterar a regra de aceite.
- Atualizar onboarding do responsavel e criacao de familia.
- Provar teclado, foco, leitores de tela, loading, offline e retry.

### Etapa 3 - Shell do responsavel

Status: pendente.

- Introduzir navegacao responsiva e tokens visuais no painel adulto.
- Preservar selecao de filho, plano, familia e permissoes.
- Validar densidade de informacao e ergonomia no uso recorrente.

### Etapa 4 - Fluxos centrais do responsavel

Status: pendente.

- Missoes, aprovacoes, cronometro e recorrencia.
- Recompensas, resgates e cancelamento sem duplo estorno.
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

## 7. Proxima Decisao

Iniciar a Etapa 2 em novo commit, mantendo a landing como baseline visual. Nao misturar neste lote alteracoes de dashboard, backend ou release.
