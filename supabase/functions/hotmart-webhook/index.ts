import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  constantTimeEqual,
  isAllowedHotmartProduct,
  minimizeHotmartPayload,
  parseHotmartWebhook,
} from "./domain.js";
import { createEdgeLogger, getErrorMetadata, getRequestId } from "../_shared/observability.ts";

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
  const requestId = getRequestId(req);
  const logger = createEdgeLogger("hotmart-webhook", requestId);
  if (req.method !== "POST") {
    logger.warn("method_not_allowed", { method: req.method });
    return jsonResponse({ error: "method_not_allowed", requestId }, 405);
  }
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
    logger.error("server_misconfigured", {
      has_hottok: Boolean(hottokSecret),
      has_supabase_url: Boolean(supabaseUrl),
      has_service_credential: Boolean(serviceKey),
      has_product_allowlist: allowedProductIds.length > 0 || allowedProductUcodes.length > 0,
    });
    return jsonResponse({ error: "server_misconfigured", requestId }, 500);
  }

  const url = new URL(req.url);
  const headerToken = req.headers.get("X-HOTMART-HOTTOK") ?? "";
  const legacyQueryToken = allowLegacyQueryToken ? url.searchParams.get("hottok") ?? "" : "";
  const receivedToken = headerToken || legacyQueryToken;
  if (!receivedToken || !constantTimeEqual(receivedToken, hottokSecret)) {
    logger.warn("unauthorized");
    return jsonResponse({ error: "unauthorized", requestId }, 401);
  }
  if (!headerToken && legacyQueryToken) {
    logger.warn("legacy_query_token_used");
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    logger.warn("payload_too_large", { content_length: contentLength });
    return jsonResponse({ error: "payload_too_large", requestId }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYLOAD_BYTES) {
      logger.warn("payload_too_large", { measured: true });
      return jsonResponse({ error: "payload_too_large", requestId }, 413);
    }
    body = JSON.parse(rawBody);
  } catch (error) {
    logger.warn("invalid_json", getErrorMetadata(error));
    return jsonResponse({ error: "invalid_json", requestId }, 400);
  }

  let parsed;
  try {
    parsed = parseHotmartWebhook(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "payload inválido";
    logger.warn("invalid_payload", { reason: message });
    return jsonResponse({ error: "invalid_payload", message, requestId }, 400);
  }

  if (!isAllowedHotmartProduct(parsed, allowedProductIds, allowedProductUcodes)) {
    logger.warn("product_not_allowed", {
      event_id: parsed.eventId,
      product_id: parsed.productId,
      product_ucode: parsed.productUcode,
    });
    return jsonResponse({ ok: true, ignored: "product_not_allowed", requestId });
  }

  if (!parsed.newPlan) {
    logger.info("event_ignored", { event_id: parsed.eventId, event_type: parsed.event });
    return jsonResponse({ ok: true, ignored: parsed.event, requestId });
  }
  if (!parsed.entitlementKey) {
    logger.warn("missing_entitlement_key", {
      event_id: parsed.eventId,
      event_type: parsed.event,
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
    logger.error("processing_failed", {
      event_id: parsed.eventId,
      ...getErrorMetadata(error),
    });
    return jsonResponse({ error: "processing_failed", requestId }, 500);
  }

  logger.info("event_processed", {
    event_id: parsed.eventId,
    event_type: parsed.event,
    duplicate: data?.duplicate ?? false,
    linked: data?.linked ?? false,
  });
  const result = data && typeof data === "object" ? data : {};
  return jsonResponse({ ok: true, requestId, ...result });
});
