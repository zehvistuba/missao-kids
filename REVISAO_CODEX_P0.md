# Revisão de segurança v2 — `supabase_fix_p0_admin_escalation.sql`

Data: 2026-07-26  
Escopo: releitura integral das 397 linhas da v2 e cruzamento com os SQLs de contexto já revisados. Nenhum SQL foi aplicado e nenhum estado do banco vivo foi presumido.

## Veredito executivo

**GO COM RESSALVAS, condicionado à conferência e aprovação da FASE 0 antes de executar a FASE 1.**

A v2 corrige os bloqueios estruturais do parecer anterior. Não encontrei P0/P1 intrínseco ao código conhecido que exija impedir a aplicação depois de satisfeitas as precondições abaixo. Se qualquer precondição P0/P1 da FASE 0 falhar, o veredito para aquela execução volta a ser **NO-GO** até corrigir o dado, a função ou a policy revelada.

O vetor original fica fechado em profundidade:

- signup e backfill só produzem `child` ou `parent` (`supabase_fix_p0_admin_escalation.sql:138-192`);
- as três RPCs conhecidas usam `is_platform_admin() IS NOT TRUE` (`:212-214`, `:246-248`, `:278-280`);
- `hotmart_events` tem RLS habilitado e a policy nominal usa o gate (`:318-327`);
- alteração de funções, policy e varredura ocorre em uma transação (`:114-340`);
- as RPCs administrativas deixam de herdar `EXECUTE` de `PUBLIC` (`:232-233`, `:265-266`, `:290-291`);
- a limpeza QA não é mais executável acidentalmente junto com o P0 (`:389-396`).

## Resposta objetiva: o que ainda bloqueia

### Bloqueios do arquivo, independentemente do banco vivo

**Nenhum P0 ou P1 bloqueante foi identificado no caminho conhecido, desde que a FASE 0 seja realmente conferida e que a FASE 1 seja executada como bloco único por um papel confiável.**

Há uma limitação P2 no detector textual do bloco 7: procurar a substring `is_platform_admin` não prova semanticamente que o resultado da função seja usado como gate. Isso não bloqueia esta aplicação se 0a confirmar exatamente as três assinaturas conhecidas, pois as três são recriadas com gates corretos antes do detector. A limitação volta a ser P0 se existir uma função extra e o operador confiar somente na busca textual sem revisar/endurecer o corpo.

### Condições da FASE 0 que bloqueiam se não forem satisfeitas

| Prioridade | Condição | Decisão |
|---|---|---|
| P0 | `0a` deve mostrar apenas `admin_get_families()`, `admin_set_plan(uuid,text)` e `admin_delete_family(uuid)` como `admin_*`, ou qualquer função extra precisa ser revisada e endurecida explicitamente antes da FASE 1. | Função extra desconhecida ou overload não revisado: **não aplicar**. |
| P0 | A conta de `0e` deve ser exatamente uma conta existente, pertencente ao dono pretendido, com o e-mail esperado e confirmação coerente (`email_confirmed_at`). | Zero linha, mais de uma linha ou identidade não comprovada: **não aplicar**. |
| P0 | `0b` não pode revelar outra policy permissiva de `SELECT` que dê acesso a `hotmart_events`. | Policy alternativa ampla: remover/endurecer na mesma mudança antes de aplicar. RLS desligado, isoladamente, não bloqueia porque `:321` o habilita. |
| P0 | O owner de `is_platform_admin()` mostrado por `0a` deve ser um papel administrativo confiável. `CREATE OR REPLACE` preserva owner preexistente. | Owner não confiável: alterar ownership para papel controlado antes/do mesmo patch. |
| P1 | `0c` deve confirmar quais admins são legítimos; o produto deve aprovar que somente o e-mail allowlisted mantenha essa identidade. | Outro admin legítimo: ampliar o modelo de allowlist ou obter aprovação para demovê-lo antes de aplicar. |
| P1 | `0g` e a regra atual do produto devem confirmar FREE=`max_co_parents=1`. | Se o vivo/produto usa 2, ajustar `:256` antes de aplicar. |
| P1 | O executor da FASE 1 deve ser um papel administrativo confiável, esperado como `postgres` no SQL Editor. | Não executar como `authenticated`, `anon` ou papel não confiável. |

