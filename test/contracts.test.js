import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  FREE_FEATURES,
  getAdminChildCount,
  HOTMART_CHECKOUT_URLS,
  PLAN_LIMITS,
  PLANS,
  PREMIUM_FEATURES,
  TERMS_LAST_UPDATED_LABEL,
  TERMS_VERSION,
} from "../src/config/product.js";
import {
  constantTimeEqual,
  isAllowedHotmartProduct,
  minimizeHotmartPayload,
  parseHotmartWebhook,
} from "../supabase/functions/hotmart-webhook/domain.js";
import {
  createReportKey,
  normalizeReportField,
  sanitizeErrorText,
} from "../src/lib/errorSanitizer.js";

const approvedPayload = {
  id: "evt-approved-1",
  creation_date: 1786500000000,
  event: "PURCHASE_APPROVED",
  version: "2.0.0",
  data: {
    buyer: {
      email: " Pessoa@Example.com ",
      document: "000.000.000-00",
      address: { zipcode: "00000-000" },
    },
    product: { id: 123, ucode: "product-123", name: "RotinUp Premium" },
    purchase: {
      transaction: "HP123",
      status: "APPROVED",
      offer: { code: "offer-monthly" },
    },
    subscription: {
      id: 456,
      subscriber: { code: "SUBSCRIBER-1" },
    },
  },
};

test("contrato comercial usa os limites confirmados no banco vivo", () => {
  assert.equal(PLAN_LIMITS.free.children, 1);
  assert.equal(PLAN_LIMITS.premium.children, 10);
  assert.equal(PLAN_LIMITS.premium.coParents, 10);
  assert.ok(PREMIUM_FEATURES.includes("Até 10 filhos"));
  assert.ok(FREE_FEATURES.includes("Até 5 missões ativas"));
});

