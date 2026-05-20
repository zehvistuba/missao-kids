import { createClient } from "npm:@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")       ?? "";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Authenticate caller — must be a valid Supabase user
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerJwt  = authHeader.replace(/^Bearer\s+/i, "");
    if (!callerJwt) return respond({ error: "Não autenticado" }, 401);

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${callerJwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) return respond({ error: "Token inválido" }, 401);

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return respond({ error: "VAPID keys não configuradas" }, 500);
    }

    webPush.setVapidDetails(
      "mailto:contato@rotinup.app",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let body: { family_id?: string; user_ids?: string[]; title?: string; body?: string; url?: string };
    try { body = await req.json(); } catch { return respond({ error: "Body inválido" }, 400); }

    const notifTitle = body.title || "RotinUp 🚀";
    const notifBody  = body.body  || "Você tem missões esperando por você!";
    const notifUrl   = body.url   || "/";

    // Get subscriptions — by family or specific users
    let query = supabase.from("push_subscriptions").select("subscription, user_id");
    if (body.user_ids?.length) {
      query = query.in("user_id", body.user_ids);
    } else if (body.family_id) {
      const { data: members } = await supabase
        .from("profiles")
        .select("id")
        .eq("family_id", body.family_id);
      const ids = (members || []).map((m: { id: string }) => m.id);
      query = query.in("user_id", ids);
    } else {
      return respond({ error: "Forneça family_id ou user_ids" }, 400);
    }

    const { data: subs, error: subErr } = await query;
    if (subErr) return respond({ error: subErr.message }, 500);

    const payload = JSON.stringify({ title: notifTitle, body: notifBody, url: notifUrl, tag: "rotinup" });
    const results = await Promise.allSettled(
      (subs || []).map(({ subscription }) =>
        webPush.sendNotification(subscription, payload)
      )
    );

    const sent   = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return respond({ sent, failed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return respond({ error: msg }, 500);
  }
});
