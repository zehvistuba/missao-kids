import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  constantTimeEqual,
  isAllowedHotmartProduct,
  minimizeHotmartPayload,
  parseHotmartWebhook,
} from "./domain.js";

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } },
);

const splitEnvList = (value: string) => value
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const MAX_PAYLOAD_BYTES = 1_000_000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const requestId = crypto.randomUUID();
  const hottokSecret = Deno.env.get("HOTMART_HOTTOK") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("SERVICE_ROLE_KEY")
    ?? "";
  const allowLegacyQueryToken = Deno.env.get("ALLOW_LEGACY_HOTTOK_QUERY") === "true";
  const allowedProductIds = splitEnvList(Deno.env.get("HOTMART_PRODUCT_IDS") ?? "");
  const allowedProductUcodes = splitEnvList(Deno.env.get("HOTMART_PRODUCT_UCODES") ?? "");

  if (
    !hottokSecret
    || !supabaseUrl
    || !serviceKey
    || (allowedProductIds.length === 0 && allowedProductUcodes.length === 0)
  ) {
    console.error("[hotmart] Configuração obrigatória ausente", { requestId });
    return jsonResponse({ error: "server_misconfigured", requestId }, 500);
  }

  const url = new URL(req.url);
  const headerToken = req.headers.get("X-HOTMART-HOTTOK") ?? "";
  const legacyQueryToken = allowLegacyQueryToken ? url.searchParams.get("hottok") ?? "" : "";
  const receivedToken = headerToken || legacyQueryToken;
  if (!receivedToken || !constantTimeEqual(receivedToken, hottokSecret)) {
    console.warn("[hotmart] Hottok inválido", { requestId });
    return jsonResponse({ error: "unauthorized", requestId }, 401);
  }
  if (!headerToken && legacyQueryToken) {
    console.warn("[hotmart] Hottok recebido por query legada", { requestId });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ error: "payload_too_large", requestId }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ error: "payload_too_large", requestId }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_json", requestId }, 400);
  }

  let parsed;
  try {
    parsed = parseHotmartWebhook(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "payload inválido";
    console.warn("[hotmart] Payload rejeitado", { requestId, message });
    return jsonResponse({ error: "invalid_payload", message, requestId }, 400);
  }

  if (!isAllowedHotmartProduct(parsed, allowedProductIds, allowedProductUcodes)) {
    console.warn("[hotmart] Evento de produto não autorizado", {
      requestId,
      eventId: parsed.eventId,
      productId: parsed.productId,
      productUcode: parsed.productUcode,
    });
    return jsonResponse({ ok: true, ignored: "product_not_allowed", requestId });
  }

  if (!parsed.newPlan) {
    console.info("[hotmart] Evento ignorado", { requestId, eventId: parsed.eventId, event: parsed.event });
    return jsonResponse({ ok: true, ignored: parsed.event, requestId });
  }
  if (!parsed.entitlementKey) {
    console.warn("[hotmart] Evento sem identificador de compra/assinatura", {
      requestId,
      eventId: parsed.eventId,
      event: parsed.event,
    });
    return jsonResponse({ error: "missing_entitlement_key", requestId }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("process_hotmart_event", {
    p_event_id: parsed.eventId,
    p_event: parsed.event,
    p_buyer_email: parsed.email,
    p_event_created_at: parsed.eventCreatedAt,
    p_entitlement_key: parsed.entitlementKey,
    p_new_plan: parsed.newPlan,
    p_transaction_code: parsed.transactionCode,
    p_subscription_code: parsed.subscriptionCode,
    p_payload: minimizeHotmartPayload(body),
  });

  if (error) {
    console.error("[hotmart] Falha no processamento atômico", {
      requestId,
      eventId: parsed.eventId,
      code: error.code,
      message: error.message,
    });
    return jsonResponse({ error: "processing_failed", requestId }, 500);
  }

  console.info("[hotmart] Evento processado", {
    requestId,
    eventId: parsed.eventId,
    event: parsed.event,
    duplicate: data?.duplicate ?? false,
    linked: data?.linked ?? false,
  });
  const result = data && typeof data === "object" ? data : {};
  return jsonResponse({ ok: true, requestId, ...result });
});
