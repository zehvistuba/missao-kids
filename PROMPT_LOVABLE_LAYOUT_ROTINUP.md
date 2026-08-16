# Prompt mestre para o Lovable - Layout RotinUp

Copie e envie todo o conteúdo abaixo ao Lovable.

---

Quero que você atue como Product Designer sênior, UX Designer especializado em famílias e crianças, especialista em acessibilidade e Frontend Engineer React. Crie uma proposta completa de layout para o produto **RotinUp**, preservando rigorosamente os fluxos e as regras descritos neste briefing.

## 1. Objetivo

Redesenhar a experiência visual do RotinUp para que pareça um produto comercial maduro, confiável, divertido e fácil de usar. O resultado deve funcionar muito bem para:

- responsáveis adultos que configuram e acompanham a rotina;
- crianças que visualizam missões, progresso e recompensas;
- administrador da plataforma que acompanha famílias e erros;
- visitantes que ainda estão avaliando os planos.

O foco não é criar apenas uma landing page. O foco principal é o **aplicativo real**, com dashboards e fluxos completos. A landing pública também deve ser contemplada, mas não pode consumir a maior parte do trabalho.

## 2. Contexto do produto

O RotinUp transforma tarefas da rotina infantil em missões. A criança conclui atividades, recebe XP e KidCoins e pode trocar moedas por recompensas definidas pela família. O responsável cria e revisa missões, gerencia recompensas, acompanha evolução e usa recursos de IA.

Modelo atual do MVP:

- a conta principal é do responsável;
- o responsável cria e gerencia os perfis infantis;
- crianças são perfis gerenciados pela família;
- o responsável pode marcar e acompanhar ações em nome do filho;
- existe painel administrativo exclusivo do dono da plataforma;
- o produto é PWA e deve funcionar prioritariamente em celular, mas também em desktop.

## 3. Posicionamento visual

Quero uma identidade que combine:

- energia e motivação de jogo;
- segurança e confiança para os pais;
- clareza operacional de um aplicativo de rotina;
- personalidade infantil sem parecer produto para bebês;
- aparência premium suficiente para sustentar uma assinatura paga.

Evite:

- excesso de roxo/azul escuro em toda a interface;
- estética de cassino, moedas brilhando demais ou gamificação agressiva;
- excesso de gradientes, efeitos neon, blobs ou elementos decorativos soltos;
- cards dentro de cards;
- títulos gigantes dentro dos dashboards;
- aparência genérica de template SaaS;
- interfaces que dependam apenas de emojis como ícones;
- botões arredondados em formato de pílula para toda e qualquer ação;
- textos explicando a própria interface ou instruções óbvias na tela;
- personagens ou ilustrações que infantilizem adolescentes.

## 4. Direção de design

Crie um sistema visual próprio para o RotinUp:

- marca reconhecível já na primeira dobra;
- paleta equilibrada, usando laranja/coral como energia da marca, verde para progresso, amarelo para conquista, azul-ciano para informação e cores neutras profundas para estrutura;
- nenhuma família de cor deve dominar toda a experiência;
- tipografia muito legível e amigável, com hierarquia compacta nos dashboards;
- espaçamentos previsíveis e densidade confortável;
- cards com raio máximo de 8 px, exceto modais ou componentes que realmente peçam outro formato;
- ícones consistentes, preferencialmente Lucide;
- emojis apenas no conteúdo lúdico, como avatar, missão, recompensa e conquista;
- movimentos curtos e úteis para feedback de progresso, conclusão e mudança de estado;
- suporte a `prefers-reduced-motion`;
- contraste mínimo WCAG AA;
- foco visível, navegação por teclado e alvos de toque de pelo menos 44 px.

## 5. Arquitetura responsiva

Mobile é a experiência prioritária:

- viewport de referência: 390 x 844;
- navegação inferior fixa para as áreas principais;
- cabeçalhos compactos;
- ações primárias sempre alcançáveis;
- nenhum overflow horizontal ou texto cortado;
- áreas seguras para iPhone/Android e PWA instalada.

Desktop:

- viewport de referência: 1440 x 900;
- sidebar persistente para dashboards;
- conteúdo com largura útil, sem esticar listas indefinidamente;
- aproveitar espaço para comparação e visão geral, sem transformar tudo em cards decorativos;
- manter o mesmo modelo mental do mobile.

## 6. Telas públicas e autenticação

### Landing pública

Criar uma landing curta, objetiva e orientada à conversão:

- primeira dobra com marca RotinUp, oferta literal e visual real do produto;
- mostrar um dashboard verdadeiro ou composição de telas reais, não ilustração abstrata;
- CTA primário “Criar conta grátis” e secundário “Já tenho conta”;
- deixar uma parte da próxima seção visível na primeira dobra;
- explicar rapidamente missões, KidCoins, recompensas e acompanhamento familiar;
- comparação clara Free x Premium;
- mensal: R$ 14,90/mês;
- anual: R$ 149,90/ano, aproximadamente R$ 12,49/mês;
- checkout processado pela Hotmart;
- acesso evidente a Termos e Privacidade.

### Login e cadastro

- login por e-mail/senha e Google;
- recuperação de senha;
- cadastro de responsável;
- checkbox obrigatório e versionado de Termos, Privacidade e consentimento parental;
- erros persistentes e acionáveis;
- loading sem deslocar o layout;
- opção clara para alternar entre login e cadastro.

### Aceite de termos

- gate obrigatório para responsáveis sem a versão atual;
- resumo legível do consentimento;
- checkbox explícito;
- acesso ao texto completo;
- ações “Aceitar e continuar” e “Sair”.

## 7. Onboarding do responsável

Projetar um onboarding curto e progressivo:

1. nome da família;
2. criação do primeiro perfil infantil;
3. confirmação e entrada no dashboard.

Requisitos:

- mostrar progresso sem criar um wizard cansativo;
- não prometer login individual da criança;
- explicar apenas o necessário no momento;
- estados de erro e retry;
- opção segura de sair da conta.

## 8. Dashboard do responsável

Navegação principal:

- Início;
- Missões;
- Recompensas;
- Estatísticas;
- Conta.

### Início

- saudação e resumo do dia;
- pendências de aprovação em primeiro plano;
- filhos e progresso de cada um;
- missões concluídas x total;
- KidCoins, streak e timers ativos;
- alertas úteis sem excesso de banners;
- estado vazio quando ainda não há filho ou missão;
- CTA contextual para a próxima ação mais importante.

### Missões

- lista ordenável;
- criar, editar, arquivar e reativar;
- frequência diária, semanal, quinzenal e mensal;
- KidCoins, XP e duração;
- visualizar conclusão por filho;
- marcar em nome da criança;
- aprovar ou rejeitar pendências;
- sugestões de missão por IA;
- limites Free claramente apresentados apenas quando relevantes.

### Recompensas

- criar, editar, arquivar e reativar;
- custo em KidCoins;
- recompensa comum ou com cronômetro;
- resgatar em nome do filho;
- fluxo em três etapas: solicitado, aprovado, entregue;
- cancelar sem ambiguidade;
- iniciar, pausar, retomar e concluir cronômetro;
- mostrar timers simultâneos de recompensas diferentes sem confusão.

### Estatísticas

- visão por filho e visão familiar;
- evolução de XP;
- missões concluídas;
- KidCoins ganhos e gastos;
- streak;
- histórico recente;
- relatório semanal por IA para Premium;
- gráficos simples, legíveis e úteis, sem visualização decorativa.

### Conta

- editar nome;
- plano atual e upgrade;
- notificações push;
- co-responsáveis;
- Termos e Privacidade;
- botão “Reportar um problema”;
- sair;
- exclusão de conta com confirmação persistente e consequências claras.

## 9. Experiência infantil

Navegação principal:

- Início;
- Loja;
- Conquistas;
- Perfil.

### Início da criança

- avatar, nome, nível e XP;
- KidCoins disponíveis;
- streak;
- missão prioritária e lista de missões atuais;
- marcar missão como concluída;
- status aguardando aprovação;
- mensagem curta do Capitão Rotina;
- objetivo de recompensa;
- visual lúdico, mas muito legível.

### Loja

- saldo sempre visível;
- recompensas disponíveis;
- seletor de quantidade quando aplicável;
- confirmação de resgate;
- pedidos aguardando aprovação ou entrega;
- cancelar pedido quando permitido;
- timers ativos com controles claros.

### Conquistas

- progresso por conquista;
- bloqueadas x desbloqueadas;
- celebração curta ao desbloquear;
- níveis de Recruta a Supremo.

### Perfil

- avatar;
- nível, XP, KidCoins e streak;
- histórico de missões, resgates e tropeços;
- comparação familiar apenas quando saudável e não punitiva;
- exclusão do perfil/conta quando esse fluxo estiver disponível.

## 10. Painel administrativo

O painel é operacional, discreto e orientado a trabalho. Não deve parecer uma landing.

Áreas:

- Famílias;
- Erros.

### Famílias

- busca por família, responsável ou e-mail;
- plano Free/Premium;
- número de filhos;
- data de criação;
- alterar plano com confirmação;
- remover família com confirmação forte;
- resumo de conversão Free/Premium.