Também recomendo conferir o owner de `handle_new_user()`. Ele não aparece em 0a, e `CREATE OR REPLACE` em `:142` também preserva o owner existente. Isso é uma precondição simples de ownership, não evidência de que o owner vivo esteja errado.

## Validação das mudanças da v2

### 1. Bloco 7 fail-closed

O bloco agora percorre **todas** as entradas `public.admin_*`, sem excluir os três nomes conhecidos (`supabase_fix_p0_admin_escalation.sql:299-315`). Assim:

- overload com assinatura diferente é examinado;
- nome desconhecido, como `admin_get_stats`, é examinado;
- qualquer definição que não contenha `is_platform_admin` provoca `RAISE EXCEPTION`;
- como o bloco está antes do `COMMIT`, a exceção aborta a transação inteira.

Portanto, ele corrige o falso negativo por assinatura/nome da v1.

Ressalva: `pg_get_functiondef(...) NOT ILIKE '%is_platform_admin%'` em `:307` é análise textual, não semântica. Uma ocorrência em comentário, literal, nome como `not_is_platform_admin`, ramo morto ou chamada cujo retorno seja ignorado passa no teste. A forma mais forte seria exigir o conjunto exato de `regprocedure`s aprovado ou manter uma allowlist de assinaturas cujos corpos foram revisados. Para esta aplicação, a regra operacional deve ser:

1. se 0a mostrar somente as três assinaturas conhecidas, o detector é defesa adicional e o resultado é suficiente;
2. se houver qualquer função extra, revisar o corpo completo exibido por 0a e não depender apenas da substring;
3. adicionar a função extra ao patch somente após inserir um gate fail-closed real e revisar seus grants.

V3b (`:370-374`) **lista**, mas não faz assertion SQL de “exatamente três”. O operador precisa contar/comparar as assinaturas. Isso é P2 de automação, não bloqueio se a conferência humana for feita.

### 2. Transação e ordem

`BEGIN` está em `:114`, o detector roda em `:299-315`, a policy e a varredura ainda estão dentro da transação, e `COMMIT` ocorre apenas em `:340`. Uma falha de `DROP`, `CREATE`, `REVOKE`, detector, policy, trigger ou varredura impede o commit do conjunto.

`NOTIFY pgrst` em `:342`, após o commit, é correto: o PostgREST só recebe reload de uma alteração já persistida. Se o `NOTIFY` isolado falhar, o fix já estará commitado e será necessário reenviar o reload; isso é recuperação operacional, não inconsistência do banco.

A ordem também é adequada: cria o gate, fecha novos signups, faz o backfill seguro, recria/restringe as RPCs, valida todas as `admin_*`, endurece a policy e somente então corrige dados antigos.

### 3. FASE 0 ampliada

A FASE 0 agora cobre os pontos necessários:

- `0a` exibe assinatura, owner, `SECURITY DEFINER`, `proconfig`, ACL e corpo completo (`:48-60`);
- `0b` exibe todas as policies relevantes e o estado de RLS (`:62-69`);
- `0c/0d` inventariam admins normalizados e todos os valores de role (`:71-82`);
- `0e` mostra UUID, e-mail e confirmação da conta dona (`:84-87`);
- `0f` mostra FKs diretas para `auth.users` e sua ação de delete (`:89-94`);
- `0g` mostra todos os corpos `admin_set_plan`, default e distribuição dos limites (`:96-108`).

Correção P2 recomendada em 0g: a consulta de `information_schema.columns` em `:101-103` deveria acrescentar `table_schema = 'public'`. Sem isso, outra tabela `families.max_co_parents` visível em outro schema pode produzir linha adicional. A distribuição seguinte usa `public.families`, então o operador ainda consegue perceber inconsistência; não é motivo para bloquear se a origem da linha for confirmada.

Também seria útil adicionar `SELECT current_user` e incluir `handle_new_user` no inventário de owner/ACL. Isso transforma as duas precondições de ownership em evidência explícita no mesmo relatório.

