import { createClient } from "npm:@supabase/supabase-js@2.105.4";

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
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      console.error("[delete-account] Configuração obrigatória ausente", { requestId });
      return respond({ error: "server_misconfigured", requestId }, 500);
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return respond({ error: "unauthorized", requestId }, 401);

    // identifica o usuário pelo próprio token
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return respond({ error: "unauthorized", requestId }, 401);
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
        console.error("[delete-account] Falha ao excluir dados", {
          requestId,
          code: rpcErr.code,
          message: rpcErr.message,
        });
        return respond({ error: "Falha ao excluir os dados da conta", requestId }, 500);
      }
    }

    // 2) admin: remove push subscriptions e o usuário do Auth (e-mail/login)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { error: pushErr } = await admin.from("push_subscriptions").delete().eq("user_id", uid);
    if (pushErr) {
      console.error("[delete-account] Falha ao remover push subscriptions", {
        requestId,
        message: pushErr.message,
      });
      return respond({ error: "Falha temporária ao concluir a exclusão", requestId }, 500);
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("[delete-account] Falha ao remover usuário do Auth", {
        requestId,
        message: delErr.message,
      });
      return respond({ error: "Dados removidos; tente novamente para concluir a exclusão do login", requestId }, 500);
    }

    return respond({ ok: true, requestId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[delete-account] Erro inesperado", { requestId, message: msg });
    return respond({ error: "internal_error", requestId }, 500);
  }
});
