import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callGemini(prompt: string): Promise<string> {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
          }),
    });

  if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error: ${err}`);
  }

  const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
          return new Response("ok", { headers: corsHeaders });
    }

        try {
              const { type, data } = await req.json();
              let result: any = "";

      if (type === "suggest_missions") {
              const { childName, age, completedMissions } = data;
              const prompt = `Voce e um assistente especializado em desenvolvimento infantil e gamificacao educacional.

              Sugira 5 missoes/tarefas adequadas para uma crianca chamada ${childName} de ${age} anos.
              ${completedMissions?.length > 0 ? `Missoes ja completadas: ${completedMissions.join(", ")}.` : ""}

              Para cada missao, forneca:
              - Nome da missao (curto e divertido)
              - Descricao breve (1-2 frases)
              - Pontos sugeridos (entre 10 e 100)
              - Categoria (Casa, Estudo, Saude, Social, Criatividade)

              Responda em formato JSON com o array "missions" contendo objetos com: title, description, points, category.
              Seja criativo, divertido e apropriado para a idade!`;

                const text = await callGemini(prompt);
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
      }

      else if (type === "motivational_feedback") {
              const { childName, missionTitle, points, totalPoints } = data;
              const prompt = `Voce e um assistente super animado e motivador para criancas!

              A crianca ${childName} acabou de completar a missao: "${missionTitle}" e ganhou ${points} pontos!
              Total de pontos acumulados: ${totalPoints} pontos.

              Escreva uma mensagem de feedback motivacional INCRIVEL e personalizada!
              - Use emojis divertidos
              - Seja muito entusiasmado e positivo
              - Mencione o nome da crianca e a missao
              - Adicione uma frase de incentivo para continuar
              - Maximo 4 frases curtas

              Responda apenas com a mensagem.`;

                result = await callGemini(prompt);
      }

      else if (type === "daily_surprise") {
              const { childName, age, previousMissions } = data;
              const prompt = `Voce e um criador de missoes surpresa para criancas!

              Crie UMA missao surpresa especial e divertida para ${childName} de ${age} anos para hoje!
              ${previousMissions?.length > 0 ? `Missoes recentes (evite repetir): ${previousMissions.join(", ")}.` : ""}

              A missao surpresa deve ser unica, criativa, realizavel em 1 dia e divertida.

              Responda em formato JSON com: title, description, points (entre 20 e 80), category, emoji.
              Apenas o JSON, sem texto adicional.`;

                const text = await callGemini(prompt);
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
      }

      else if (type === "weekly_report") {
              const { childName, age, completedMissions, totalPoints, weekPoints } = data;
              const prompt = `Voce e um especialista em desenvolvimento infantil gerando relatorio semanal para pais.

              Crianca: ${childName} (${age} anos)
              Pontos ganhos esta semana: ${weekPoints}
              Total de pontos acumulados: ${totalPoints}
              Missoes completadas esta semana: ${completedMissions?.join(", ") || "nenhuma"}

              Gere um relatorio semanal completo e positivo com:
              1. **Resumo da semana**
              2. **Pontos fortes**
              3. **Sugestoes para proxima semana**
              4. **Mensagem motivacional para a crianca**

              Linguagem calorosa e encorajadora. Maximo 300 palavras.`;

                result = await callGemini(prompt);
      }

      else {
              throw new Error("Tipo de requisicao invalido");
      }

      return new Response(JSON.stringify({ success: true, result }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

        } catch (error) {
              return new Response(JSON.stringify({ success: false, error: error.message }), {
                      status: 500,
                      headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
        }
});
