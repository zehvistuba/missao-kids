# 🛟 RotinUp — Guia de Continuidade e Recuperação

> **Leia isto primeiro se algo deu errado (bug, PC quebrou, perdi o histórico).**
> Atualizado em: 19/06/2026.

---

## 0. CALMA — sua criação NÃO está no seu PC

Tudo de importante vive na **nuvem**. Se o computador quebrar, formatar, ou você trocar de máquina, **nada disso some**:

| O quê | Onde vive (nuvem) | Some se o PC quebrar? |
|---|---|---|
| **Código do app** | GitHub | ❌ Não |
| **Banco de dados** (usuários, missões, coins…) | Supabase | ❌ Não |
| **Site no ar** | Vercel | ❌ Não |
| **Pagamentos** | Hotmart | ❌ Não |

O seu PC é só uma **janela** pra editar. **Enquanto o código estiver "pushado" no GitHub, você está protegido.** A regra de ouro: **sempre que mexer, suba pro GitHub** (o assistente já faz isso a cada mudança).

---

## 1. MAPA — onde tudo está

| Recurso | Endereço |
|---|---|
| **App em produção** | https://missao-kids.vercel.app |
| **Código (GitHub)** | https://github.com/zehvistuba/missao-kids |
| **Banco / Login / Funções (Supabase)** | Projeto `intieqgjmprxatvogxkh` — https://supabase.com/dashboard/project/intieqgjmprxatvogxkh |
| **Deploy (Vercel)** | https://vercel.com → projeto **missao-kids** |
| **Pagamentos (Hotmart)** | Painel Hotmart (produto RotinUp) |
| **IA** | Google Gemini (chave guardada nos *Secrets* do Supabase) |
| **Webhook Hotmart** | `https://intieqgjmprxatvogxkh.supabase.co/functions/v1/hotmart-webhook?hottok=SEU_TOKEN` |
| **Contato/Marca** | JV Digital · contato@jvdigital.com.br · privacidade@jvdigital.com.br · WhatsApp (44) 99114-1555 |

---

## 2. CONTAS que você precisa CONSEGUIR ACESSAR (guarde as senhas!)

⚠️ **NÃO escreva as senhas neste arquivo** (ele está no GitHub). Guarde-as num **gerenciador de senhas** (ex.: Bitwarden grátis, ou o do Google/Apple). Se perder o acesso a qualquer uma destas, fica difícil recuperar:

- [ ] **GitHub** (zehvistuba) — guarda o código.
- [ ] **Supabase** — guarda o banco e as funções.
- [ ] **Vercel** — publica o site.
- [ ] **Hotmart** — recebe os pagamentos.
- [ ] **Google** (conta do Gemini + login OAuth do app).
- [ ] **E-mail da marca** (jvdigital / futuro rotinup).

👉 **Ação recomendada:** instale um gerenciador de senhas e salve essas 6 contas hoje. É o que mais te protege.

---

## 3. Como CONTINUAR A CONVERSA com o assistente (Claude)

O assistente guarda a "memória" do projeto em arquivos **no seu PC**, na pasta:
`C:\Users\zehvi\.claude\projects\...\memory\` (arquivos `MEMORY.md` e `project_*.md`).

**Para retomar do zero (PC novo ou histórico perdido):**
1. Instale o Claude Code e abra a **pasta do projeto** (depois de clonar — ver seção 4).
2. Diga ao assistente: **"Leia o CONTINUIDADE.md e o histórico do git (git log) pra retomar o contexto do projeto."**
3. Este arquivo + o histórico de commits contam toda a história. O assistente reconstrói o contexto a partir daí.

💡 **Dica extra de segurança:** de vez em quando, copie a pasta `memory` acima pra um pen drive ou Google Drive. Ela tem o "resumo de cérebro" do projeto.

---

## 4. Como RECUPERAR o ambiente num PC NOVO

```bash
# 1. Instale: Node.js (nodejs.org) e Git (git-scm.com)

# 2. Baixe o código
git clone https://github.com/zehvistuba/missao-kids.git
cd missao-kids

# 3. Instale as dependências
npm install

# 4. Crie um arquivo .env na raiz com as variáveis (valores na seção 5)
#    VITE_SUPABASE_URL=...
#    VITE_SUPABASE_ANON=...
#    VITE_VAPID_PUBLIC_KEY=...

# 5. Rode local
npm run dev
```

Para publicar mudanças: basta **`git push`** — a **Vercel publica sozinha** a cada push na branch `main`.

Para mexer nas **funções do Supabase** (edge functions), use o `supabase.exe`:
```bash
./supabase.exe login                 # abre o navegador, autoriza
./supabase.exe functions deploy ai-assistant --project-ref intieqgjmprxatvogxkh
./supabase.exe functions deploy hotmart-webhook --no-verify-jwt --project-ref intieqgjmprxatvogxkh
# (push-notify também existe; só re-deploya se mudar)
```

---

## 5. VARIÁVEIS e SEGREDOS (onde estão — NÃO ficam aqui)

**No app (frontend) — ficam na Vercel → Settings → Environment Variables:**
- `VITE_SUPABASE_URL` → `https://intieqgjmprxatvogxkh.supabase.co`
- `VITE_SUPABASE_ANON` → a **publishable key** do Supabase (Settings → API)
- `VITE_VAPID_PUBLIC_KEY` → chave pública das notificações

