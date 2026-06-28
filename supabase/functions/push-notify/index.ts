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
    const CRON_SECRET          = Deno.env.get("CRON_SECRET") ?? "";

    // Authenticate caller — user JWT, service role key, OU cron (header x-cron-secret).
    // O cron (pg_cron/pg_net) manda a anon key no Authorization (passa pelo gateway) e o
    // segredo em x-cron-secret — evita depender do formato da service key (legado vs novo).
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerJwt  = authHeader.replace(/^Bearer\s+/i, "");
    const cronHeader = req.headers.get("x-cron-secret") ?? "";

    const isServiceCall =
      (SUPABASE_SERVICE_KEY && callerJwt === SUPABASE_SERVICE_KEY) ||
      (CRON_SECRET && cronHeader === CRON_SECRET);

    let callerFamilyId: string | null = null;
    if (!isServiceCall) {
      if (!callerJwt) return respond({ error: "Não autenticado" }, 401);
      const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${callerJwt}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user }, error: authErr } = await callerClient.auth.getUser();
      if (authErr || !user) return respond({ error: "Token inválido" }, 401);
      // Família do caller — chamadas de usuário só notificam a própria família.
      const { data: prof } = await callerClient.from("profiles").select("family_id").eq("id", user.id).single();
      callerFamilyId = prof?.family_id ?? null;
    }

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

    // Get subscriptions — destino conforme quem chama
    let query = supabase.from("push_subscriptions").select("subscription, user_id");
    if (isServiceCall) {
      // cron/service pode mirar qualquer destino
      if (body.user_ids?.length) {
        query = query.in("user_id", body.user_ids);
      } else if (body.family_id) {
        const { data: members } = await supabase.from("profiles").select("id").eq("family_id", body.family_id);
        query = query.in("user_id", (members || []).map((m: { id: string }) => m.id));
      } else {
        return respond({ error: "Forneça family_id ou user_ids" }, 400);
      }
    } else {
      // chamada de usuário (JWT): só pode notificar a PRÓPRIA família
      if (!callerFamilyId) return respond({ error: "Sem família" }, 403);
      const { data: members } = await supabase.from("profiles").select("id").eq("family_id", callerFamilyId);
      let ids = (members || []).map((m: { id: string }) => m.id);
      if (body.user_ids?.length) ids = ids.filter((id) => body.user_ids!.includes(id)); // interseção
      query = query.in("user_id", ids);
    }

    const { data: subs, error: subErr } = await query;
    if (subErr) return respond({ error: subErr.message }, 500);

    const payload = JSON.stringify({ title: notifTitle, body: notifBody, url: notifUrl, tag: "rotinup" });
    const results = await Promise.allSettled(
      (subs || []).map(async ({ subscription, user_id }) => {
        try {
          await webPush.sendNotification(subscription, payload);
        } catch (err: unknown) {
          const e = err as { statusCode?: number; body?: string; message?: string };
          console.error(`[push] falhou user=${user_id} status=${e?.statusCode} body=${e?.body} msg=${e?.message}`);
          // FCM 410/404 = subscription expirada — remove do banco automaticamente
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("user_id", user_id);
            console.log(`[push] subscription expirada removida: ${user_id}`);
          }
          throw err;
        }
      })
    );

    const sent   = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return respond({ sent, failed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return respond({ error: msg }, 500);
  }
});