### Erros

- filtros: abertos, resolvidos e ignorados;
- diferenciar reporte automático e relato do usuário;
- mostrar referência, mensagem sanitizada, origem, ação, tela, versão, horário e ocorrências;
- resolver, ignorar e reabrir;
- não exibir stack trace bruto, senha, token, documento ou dados de pagamento;
- layout denso, escaneável e adequado a suporte.

## 11. Estados obrigatórios

Para cada tela relevante, desenhar:

- carregando;
- vazio;
- sucesso;
- erro persistente com retry;
- offline;
- ação desabilitada;
- limite de plano atingido;
- confirmação destrutiva;
- sessão expirada;
- permissão negada;
- atualização do PWA disponível.

Toasts podem ser usados para confirmações reversíveis. Exclusão, pagamento e falhas críticas não podem desaparecer em três segundos sem alternativa persistente.

## 12. Componentes esperados

Criar e documentar um design system leve:

- cores semânticas e tokens;
- tipografia;
- grid e espaçamento;
- botões primário, secundário, destrutivo e ícone;
- campos, select, textarea, checkbox, toggle e stepper;
- tabs e navegação;
- lista de missão;
- item de recompensa;
- perfil infantil;
- barra de XP;
- saldo KidCoins;
- badge de status;
- timer;
- modal/dialog acessível;
- toast e alerta persistente;
- skeleton;
- empty state;
- bloco de erro com retry;
- card de plano;
- linha operacional do admin.

Não crie componentes visuais sem uso real em alguma tela.

## 13. Restrições técnicas obrigatórias

O produto existente usa:

- React 19;
- Vite;
- Supabase Auth, banco, RPCs e Edge Functions;
- PWA;
- CSS atualmente majoritariamente inline.

Sua proposta deve:

- entregar componentes React reutilizáveis;
- usar CSS organizado por tokens e componentes, sem dependência obrigatória de Tailwind;
- preferir Lucide para ícones;
- preservar os nomes e contratos das operações existentes;
- não alterar banco, RLS, autenticação, RPCs, Edge Functions, Hotmart ou regras de negócio;
- não inventar endpoints;
- não colocar `service_role` ou segredos no frontend;
- não substituir Supabase por outro backend;
- não implementar dados falsos como se fossem produção;
- usar mocks claramente separados apenas para demonstrar o layout;
- manter textos em português do Brasil;
- deixar preparada a integração com os dados reais via props e adapters.

## 14. Regras de produto que não podem mudar

- Free: 1 filho, 1 responsável, até 5 missões ativas e 3 recompensas ativas.
- Premium: até 10 filhos e 10 responsáveis, missões e recompensas ilimitadas.
- IA: 40 chamadas por dia no Free e 200 no Premium.
- Premium mensal: R$ 14,90.
- Premium anual: R$ 149,90.
- Consentimento parental é obrigatório e versionado.
- Exclusão de conta precisa ser real e irreversível após confirmação.
- Crianças pertencem apenas à própria família.
- Nenhum dado de outra família pode aparecer.
- Admin da plataforma não é um papel autoatribuível.
- Pagamento é processado pela Hotmart.
- Erros técnicos são sanitizados antes de aparecer no painel.

## 15. Entregáveis

Entregue:

1. mapa de telas e navegação;
2. direção visual resumida;
3. tokens do design system;
4. layouts completos mobile e desktop;
5. componentes React reutilizáveis;
6. estados loading, vazio, erro, offline e confirmação;
7. dados de demonstração isolados;
8. checklist de acessibilidade;
9. checklist responsivo em 390x844, 768x1024 e 1440x900;
10. lista explícita do que é apenas visual e ainda precisa ser conectado ao app real.

## 16. Critérios de aceite

A proposta só está pronta quando:

- o primeiro frame útil é o app ou uma landing curta com produto real visível;
- os dashboards de responsável, criança e admin estão completos;
- nenhuma tela principal depende de cards aninhados;
- nenhuma ação crítica ficou sem loading, erro e confirmação;
- nenhum texto estoura seu contêiner nas três larguras de referência;
- a navegação funciona por teclado;
- modais prendem foco, fecham com Esc e devolvem foco ao gatilho;
- todos os botões têm rótulo acessível;
- o layout não altera nenhuma regra de negócio;
- o resultado parece um produto familiar confiável, não um template genérico.

Antes de finalizar, faça uma auditoria visual tela por tela como responsável, criança e administrador. Liste qualquer fluxo que permaneceu apenas demonstrativo.

---

Observação ao Lovable: não publique, não conecte a produção e não execute migrations. Entregue somente a proposta visual e o código de layout para revisão.