### 4. RLS e policy de `hotmart_events`

`ALTER TABLE public.hotmart_events ENABLE ROW LEVEL SECURITY` em `:321` é idempotente e corrige o caso de RLS desligado. A policy criada em `:323-327` usa apenas `public.is_platform_admin()` como `USING`.

A policy está correta isoladamente. A ressalva de OR entre policies permissivas continua válida e foi corretamente documentada em `:319-320`; por isso a saída de 0b é condição P0 operacional. `relforcerowsecurity = false` não é problema para clientes `authenticated/anon`; owners e `service_role` podem legitimamente bypassar conforme o modelo Supabase.

### 5. ACLs e exposição via PostgREST

As três RPCs são recriadas, têm o grant padrão de `PUBLIC` revogado e recebem `EXECUTE` explícito apenas para `authenticated` (`:232-233`, `:265-266`, `:290-291`). Isso preserva a exposição necessária ao painel via PostgREST autenticado e reduz a superfície anônima.

`is_platform_admin()` revoga `PUBLIC` e concede a `authenticated, anon` (`:134-135`). O grant a `anon` é justificável para a avaliação da policy: com `auth.uid() IS NULL`, `EXISTS` retorna `false`, permitindo negar linhas sem transformar a consulta em erro de permissão.

Default privileges vivos poderiam conceder diretamente `EXECUTE` a outros papéis mesmo após `REVOKE ... FROM PUBLIC`; isso não contorna o gate das três funções, mas `0a/proacl` deve ser guardado como evidência. Para uma ACL estritamente mínima, revogar também grants diretos indesejados se 0a os revelar.

### 6. Gates e `search_path`

Os gates agora usam `IS NOT TRUE`, portanto falham fechados inclusive se a função algum dia retornar `NULL` (`:212`, `:246`, `:278`). No corpo atual, `EXISTS` já garante booleano não nulo.

`is_platform_admin()` usa `SECURITY DEFINER`, `STABLE` e `SET search_path = pg_catalog, public` (`:120-131`). `auth.users` e `auth.uid()` estão qualificados; não identifiquei caminho de shadowing no corpo atual. O owner precisa ser confiável porque é ele quem fornece o privilégio para ler `auth.users` e quem pode redefinir a função.

### 7. Backfill e varredura corretiva

O backfill aplica a mesma allowlist de role do trigger e agora termina com `ON CONFLICT (id) DO NOTHING` (`:173-192`). Isso mantém idempotência e elimina a corrida de unicidade com signup concorrente.

A varredura usa `lower(trim(p.role)) = 'admin'` (`:333-338`), cobrindo `admin`, `ADMIN` e espaços. Ela preserva somente a conta cujo `auth.users.email`, após `lower`, é o e-mail allowlisted. A interação com `trg_protect_profile_columns` permanece correta quando a execução ocorre como `postgres`: o trigger `SECURITY INVOKER` bloqueia apenas `current_user IN ('authenticated','anon')` conforme `supabase_fix_audit_v2.sql:29-53`.

0d pode revelar outros valores-lixo além de variantes de admin. Eles não recuperam o acesso às três RPCs nem à policy, mas devem ser triados porque rotinas históricas podem autorizar por negação de `role='child'`. Isso é dívida separada; não deve atrasar o fechamento do P0, salvo se a análise viva encontrar um novo caminho de privilégio equivalente.

### 8. Limpeza QA

A instrução está inteiramente comentada em `:389-396`, fora da transação e acompanhada de aviso explícito. Portanto ela não é executada ao aplicar a v2. A auditoria 0f é útil para uma operação futura, mas FKs diretas não descrevem necessariamente toda a cadeia de cascatas; a limpeza deve continuar como mudança separada.

## Decisões mantidas

### Allowlist por e-mail

**Concordo como decisão aceitável para este P0, com a condição de 0e.**

Se 0e comprovar uma única conta já existente, pertencente ao dono pretendido, o atacante não consegue criar uma segunda conta com o mesmo e-mail enquanto a unicidade do Supabase estiver vigente. A função ainda liga o e-mail ao `auth.uid()` da linha viva em `auth.users` (`:127-131`), o que é superior a confiar em `user_metadata` e revoga acesso imediatamente se o e-mail da conta mudar.

