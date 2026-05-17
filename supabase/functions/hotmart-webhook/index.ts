import { createClient } from "npm:@supabase/supabase-js@2";

// Hotmart Webhook — atualiza families.plan ao receber compra/cancelamento
// Configurar no painel Hotmart: Ferramentas → Webhook → URL desta função
// Adicionar secret HOTMART_HOTTOK no Supabase: Dashboard → Settings → Edge Functions

const EVENTS_PREMIUM = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
  "PURCHASE_BILLET_PRINTED",
]);
const EVENTS_FREE = new Set([
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "SUBSCRIPTION_CANCELLATION",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const HOTTOK          = Deno.env.get("HOTMART_HOTTOK") ?? "";
  const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")   ?? "";
  const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Verificar token Hotmart (enviado como query param ?hottok=...)
  const url       = new URL(req.url);
  const hottok    = url.searchParams.get("hottok") ?? "";
  if (HOTTOK && hottok !== HOTTOK) {
    console.error("Hotmart hottok inválido:", hottok);
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Extrair evento e email do comprador
  const event: string = (body.event as string) ?? "";
  const buyer = (body.data as Record<string, unknown>)?.buyer as Record<string, unknown>;
  const email: string = ((buyer?.email as string) ?? "").toLowerCase().trim();

  console.log("Hotmart webhook:", { event, email });

  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email ausente" }), { status: 200 });
  }

  // Determinar novo plano
  let newPlan: "premium" | "free" | null = null;
  if (EVENTS_PREMIUM.has(event)) newPlan = "premium";
  else if (EVENTS_FREE.has(event))  newPlan = "free";

  if (!newPlan) {
    // Evento ignorado (ex: PURCHASE_UNDER_ANALYSIS) — retorna 200 para Hotmart não reenviar
    return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200 });
  }

  // Buscar family_id do usuário via RPC (SECURITY DEFINER acessa auth.users)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: familyId, error: rpcErr } = await supabase
    .rpc("get_family_id_by_email", { p_email: email });

  if (rpcErr || !familyId) {
    console.error("Família não encontrada para:", email, rpcErr?.message);
    // Retorna 200 para não gerar reenvio; Hotmart considera 2xx como sucesso
    return new Response(
      JSON.stringify({ ok: false, error: "família não encontrada", email }),
      { status: 200 }
    );
  }

  const { error: updErr } = await supabase
    .from("families")
    .update({ plan: newPlan })
    .eq("id", familyId);

  if (updErr) {
    console.error("Erro ao atualizar plano:", updErr.message);
    return new Response(JSON.stringify({ ok: false, error: updErr.message }), { status: 500 });
  }

  console.log(`✅ ${email} → plan=${newPlan} (${event})`);
  return new Response(
    JSON.stringify({ ok: true, email, plan: newPlan, event }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