test("precos e ofertas Hotmart formam um contrato comercial completo", () => {
  assert.equal(PLANS.monthly.price, "14,90");
  assert.equal(PLANS.annual.price, "149,90");
  assert.match(HOTMART_CHECKOUT_URLS.monthly, /^https:\/\/pay\.hotmart\.com\//);
  assert.match(HOTMART_CHECKOUT_URLS.monthly, /off=992z9nyu/);
  assert.match(HOTMART_CHECKOUT_URLS.annual, /off=tjv79dzd/);
});

test("consentimento legal usa uma versão e um rótulo coerentes", () => {
  assert.equal(TERMS_VERSION, "2026-08-13");
  assert.match(TERMS_LAST_UPDATED_LABEL, /13 de agosto de 2026/);
});

test("painel admin aceita o contrato vivo e o contrato legado", () => {
  assert.equal(getAdminChildCount({ child_count: 3 }), 3);
  assert.equal(getAdminChildCount({
    children: [{ role: "parent" }, { role: "child" }, { role: "child" }],
  }), 2);
  assert.equal(getAdminChildCount({ children: null }), 0);
});

test("webhook aprovado usa assinatura como chave e normaliza email", () => {
  const parsed = parseHotmartWebhook(approvedPayload);
  assert.equal(parsed.eventId, "evt-approved-1");
  assert.equal(parsed.version, "2.0.0");
  assert.equal(parsed.email, "pessoa@example.com");
  assert.equal(parsed.newPlan, "premium");
  assert.equal(parsed.entitlementKey, "subscriber:SUBSCRIBER-1");
  assert.equal(parsed.transactionCode, "HP123");
  assert.equal(parsed.productId, "123");
  assert.equal(parsed.productUcode, "product-123");
});

test("webhook aceita somente produtos Hotmart explicitamente permitidos", () => {
  const parsed = parseHotmartWebhook(approvedPayload);
  assert.equal(isAllowedHotmartProduct(parsed, ["123"], []), true);
  assert.equal(isAllowedHotmartProduct(parsed, [], ["product-123"]), true);
  assert.equal(isAllowedHotmartProduct(parsed, ["999"], ["outro-produto"]), false);
  assert.equal(isAllowedHotmartProduct({ productId: null, productUcode: null }, ["123"], []), false);
});

test("cancelamento de assinatura usa o mesmo identificador do assinante", () => {
  const parsed = parseHotmartWebhook({
    id: "evt-cancel-1",
    creation_date: 1786501000000,
    event: "SUBSCRIPTION_CANCELLATION",
    version: "2.0.0",
    data: {
      product: { id: 123, ucode: "product-123" },
      subscriber: { email: "pessoa@example.com", code: "SUBSCRIBER-1" },
      subscription: { id: 456 },
    },
  });
  assert.equal(parsed.newPlan, "free");
  assert.equal(parsed.entitlementKey, "subscriber:SUBSCRIBER-1");
});

test("payload persistido remove PII desnecessária", () => {
  const minimized = minimizeHotmartPayload(approvedPayload);
  const serialized = JSON.stringify(minimized);
  assert.equal(serialized.includes("000.000.000-00"), false);
  assert.equal(serialized.includes("00000-000"), false);
  assert.equal(serialized.includes("Pessoa@Example.com"), false);
  assert.equal(minimized.data.purchase.transaction, "HP123");
});

test("parser rejeita eventos sem identidade ou data oficial", () => {
  assert.throws(
    () => parseHotmartWebhook({ event: "PURCHASE_APPROVED", version: "2.0.0", data: { buyer: { email: "a@b.com" } } }),
    /event_id ausente/,
  );
  assert.throws(
    () => parseHotmartWebhook({ id: "evt", event: "PURCHASE_APPROVED", version: "2.0.0", creation_date: 0, data: { buyer: { email: "a@b.com" } } }),
    /creation_date inválida/,
  );
  assert.throws(
    () => parseHotmartWebhook({ ...approvedPayload, version: "1.0.0" }),
    /versão de webhook não suportada/,
  );
});

test("comparacao de segredo exige igualdade integral", () => {
  assert.equal(constantTimeEqual("segredo-forte", "segredo-forte"), true);
  assert.equal(constantTimeEqual("segredo-forte", "segredo-fraco"), false);
  assert.equal(constantTimeEqual("abc", "abc0"), false);
});

test("migracao Hotmart contem os guardas de concorrencia e ACL", async () => {
  const sql = await readFile(new URL("../supabase_fix_hotmart_idempotency.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS hotmart_events_event_id_uidx/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /ignored_stale/);
  assert.match(sql, /event_priority/);
  assert.match(sql, /access_until/);
  assert.match(sql, /date_next_charge/);
  assert.match(sql, /e\.access_until > now\(\)/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.hotmart_entitlements/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.process_hotmart_event/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.process_hotmart_event[\s\S]*TO service_role/);
});

test("migracao de limites serializa inclusoes e protege as RPCs", async () => {
  const sql = await readFile(new URL("../supabase_fix_plan_limits_canonical.sql", import.meta.url), "utf8");
  assert.match(sql, /SET search_path = pg_catalog, public/g);
  assert.match(sql, /FOR UPDATE/g);
  assert.match(sql, /v_family\.plan = 'premium' THEN 10 ELSE 1/);
  assert.match(sql, /v_my_role NOT IN \('parent', 'admin'\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.add_child[\s\S]*FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.join_family_by_code[\s\S]*FROM PUBLIC, anon/);
});

test("hardening de create_family evita corrida, shadowing e acesso anonimo", async () => {
  const sql = await readFile(new URL("../supabase_harden_create_family.sql", import.meta.url), "utf8");
  assert.match(sql, /SET search_path = pg_catalog, public/);
  assert.match(sql, /FROM public\.profiles[\s\S]*FOR UPDATE/);
  assert.match(sql, /ON CONFLICT \(invite_code\) DO NOTHING/);
  assert.match(sql, /length\(trim\(COALESCE\(p_family_name, ''\)\)\) NOT BETWEEN 2 AND 80/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_family\(TEXT\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_family\(TEXT\) TO authenticated/);
});

test("edge Hotmart exige header por padrão e limita payload", async () => {
  const source = await readFile(new URL("../supabase/functions/hotmart-webhook/index.ts", import.meta.url), "utf8");
  assert.match(source, /X-HOTMART-HOTTOK/);
  assert.match(source, /ALLOW_LEGACY_HOTTOK_QUERY/);
  assert.match(source, /HOTMART_PRODUCT_IDS/);
  assert.match(source, /HOTMART_PRODUCT_UCODES/);
  assert.match(source, /isAllowedHotmartProduct/);
  assert.match(source, /payload_too_large/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("reporte de erro remove PII e produz chave estavel", () => {
  const raw = "Falhou para pessoa@example.com, CPF 123.456.789-00, telefone (44) 99114-1555, cartao 4111 1111 1111 1111, token abcdefghijklmnopqrstuvwxyz123456 e id 7a8c3ff8-8010-4e83-92b0-95bf1b668ee8";
  const sanitized = sanitizeErrorText(raw);
  assert.equal(sanitized.includes("pessoa@example.com"), false);
  assert.equal(sanitized.includes("123.456.789-00"), false);
  assert.equal(sanitized.includes("99114-1555"), false);
  assert.equal(sanitized.includes("4111 1111 1111 1111"), false);
  assert.equal(sanitized.includes("abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.equal(sanitized.includes("7a8c3ff8"), false);
  assert.equal(createReportKey([raw]), createReportKey([raw]));
  assert.match(createReportKey([raw]), /^[0-9a-f]{16}$/);
  assert.equal(normalizeReportField("Painel Família / Carregar"), "painel_fam_lia_/_carregar");
});

test("migracao de reportes fecha acesso direto, limita abuso e exige gate admin", async () => {
  const sql = await readFile(new URL("../supabase_app_error_reporting.sql", import.meta.url), "utf8");
  assert.match(sql, /ALTER TABLE public\.app_error_reports ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.app_error_reports FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /v_new_reports >= 20/);
  assert.match(sql, /v_daily_reports >= 50/);
  assert.match(sql, /interval '90 days'/);
  assert.match(sql, /interval '180 days'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /\[payment\]/);
  assert.match(sql, /\[token\]/);
  assert.match(sql, /public\.is_platform_admin\(\) IS NOT TRUE/g);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.platform_get_error_reports/);
  assert.doesNotMatch(sql, /RETURNS TABLE[\s\S]*user_id UUID/);
});

test("bootstrap instala captura global e Error Boundary", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /installGlobalErrorReporting\(\)/);
  assert.match(source, /<AppErrorBoundary>/);
});

test("Edge Functions usam logs estruturados e correlacao sem console avulso", async () => {
  const shared = await readFile(new URL("../supabase/functions/_shared/observability.ts", import.meta.url), "utf8");
  assert.match(shared, /JSON\.stringify\(\{/);
  assert.match(shared, /request_id: safeRequestId/);
  assert.match(shared, /\[email\]/);
  assert.match(shared, /\[token\]/);
  assert.match(shared, /\[payment\]/);

  for (const path of ["ai-assistant", "delete-account", "hotmart-webhook", "push-notify"]) {
    const source = await readFile(new URL(`../supabase/functions/${path}/index.ts`, import.meta.url), "utf8");
    assert.match(source, /createEdgeLogger/);
    assert.match(source, /getRequestId\(req\)/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  }
});

test("landing visual preserva contratos e usa asset otimizado", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/landing-refresh.css", import.meta.url), "utf8");
  const hero = await stat(new URL("../src/assets/rotinup-hero-family.webp", import.meta.url));

  assert.match(source, /FREE_FEATURES\.map/);
  assert.match(source, /HOTMART_CHECKOUT_URLS\[billing\]/);
  assert.match(source, /heroFamilyImage/);
  assert.match(source, /<h1 id="ru-hero-title">RotinUp<\/h1>/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
  assert.ok(hero.size < 200_000, `hero acima do limite: ${hero.size} bytes`);
});

test("auth, consentimento e onboarding preservam contratos no refresh visual", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/flow-refresh.css", import.meta.url), "utf8");
  const auth = source.slice(source.indexOf("const AuthScreen"), source.indexOf("const Onboarding"));
  const onboarding = source.slice(source.indexOf("const Onboarding"), source.indexOf("function Countdown"));
  const appRoot = source.slice(source.indexOf("export default function App"));

  assert.match(source, /import "\.\/styles\/flow-refresh\.css"/);
  assert.match(auth, /<form className="ru-auth-form" onSubmit=\{handleEmail\}/);
  assert.match(auth, /id="signup-terms-consent"/);
  assert.ok(auth.indexOf('id="signup-terms-consent"') < auth.indexOf('type="submit" disabled={loading ||'));
  assert.match(auth, /autocomplete="new-password"|autoComplete=\{mode === "signup" \? "new-password"/i);
  assert.match(source, /supabase\.rpc\("accept_terms", \{ p_terms_version: TERMS_VERSION \}\)/);
  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="ru-legal-title"/);

  assert.match(onboarding, /supabase\.rpc\("create_family", \{ p_family_name: normalizedName \}\)/);
  assert.match(onboarding, /p_display_name: normalizedChildName/);
  assert.match(onboarding, /supabase\.rpc\("join_family_by_code", \{ p_code: joinCode\.trim\(\) \}\)/);
  assert.match(onboarding, /setStep\("recover_error"\)/);
  assert.match(onboarding, /action: "recover_family"/);
  assert.match(source, /\["landing", "auth", "terms", "onboarding"\]\.includes\(activeScreen\)/);
  const entryScrolls = `${auth}\n${onboarding}\n${appRoot}`;
  assert.equal((entryScrolls.match(/window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/g) || []).length, 3);

  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
});

test("shell do responsavel preserva navegacao e adapta desktop e mobile", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/parent-shell-refresh.css", import.meta.url), "utf8");
  const parent = source.slice(source.indexOf("const ParentDash"), source.indexOf("// ADMIN PANEL"));

  assert.match(source, /import "\.\/styles\/parent-shell-refresh\.css"/);
  for (const key of ["home", "missions", "rewards", "stats", "settings"]) {
    assert.match(parent, new RegExp(`key: "${key}"`));
    assert.match(parent, new RegExp(`tab === "${key}"`));
  }
  assert.match(parent, /aria-current=\{tab === item\.key \? "page" : undefined\}/);
  assert.match(parent, /const jumpToPending = \(\) =>/);
  assert.match(parent, /setTab\("home"\)/);
  assert.match(parent, /ref=\{contentRef\}/);
  assert.match(parent, /contentRef\.current\?\.scrollTo/);
  assert.match(source, /const isParentRefreshScreen = activeScreen === "parent"/);
  assert.match(source, /const isWideScreen = isRefreshScreen \|\| isParentRefreshScreen/);

  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /aria-current="page"/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
});

test("IA e push limitam entrada e falham sem vazar detalhes internos", async () => {
  const ai = await readFile(new URL("../supabase/functions/ai-assistant/index.ts", import.meta.url), "utf8");
  const push = await readFile(new URL("../supabase/functions/push-notify/index.ts", import.meta.url), "utf8");

  assert.match(ai, /MAX_PAYLOAD_BYTES = 64_000/);
  assert.match(ai, /ALLOWED_ACTIONS/);
  assert.ok(ai.indexOf("ALLOWED_ACTIONS.has(action)") < ai.indexOf('rpc("ai_check_and_bump")'));
  assert.ok(ai.indexOf('rpc("get_family_plan")') < ai.indexOf('rpc("ai_check_and_bump")'));
  assert.doesNotMatch(ai, /Gemini \$\{geminiRes\.status\}/);
  assert.doesNotMatch(ai, /result\.slice\(0, 200\)/);

  assert.match(push, /\.maybeSingle\(\)/);
  assert.match(push, /constantTimeEqual/);
  assert.match(push, /UUID_PATTERN/);
  assert.match(push, /membersError/g);
  assert.match(push, /!body\.url\.startsWith\("\/\/"\)/);
  assert.match(push, /requestedUserIds\.includes\(id\)/);
  assert.doesNotMatch(push, /falhou user=/);
});

test("frontend exibe referencia curta para falhas correlacionadas das Edge Functions", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /const withRequestReference/);
  assert.match(source, /slice\(-8\)\.toUpperCase\(\)/);
  assert.match(source, /\(ref\. \$\{compactId\}\)/);
  assert.match(source, /responseBody\?\.requestId/);
  assert.match(source, /readFunctionFailure\(data, error, "Erro ao excluir conta"\)/g);
  assert.match(source, /const invokePushNotification/);
  assert.doesNotMatch(source, /fire-and-forget, falha silenciosa/);
});

test("briefing Lovable preserva contratos e proibe publicacao", async () => {
  const prompt = await readFile(new URL("../PROMPT_LOVABLE_LAYOUT_ROTINUP.md", import.meta.url), "utf8");

  assert.match(prompt, /React 19/);
  assert.match(prompt, /Supabase/);
  assert.match(prompt, /Free.*1 filho/s);
  assert.match(prompt, /Premium.*10 filhos/s);
  assert.match(prompt, /390x844/);
  assert.match(prompt, /n.o publique, n.o conecte a produ..o e n.o execute migrations/i);
});
