import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import webPush from "npm:web-push@3";
import { constantTimeEqual, createEdgeLogger, getErrorMetadata, getRequestId } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_PAYLOAD_BYTES = 64_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cleanText = (value: unknown, fallback: string, maxLength: number) => {
  const cleaned = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, maxLength);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = getRequestId(req);
  const logger = createEdgeLogger("push-notify", requestId);
  if (req.method !== "POST") {
    logger.warn("method_not_allowed", { method: req.method });
    return respond({ error: "method_not_allowed", requestId }, 405);
  }

  try {
    const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")       ?? "";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const CRON_SECRET          = Deno.env.get("CRON_SECRET") ?? "";

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
      logger.error("server_misconfigured", {
        has_vapid_public: Boolean(VAPID_PUBLIC_KEY),
        has_vapid_private: Boolean(VAPID_PRIVATE_KEY),
        has_supabase_url: Boolean(SUPABASE_URL),
        has_service_credential: Boolean(SUPABASE_SERVICE_KEY),
        has_anon_credential: Boolean(SUPABASE_ANON_KEY),
      });
      return respond({ error: "server_misconfigured", requestId }, 500);
    }

    // Authenticate caller — user JWT, service role key, OU cron (header x-cron-secret).
    // O cron (pg_cron/pg_net) manda a anon key no Authorization (passa pelo gateway) e o
    // segredo em x-cron-secret — evita depender do formato da service key (legado vs novo).
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerJwt  = authHeader.replace(/^Bearer\s+/i, "");
    const cronHeader = req.headers.get("x-cron-secret") ?? "";

    const isServiceCall = Boolean(
      (SUPABASE_SERVICE_KEY && callerJwt && constantTimeEqual(callerJwt, SUPABASE_SERVICE_KEY)) ||
      (CRON_SECRET && cronHeader && constantTimeEqual(cronHeader, CRON_SECRET)),
    );

    let callerFamilyId: string | null = null;
    if (!isServiceCall) {
      if (!callerJwt) {
        logger.warn("unauthorized", { reason: "missing_bearer" });
        return respond({ error: "Não autenticado", requestId }, 401);
      }
      const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${callerJwt}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user }, error: authErr } = await callerClient.auth.getUser();
      if (authErr || !user) {
        logger.warn("unauthorized", authErr ? getErrorMetadata(authErr) : { reason: "user_not_found" });
        return respond({ error: "Token inválido", requestId }, 401);
      }
      // Família do caller — chamadas de usuário só notificam a própria família.
      const { data: prof, error: profileError } = await callerClient.from("profiles").select("family_id").eq("id", user.id).maybeSingle();
      if (profileError) {
        logger.error("caller_profile_lookup_failed", getErrorMetadata(profileError));
        return respond({ error: "Falha ao verificar a família", requestId }, 503);
      }
      callerFamilyId = prof?.family_id ?? null;
    }

    webPush.setVapidDetails(
      "mailto:contato@rotinup.app",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let body: { family_id?: string; user_ids?: string[]; title?: string; body?: string; url?: string };
    try {
      const contentLength = Number(req.headers.get("content-length") ?? 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
        logger.warn("payload_too_large", { content_length: contentLength });
        return respond({ error: "Body muito grande", requestId }, 413);
      }
      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYLOAD_BYTES) {
        logger.warn("payload_too_large", { measured: true });
        return respond({ error: "Body muito grande", requestId }, 413);
      }
      body = JSON.parse(rawBody);
    } catch (error) {
      logger.warn("invalid_json", getErrorMetadata(error));
      return respond({ error: "Body inválido", requestId }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      logger.warn("invalid_body");
      return respond({ error: "Body inválido", requestId }, 400);
    }

    const notifTitle = cleanText(body.title, "RotinUp 🚀", 80);
    const notifBody  = cleanText(body.body, "Você tem missões esperando por você!", 240);
    const notifUrl   = typeof body.url === "string" && body.url.startsWith("/") && !body.url.startsWith("//")
      ? body.url.slice(0, 300)
      : "/";
    const requestedUserIds = Array.isArray(body.user_ids)
      ? [...new Set(body.user_ids.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))].slice(0, 500)
      : [];

    // Get subscriptions — destino conforme quem chama
    let query = supabase.from("push_subscriptions").select("subscription, user_id");
    if (isServiceCall) {
      // cron/service pode mirar qualquer destino
      if (requestedUserIds.length) {
        query = query.in("user_id", requestedUserIds);
      } else if (typeof body.family_id === "string" && UUID_PATTERN.test(body.family_id)) {
        const { data: members, error: membersError } = await supabase.from("profiles").select("id").eq("family_id", body.family_id);
        if (membersError) {
          logger.error("family_members_lookup_failed", getErrorMetadata(membersError));
          return respond({ error: "Falha ao localizar destinatários", requestId }, 503);
        }
        const memberIds = (members || []).map((m: { id: string }) => m.id);
        if (memberIds.length === 0) {
          logger.info("no_recipients");
          return respond({ sent: 0, failed: 0, requestId });
        }
        query = query.in("user_id", memberIds);
      } else {
        return respond({ error: "Forneça family_id ou user_ids", requestId }, 400);
      }
    } else {
      // chamada de usuário (JWT): só pode notificar a PRÓPRIA família
      if (!callerFamilyId) return respond({ error: "Sem família", requestId }, 403);
      const { data: members, error: membersError } = await supabase.from("profiles").select("id").eq("family_id", callerFamilyId);
      if (membersError) {
        logger.error("family_members_lookup_failed", getErrorMetadata(membersError));
        return respond({ error: "Falha ao localizar destinatários", requestId }, 503);
      }
      let ids = (members || []).map((m: { id: string }) => m.id);
      if (requestedUserIds.length) ids = ids.filter((id) => requestedUserIds.includes(id)); // interseção
      if (ids.length === 0) {
        logger.info("no_recipients");
        return respond({ sent: 0, failed: 0, requestId });
      }
      query = query.in("user_id", ids);
    }

    const { data: subs, error: subErr } = await query;
    if (subErr) {
      logger.error("subscriptions_lookup_failed", getErrorMetadata(subErr));
      return respond({ error: "Falha ao carregar notificações", requestId }, 500);
    }

    const payload = JSON.stringify({ title: notifTitle, body: notifBody, url: notifUrl, tag: "rotinup" });
    const results = await Promise.allSettled(
      (subs || []).map(async ({ subscription, user_id }) => {
        try {
          await webPush.sendNotification(subscription, payload);
        } catch (err: unknown) {
          const e = err as { statusCode?: number };
          logger.warn("delivery_failed", { provider_status: e?.statusCode ?? null });
          // FCM 410/404 = subscription expirada — remove do banco automaticamente
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            const { error: cleanupError } = await supabase.from("push_subscriptions").delete().eq("user_id", user_id);
            if (cleanupError) logger.error("expired_subscription_cleanup_failed", getErrorMetadata(cleanupError));
            else logger.info("expired_subscription_removed");
          }
          throw err;
        }
      })
    );

    const sent   = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    logger.info("delivery_completed", { sent, failed, target_count: (subs || []).length });
    return respond({ sent, failed, requestId });
  } catch (err: unknown) {
    logger.error("unexpected_error", getErrorMetadata(err));
    return respond({ error: "Erro interno ao enviar notificações", requestId }, 500);
  }
});
