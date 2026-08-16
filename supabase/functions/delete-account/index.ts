import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { createEdgeLogger, getErrorMetadata, getRequestId } from "../_shared/observability.ts";

// Exclusão de conta (LGPD): apaga os dados do app (RPC delete_my_account, com a
// permissão do próprio usuário) e remove o usuário do Supabase Auth + push subs.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = getRequestId(req);
  const logger = createEdgeLogger("delete-account", requestId);
  if (req.method !== "POST") {
    logger.warn("method_not_allowed", { method: req.method });
    return respond({ error: "method_not_allowed", requestId }, 405);
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      logger.error("server_misconfigured", {
        has_supabase_url: Boolean(SUPABASE_URL),
        has_service_credential: Boolean(SERVICE_KEY),
        has_anon_credential: Boolean(ANON_KEY),
      });
      return respond({ error: "server_misconfigured", requestId }, 500);
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) {
      logger.warn("unauthorized", { reason: "missing_bearer" });
      return respond({ error: "unauthorized", requestId }, 401);
    }

    // identifica o usuário pelo próprio token
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      logger.warn("unauthorized", authErr ? getErrorMetadata(authErr) : { reason: "user_not_found" });
      return respond({ error: "unauthorized", requestId }, 401);
    }
    const uid = user.id;

    // 1) apaga os dados do app com a permissão do próprio usuário
    const { error: rpcErr } = await userClient.rpc("delete_my_account");
    if (rpcErr) {
      // Uma tentativa anterior pode ter apagado o profile e falhado no Auth.
      // Nesse caso a repeticao deve continuar ate concluir a exclusao do login.
      const { data: remainingProfile, error: profileErr } = await userClient
        .from("profiles")
        .select("id")
        .eq("id", uid)
        .maybeSingle();
      if (profileErr || remainingProfile) {
        logger.error("app_data_deletion_failed", {
          rpc_failed: true,
          verification_failed: Boolean(profileErr),
          profile_remaining: Boolean(remainingProfile),
          ...getErrorMetadata(profileErr ?? rpcErr),
        });
        return respond({ error: "Falha ao excluir os dados da conta", requestId }, 500);
      }
    }

    // 2) admin: remove push subscriptions e o usuário do Auth (e-mail/login)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { error: pushErr } = await admin.from("push_subscriptions").delete().eq("user_id", uid);
    if (pushErr) {
      logger.error("push_cleanup_failed", getErrorMetadata(pushErr));
      return respond({ error: "Falha temporária ao concluir a exclusão", requestId }, 500);
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      logger.error("auth_deletion_failed", getErrorMetadata(delErr));
      return respond({ error: "Dados removidos; tente novamente para concluir a exclusão do login", requestId }, 500);
    }

    logger.info("account_deleted");
    return respond({ ok: true, requestId });
  } catch (err: unknown) {
    logger.error("unexpected_error", getErrorMetadata(err));
    return respond({ error: "internal_error", requestId }, 500);
  }
});