O risco residual é de ciclo de vida: exclusão/recriação da conta, transferência do endereço, configuração de confirmação e erro operacional na constante. UUID reduz esses riscos e continua sendo hardening recomendado, mas não é bloqueio para o patch emergencial quando 0e confirma a identidade atual. O operador deve verificar a linha, não apenas contar “1”.

### `get_family_id_by_email`

Concordo que não precisa entrar nesta transação P0. A rotina continua sendo um item **P1 de triagem separado**, pois `supabase_final_deploy.sql:32-46` não autoriza o chamador e sua exposição depende da ACL viva. A ação separada deve consultar `has_function_privilege`/ACL e restringir a execução ao backend/webhook ou adicionar gate adequado. Não atrasaria a correção do auto-admin por esse item independente.

### Role familiar versus admin de plataforma

Concordo em tratar separadamente. As rotinas locais que aceitam `parent/admin` continuam limitadas à família nos corpos revisados; a v2 remove `profiles.role` da autorização global. Separar `platform_admin` de role familiar é melhoria arquitetural P2/P1 conforme a rotina, não bloqueio deste P0.

### Fonte única de limites e FREE=1

Concordo em não ampliar este patch, desde que 0g confirme a regra FREE=1 antes da aplicação. A inconsistência histórica permanece item separado de triagem: FREE=1/2 e Premium=10/20 ainda aparecem em scripts diferentes. Se 0g ou a regra atual apontar 2, a linha `:256` precisa ser corrigida antes da FASE 1; nesse caso há um bloqueio P1 operacional, não de segurança do gate.

## Idempotência

Em execuções sequenciais, a FASE 1 é idempotente no estado esperado:

- `CREATE OR REPLACE` mantém as duas funções auxiliares;
- `DROP IF EXISTS`/`CREATE` recria as três assinaturas conhecidas;
- ACLs são reaplicadas;
- backfill usa ausência de profile e `ON CONFLICT`;
- `ENABLE RLS` e `DROP POLICY IF EXISTS`/`CREATE POLICY` são repetíveis;
- demotion não reencontra roles já convertidas;
- toda falha anterior ao commit reverte o conjunto.

Overloads extras não são apagados automaticamente: um sem a substring causa rollback, e um com a substring exige revisão manual conforme 0a. Essa é uma escolha segura se o procedimento operacional for seguido.

## Verificação mínima antes e depois

Antes da FASE 1:

1. guardar as saídas completas de 0a–0g;
2. confirmar as três assinaturas exatas e revisar qualquer extra;
3. confirmar owner confiável de `is_platform_admin` e `handle_new_user`, além de `current_user` confiável;
4. validar conta dona/`email_confirmed_at` em 0e;
5. revisar todas as policies de `hotmart_events`;
6. aprovar admins a demover e FREE=1.

Depois do commit:

1. V3 deve retornar zero linhas e V3b exatamente as três assinaturas esperadas (`:362-374`);
2. V4 deve mostrar RLS ligado e nenhuma policy permissiva alternativa (`:376-380`);
3. V5 deve mostrar apenas o dono, ou nenhuma role admin se o profile dele não usar essa role (`:382-386`);
4. testar por API que um usuário comum recebe “Acesso negado” nas três RPCs;
5. testar que signup com metadata `admin`, `ADMIN` e ` Admin ` resulta em `parent`;
6. testar que usuário comum/anon não lê `hotmart_events`, enquanto a conta dona mantém o fluxo esperado.

## Conclusão final

**Veredito atualizado: GO COM RESSALVAS.**

Não restou P0/P1 incondicional que justifique manter o NO-GO da v1. Os itens realmente bloqueantes agora são resultados da FASE 0: identidade/ownership da allowlist, ausência ou revisão rigorosa de `admin_*` extras, ausência de policy permissiva alternativa, aprovação da demotion e confirmação de FREE=1. O detector textual e V3b ainda podem ser automatizados com mais rigor, mas, com exatamente as três assinaturas conhecidas e a conferência operacional documentada, não impedem aplicar o fix P0.
