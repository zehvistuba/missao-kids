import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { createEdgeLogger, getErrorMetadata, getRequestId } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Actions that require Premium plan
const PREMIUM_ACTIONS = new Set(["weekly_report", "surprise_mission"]);
const ALLOWED_ACTIONS = new Set(["suggest_missions", "weekly_report", "motivational", "companion", "surprise_mission"]);
const MAX_PAYLOAD_BYTES = 64_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = getRequestId(req);
  const logger = createEdgeLogger("ai-assistant", requestId);
  if (req.method !== "POST") {
    logger.warn("method_not_allowed", { method: req.method });
    return respond({ error: "method_not_allowed", requestId }, 405);
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
    const supabaseUrl  = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!GEMINI_API_KEY || !supabaseUrl || !supabaseAnon) {
      logger.error("server_misconfigured", {
        has_gemini_credential: Boolean(GEMINI_API_KEY),
        has_supabase_url: Boolean(supabaseUrl),
        has_anon_credential: Boolean(supabaseAnon),
      });
      return respond({ error: "Serviço de IA temporariamente indisponível.", requestId }, 500);
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      logger.warn("payload_too_large", { content_length: contentLength });
      return respond({ error: "Solicitação muito grande.", requestId }, 413);
    }

    let body: { action?: string; context?: Record<string, unknown> };
    try {
      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYLOAD_BYTES) {
        logger.warn("payload_too_large", { measured: true });
        return respond({ error: "Solicitação muito grande.", requestId }, 413);
      }
      body = JSON.parse(rawBody);
    } catch (error) {
      logger.warn("invalid_json", getErrorMetadata(error));
      return respond({ error: "Body JSON inválido", requestId }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      logger.warn("invalid_body");
      return respond({ error: "Body JSON inválido", requestId }, 400);
    }

    const { action, context = {} } = body;
    if (!action || !ALLOWED_ACTIONS.has(action) || !context || typeof context !== "object" || Array.isArray(context)) {
      logger.warn("invalid_action", { action: action ?? "missing" });
      return respond({ error: "Ação inválida", requestId }, 400);
    }

    // Auth obrigatória em TODAS as ações — bloqueia abuso anônimo e custo aberto na IA.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logger.warn("unauthorized", { reason: "missing_bearer" });
      return respond({ error: "unauthorized", requestId }, 401);
    }
    const callerClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) {
      logger.warn("unauthorized", authErr ? getErrorMetadata(authErr) : { reason: "user_not_found" });
      return respond({ error: "unauthorized", requestId }, 401);
    }

    // Valide o entitlement antes de consumir a cota diária.
    if (action && PREMIUM_ACTIONS.has(action)) {
      const { data: plan, error: planError } = await callerClient.rpc("get_family_plan");
      if (planError) {
        logger.error("plan_lookup_failed", { action, ...getErrorMetadata(planError) });
        return respond({ error: "Não foi possível verificar seu plano agora.", requestId }, 503);
      }
      if (plan !== "premium") {
        logger.warn("premium_required", { action });
        return respond({ error: "premium_required", requestId }, 403);
      }
    }

    // Rate-limit por usuário/dia (cota decidida pelo plano no servidor) — anti-abuso/custo.
    // FAIL-CLOSED: se a cota não puder ser verificada (erro/RPC ausente), bloqueia.
    const { data: rl, error: rlErr } = await callerClient.rpc("ai_check_and_bump");
    if (rlErr || !rl || rl.allowed === false) {
      const msg = rlErr || !rl
        ? "Não foi possível verificar o limite de IA agora. Tente novamente em instantes."
        : `Limite de IA de hoje atingido (${rl.limit}/dia). Tente amanhã.`;
      logger.warn("quota_rejected", {
        action,
        dependency_error: Boolean(rlErr || !rl),
        limit: rl?.limit ?? null,
      });
      return respond({ error: msg, requestId }, 429);
    }
    let prompt = "";
    let isJson = false;

    if (action === "suggest_missions") {
      isJson = true;
      const childrenInfo = (context.children as Array<{ name: string; age?: number; xp?: number }> ?? [])
        .map((c) => `${c.name} (${c.age ?? "?"}anos, ${c.xp ?? 0}XP)`)
        .join(", ") || "crianças";
      const existingTitles = (context.existingMissions as Array<{ title: string }> ?? [])
        .map((m) => m.title)
        .join(", ") || "nenhuma";

      prompt = `Você é especialista em gamificação educacional infantil. App: RotinUp.

Família: ${childrenInfo}
Missões já cadastradas: ${existingTitles}

Gere 5 missões NOVAS, criativas e adequadas às idades. Retorne APENAS JSON válido sem markdown:
[{"title":"Nome da missão","emoji":"emoji","coins_reward":20,"xp_reward":15,"description":"Descrição curta e motivadora"}]

Regras: missões rotineiras+educativas, coins 10-50, XP 10-40, português BR, não repita existentes, emojis relevantes.`;

    } else if (action === "weekly_report") {
      const childrenInfo = (context.children as Array<{ name: string; age?: number; xp?: number; kidcoins?: number; streak?: number }> ?? [])
        .map((c) => `- ${c.name}: ${c.xp ?? 0}XP, ${c.kidcoins ?? 0} KidCoins, streak ${c.streak ?? 0}d`)
        .join("\n") || "Nenhum filho cadastrado";

      prompt = `Você é especialista em desenvolvimento infantil. App RotinUp.

Família ${context.familyName ?? ""}:
${childrenInfo}

Gere um relatório semanal motivador em português com emojis. Estruture assim:
1. 📊 Resumo do desempenho geral
2. ⭐ Destaque positivo de cada criança pelo nome
3. 💡 Uma dica construtiva e gentil
4. 🚀 Mensagem motivacional para a próxima semana`;

    } else if (action === "motivational") {
      prompt = `Você é o Capitão Rotina, mascote divertido do app RotinUp.

${context.childName ?? "A criança"} (${context.age ?? "?"}anos, nível ${context.level ?? 1}) acabou de concluir "${context.missionName ?? "uma missão"}" e ganhou ${context.coins ?? 0} KidCoins e ${context.xp ?? 0}XP!

Escreva uma mensagem motivacional CURTA (máx 25 palavras) em português, com emojis, bem animada e adequada para crianças. Use o nome da criança. Retorne APENAS a mensagem, sem aspas ou formatação extra.`;

    } else if (action === "companion") {
      // Capitão Rotina falando direto com a criança na home: saudação + 1 incentivo.
      // Mensagem gerada, de via única (NUNCA chat aberto). Contexto só são dados da própria criança.
      const streak       = Number(context.streak ?? 0);
      const left         = Number(context.missionsLeftToday ?? 0);
      const nextMission  = (context.nextMissionTitle as string) || "";
      const goalTitle    = (context.goalRewardTitle as string) || "";
      const goalGap      = Number(context.goalRewardGap ?? 0);
      const goalMissions = Number(context.goalRewardMissions ?? 0);

      prompt = `Você é o Capitão Rotina, mascote amigável do app RotinUp, falando direto com a criança.

Criança: ${context.childName ?? "Aventureiro(a)"} (${context.age ?? "?"} anos, nível ${context.level ?? 1} ${context.levelName ?? ""}). Sequência atual: ${streak} dias.
Hoje ainda faltam ${left} missão(ões)${nextMission ? `, a próxima sugerida é "${nextMission}"` : ""}.
${goalTitle ? `Está juntando para a recompensa "${goalTitle}" — faltam ${goalGap} moedas (cerca de ${goalMissions} missões).` : ""}

Escreva UMA mensagem curta (máximo 30 palavras), calorosa e encorajadora, em português do Brasil, com 1-2 emojis, na 2ª pessoa, usando o nome da criança. Adapte o tom à idade (mais simples e fofo se pequena; mais maduro e respeitoso se 13+). NÃO faça perguntas abertas, NÃO peça que ela responda, NÃO invente dados. Retorne APENAS a mensagem, sem aspas.`;

    } else if (action === "surprise_mission") {
      isJson = true;
      prompt = `Você é especialista em gamificação para crianças. App RotinUp.

Criança: ${context.childName ?? "Aventureiro"}, ${context.age ?? "?"}anos, nível ${context.level ?? 1} (${context.levelName ?? "Recruta"}), ${context.xp ?? 0}XP.

Crie UMA missão surpresa criativa e realizável hoje. Retorne APENAS JSON válido sem markdown:
{"title":"Nome da missão","emoji":"emoji","coins_reward":30,"xp_reward":25,"description":"Você deve... (instrução clara)"}

Regras: criativa e diferente de rotinas normais, adequada à idade, coins 20-60, XP 15-50, português BR, descrição em 2ª pessoa.`;

    } else {
      logger.warn("invalid_action", { action });
      return respond({ error: "Ação inválida", requestId }, 400);
    }

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: isJson ? 2048 : 4096,
          ...(isJson ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (!geminiRes.ok) {
      await geminiRes.body?.cancel();
      logger.error("provider_failed", { action, provider_status: geminiRes.status });
      return respond({ error: "Não foi possível gerar o conteúdo agora. Tente novamente.", requestId }, 502);
    }

    const geminiData = await geminiRes.json();
    let result: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    result = result.trim();

    if (isJson) {
      result = result.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
      try {
        JSON.parse(result);
      } catch {
        logger.error("invalid_provider_response", { action, response_length: result.length });
        return respond({ error: "A IA retornou uma resposta inválida. Tente novamente.", requestId }, 502);
      }
    }

    logger.info("request_completed", { action, result_length: result.length });
    return respond({ result, requestId });

  } catch (err: unknown) {
    logger.error("unexpected_error", getErrorMetadata(err));
    return respond({ error: "Erro interno ao processar sua solicitação.", requestId }, 500);
  }
});
