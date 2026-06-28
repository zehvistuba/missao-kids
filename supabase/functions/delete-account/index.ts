import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return respond({ error: "unauthorized" }, 401);

    // identifica o usuário pelo próprio token
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return respond({ error: "unauthorized" }, 401);
    const uid = user.id;

    // 1) apaga os dados do app com a permissão do próprio usuário
    const { error: rpcErr } = await userClient.rpc("delete_my_account");
    if (rpcErr) return respond({ error: "Falha ao excluir dados: " + rpcErr.message }, 400);

    // 2) admin: remove push subscriptions e o usuário do Auth (e-mail/login)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    await admin.from("push_subscriptions").delete().eq("user_id", uid);
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) return respond({ error: "Conta de dados removida, mas falhou ao remover do Auth: " + delErr.message }, 500);

    return respond({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return respond({ error: msg }, 500);
  }
});
