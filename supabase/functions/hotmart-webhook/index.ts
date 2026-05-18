import { createClient } from "npm:@supabase/supabase-js@2";

// Hotmart Webhook — atualiza families.plan ao receber compra/cancelamento
// Secret names no Supabase: HOTMART_HOTTOK e SERVICE_ROLE_KEY (sem prefixo SUPABASE_)

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

  const HOTTOK       = Deno.env.get("HOTMART_HOTTOK")   ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")     ?? "";
  // Renomeado de SUPABASE_SERVICE_ROLE_KEY → SERVICE_ROLE_KEY (Supabase bloqueia prefixo SUPABASE_)
  const SERVICE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

  // Verificar token Hotmart (enviado como query param ?hottok=...)
  const url    = new URL(req.url);
  const hottok = url.searchParams.get("hottok") ?? "";
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

  // Extrair evento e email do comprador (Hotmart v2 payload)
  const event: string = (body.event as string) ?? "";
  const data  = body.data as Record<string, unknown> ?? {};
  const buyer = (data.buyer ?? data.purchase) as Record<string, unknown> ?? {};
  const email: string = ((buyer.email as string) ?? "").toLowerCase().trim();

  console.log("Hotmart webhook:", { event, email });

  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email ausente no payload" }), { status: 200 });
  }

  // Determinar novo plano
  let newPlan: "premium" | "free" | null = null;
  if (EVENTS_PREMIUM.has(event)) newPlan = "premium";
  else if (EVENTS_FREE.has(event)) newPlan = "free";

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Registrar evento no log independente do resultado
  await supabase.from("hotmart_events").insert({
    event,
    buyer_email: email,
    payload: body,
  }).then(({ error }) => { if (error) console.error("Log hotmart_events:", error.message); });

  if (!newPlan) {
    // Evento não mapeado (ex: PURCHASE_UNDER_ANALYSIS) — 200 para Hotmart não reenviar
    return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200 });
  }

  // 1ª tentativa: encontrar família por hotmart_buyer_email (vínculo direto)
  let familyId: string | null = null;
  const { data: byBuyerEmail } = await supabase
    .from("families")
    .select("id")
    .eq("hotmart_buyer_email", email)
    .maybeSingle();

  if (byBuyerEmail?.id) {
    familyId = byBuyerEmail.id;
    console.log("Família encontrada via hotmart_buyer_email:", familyId);
  } else {
    // 2ª tentativa: encontrar família pelo email de login do responsável (auth.users)
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc("get_family_id_by_email", { p_email: email });
    if (rpcErr) console.error("RPC get_family_id_by_email:", rpcErr.message);
    else familyId = rpcResult ?? null;
    if (familyId) console.log("Família encontrada via auth.users:", familyId);
  }

  if (!familyId) {
    console.error("Família não encontrada para:", email);
    // 200 para Hotmart não reenviar — email ainda não cadastrado no app
    return new Response(
      JSON.stringify({ ok: false, error: "família não encontrada", email }),
      { status: 200 }
    );
  }

  // Atualizar plano + salvar buyer_email para facilitar lookups futuros
  const { error: updErr } = await supabase
    .from("families")
    .update({ plan: newPlan, hotmart_buyer_email: email })
    .eq("id", familyId);

  if (updErr) {
    console.error("Erro ao atualizar plano:", updErr.message);
    return new Response(JSON.stringify({ ok: false, error: updErr.message }), { status: 500 });
  }

  // Atualizar family_id no log do evento
  await supabase
    .from("hotmart_events")
    .update({ family_id: familyId })
    .eq("buyer_email", email)
    .eq("event", event)
    .is("family_id", null);

  console.log(`✅ ${email} → plan=${newPlan} (${event}) família=${familyId}`);
  return new Response(
    JSON.stringify({ ok: true, email, plan: newPlan, event, familyId }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