**No Supabase → Edge Functions → Secrets:**
- `GEMINI_API_KEY` (IA)
- `HOTMART_HOTTOK` (segredo do webhook — **trocar por um forte!**)
- VAPID público/privado (notificações)
- `SERVICE_ROLE_KEY` (usado pelo webhook)
- `rotinup_cron_secret` (no Vault — usado pelos lembretes automáticos)

> Se precisar dos valores, eles aparecem nos painéis acima. **Nunca cole segredos neste arquivo** (ele é público no GitHub).

---

## 6. ESTADO ATUAL do produto (o que está pronto)

**Funcionalidades:**
- App de rotina infantil gamificada (responsável + criança), PWA instalável.
- Missões (com frequência e **duração/cronômetro ▶️**), recompensas (incl. **recompensa de tempo** com cronômetro), KidCoins, XP, níveis, sequências (streaks), conquistas.
- Resgate de recompensa em **3 etapas** (criança pede → adulto aprova → entrega).
- Tropeços (descontos), extrato, ranking entre irmãos.
- **IA (Gemini):** Capitão Rotina (incentivo), sugestão de missões, relatório semanal, missão surpresa.
- **Notificações push** (lembretes diários + streak em risco + cronômetros).
- Planos **Free/Premium** via **Hotmart** (webhook automático).
- Painel **Admin** (gestão de famílias/planos).
- Abas do adulto: Início · Missões · Recompensas · Stats · **Conta**.
- LGPD: termos + política, exclusão de conta, disclosure de IA.

**Checkup de segurança/qualidade (jun/2026) — concluído:**
- ✅ IA exige login (anti-abuso/custo).
- ✅ Webhook Hotmart "falha fechado".
- ✅ Bug de função duplicada (`update_child`) corrigido.
- ✅ LGPD: disclosure de IA preciso.
- ✅ Vários ajustes de UX e visual (telas principais + abas repaginadas).

---

## 7. PENDÊNCIAS (o que fazer a seguir)

- [ ] 🔒 **Rotacionar o `HOTMART_HOTTOK`** por um segredo forte (Supabase + Hotmart, mesmo valor nos dois).
- [ ] 🧪 Testar logado: editar filho, Capitão Rotina, cronômetros, ícone da notificação, aba Conta.
- [ ] 🌐 **Domínio + Resend** (e-mail) → depois **ligar "Confirm email"** no Supabase. (Hoje está desligado de propósito, porque o e-mail só envia pro dono.)
- [ ] 📣 Go-to-market: **Hotmart com afiliados** (comissão recorrente + materiais) + **Google Play (TWA)** como descoberta orgânica.

---

## 8. SOCORRO RÁPIDO (se algo quebrar)

| Sintoma | Onde olhar |
|---|---|
| **App fora do ar / branco** | Vercel → Deployments → ver se o último deploy falhou. Reverter pro commit anterior se preciso. |
| **Login não funciona** | Supabase → Authentication. Verifique se as chaves na Vercel batem com Supabase → API. |
| **Pagamento não libera Premium** | Supabase → Edge Functions → Logs do `hotmart-webhook`. Conferir se `HOTMART_HOTTOK` bate com a URL na Hotmart. |
| **Notificação não chega** | Precisa de aparelho com notificação ativada (app → Conta → 🔔). Ver logs do `push-notify`. |
| **IA não responde** | Verificar `GEMINI_API_KEY` no Supabase + se o usuário está logado. |
| **Quero desfazer uma mudança** | `git log` (ver commits) → `git revert <commit>` ou voltar pro deploy anterior na Vercel. |

---

## 9. ROTINA DE BACKUP recomendada (5 min/mês)

1. **Código:** já está no GitHub a cada push. ✅ (o mais importante)
2. **Banco:** Supabase → Database → Backups (o plano Free tem backup automático limitado; para um dump manual, dá pra exportar). Vale fazer um **export periódico** quando tiver muitos usuários.
3. **Segredos/env:** mantenha uma cópia das variáveis num gerenciador de senhas.
4. **Memória do assistente:** copie a pasta `~/.claude/projects/.../memory` pro Drive de vez em quando.

---

> **Resumo de uma linha:** *Seu app vive no GitHub + Supabase + Vercel. Mantenha o acesso a essas contas, dê `git push` sempre, e este arquivo te traz de volta de qualquer lugar.*
