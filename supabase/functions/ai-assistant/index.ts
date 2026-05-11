const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY não configurado nos secrets do Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, context } = await req.json();
    let prompt = "";
    let isJson = false;

    if (action === "suggest_missions") {
      isJson = true;
      const childrenInfo = (context.children ?? [])
        .map((c: { name: string; age?: number; xp?: number }) =>
          `${c.name} (${c.age ?? "?"}anos, ${c.xp ?? 0}XP)`
        )
        .join(", ") || "crianças";
      const existingTitles = (context.existingMissions ?? [])
        .map((m: { title: string }) => m.title)
        .join(", ") || "nenhuma";

      prompt = `Você é especialista em gamificação educacional infantil. App: Missão Kids.

Família: ${childrenInfo}
Missões já cadastradas: ${existingTitles}

Gere 5 missões NOVAS, criativas e adequadas às idades. Retorne APENAS JSON válido sem markdown:
[{"title":"Nome da missão","emoji":"emoji","coins_reward":20,"xp_reward":15,"description":"Descrição curta e motivadora"}]

Regras: missões rotineiras+educativas, coins 10-50, XP 10-40, português BR, não repita existentes, emojis relevantes.`;

    } else if (action === "weekly_report") {
      const childrenInfo = (context.children ?? [])
        .map((c: { name: string; age?: number; xp?: number; kidcoins?: number; streak?: number }) =>
          `- ${c.name}: ${c.xp ?? 0}XP, ${c.kidcoins ?? 0} KidCoins, streak ${c.streak ?? 0}d`
        )
        .join("\n") || "Nenhum filho cadastrado";

      prompt = `Você é especialista em desenvolvimento infantil. App Missão Kids.

Família ${context.familyName ?? ""}:
${childrenInfo}

Gere um relatório semanal motivador em português (máx 180 palavras) com emojis. Estruture assim:
1. 📊 Resumo do desempenho geral
2. ⭐ Destaque positivo de cada criança pelo nome
3. 💡 Uma dica construtiva e gentil
4. 🚀 Mensagem motivacional para a próxima semana`;

    } else if (action === "motivational") {
      prompt = `Você é o Capitão Rotina, mascote divertido do app Missão Kids.

${context.childName ?? "A criança"} (${context.age ?? "?"}anos, nível ${context.level ?? 1}) acabou de concluir "${context.missionName ?? "uma missão"}" e ganhou ${context.coins ?? 0} KidCoins e ${context.xp ?? 0}XP!

Escreva uma mensagem motivacional CURTA (máx 25 palavras) em português, com emojis, bem animada e adequada para crianças. Use o nome da criança. Retorne APENAS a mensagem, sem aspas ou formatação extra.`;

    } else if (action === "surprise_mission") {
      isJson = true;
      prompt = `Você é especialista em gamificação para crianças. App Missão Kids.

Criança: ${context.childName ?? "Aventureiro"}, ${context.age ?? "?"}anos, nível ${context.level ?? 1} (${context.levelName ?? "Recruta"}), ${context.xp ?? 0}XP.

Crie UMA missão surpresa criativa e realizável hoje. Retorne APENAS JSON válido sem markdown:
{"title":"Nome da missão","emoji":"emoji","coins_reward":30,"xp_reward":25,"description":"Você deve... (instrução clara)"}

Regras: criativa e diferente de rotinas normais, adequada à idade, coins 20-60, XP 15-50, português BR, descrição em 2ª pessoa.`;

    } else {
      return new Response(
        JSON.stringify({ error: `Ação desconhecida: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 1024 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 300)}`);
    }

    const geminiData = await geminiRes.json();
    let result: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    result = result.trim();

    if (isJson) {
      result = result.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
      JSON.parse(result); // throws if invalid
    }

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
