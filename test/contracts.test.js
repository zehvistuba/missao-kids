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

test("home do responsavel preserva aprovacoes, timers e gestao familiar", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/parent-home-refresh.css", import.meta.url), "utf8");
  const parent = source.slice(source.indexOf("const ParentDash"), source.indexOf("// ADMIN PANEL"));
  const home = parent.slice(parent.indexOf('{tab === "home"'), parent.indexOf("{/* MISSIONS */}"));
  const review = parent.slice(parent.indexOf("const review = async"), parent.indexOf("const isLimitError"));

  assert.match(source, /import "\.\/styles\/parent-home-refresh\.css"/);
  assert.match(parent, /data-tab=\{tab\}/);
  assert.match(parent, /<LoadErrorBlock onRetry=\{load\} tone=\{parentTheme\}/);
  assert.match(home, /className="ru-home-overview"/);
  assert.match(home, /role="progressbar"/);
  assert.match(home, /className="ru-home-section ru-home-attention"/);
  assert.match(home, /attentionCount === 0/);
  assert.match(home, /<TimerControl[\s\S]*onStart=\{startTimer\}[\s\S]*onPause=\{pauseTimer\}[\s\S]*onFinish=\{finishTimer\}[\s\S]*tone=\{parentTheme\}/);
  assert.match(home, /approveRedemption\(redemption\.id\)/);
  assert.match(home, /confirmDelivery\(redemption\.id\)/);
  assert.equal((home.match(/cancelRedemption\(redemption\.id\)/g) || []).length, 2);
  assert.match(home, /review\(item\.log_id, true\)/);
  assert.match(home, /review\(item\.log_id, false\)/);
  assert.match(home, /parentCheck\(child\.id, mission\.id\)/);
  assert.match(home, /setEditingChild\(child\)/);
  assert.match(home, /setExtratoTarget\(child\)/);
  assert.match(home, /setDemeritTarget\(child\)/);
  assert.match(home, /setRedeemTarget\(child\)/);
  assert.match(home, /className="ru-home-child-edit"[\s\S]*aria-label=\{`Editar perfil de \$\{child\.display_name\}`\}/);
  assert.match(home, /className="ru-home-child-actions__primary"[\s\S]*className="ru-home-child-actions__correction"/);
  assert.match(home, /className="ru-home-child-action ru-home-child-action--statement"/);
  assert.match(home, /className="ru-home-child-action ru-home-child-action--reward"/);
  assert.match(home, /className="ru-home-child-action ru-home-child-action--demerit"/);
  assert.match(home, /PLAN_LIMITS\.premium\.coParents/);
  assert.match(home, /onClick=\{copyCode\}/);
  assert.match(home, /onClick=\{generateCode\}/);

  assert.match(review, /if \(reviewingLog\) return/);
  assert.ok(review.indexOf("setReviewingLog(logId)") < review.indexOf('supabase.rpc("review_mission"'));
  assert.ok(review.indexOf('supabase.rpc("review_mission"') < review.indexOf("setReviewingLog(null)"));
  assert.match(home, /const busy = Boolean\(reviewingLog\)/);
  assert.match(home, /disabled=\{busy\} aria-busy=\{reviewing\}/);

  assert.match(css, /\.ru-parent-workspace\[data-tab="home"\]/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.ru-home-mission-list[\s\S]*max-height: 360px/);
  assert.match(css, /\.ru-home-mission-list[\s\S]*max-height: none/);
  assert.match(css, /\.ru-home-child-actions__correction[\s\S]*border-left: 1px solid/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.ru-home-child-actions__correction[\s\S]*border-top: 1px solid/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
});

test("gestao de missoes preserva contratos e trata falhas concorrentes", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/parent-missions-refresh.css", import.meta.url), "utf8");
  const plan = await readFile(new URL("../PLANO_REFRESH_VISUAL.md", import.meta.url), "utf8");
  const parent = source.slice(source.indexOf("const ParentDash"), source.indexOf("// ADMIN PANEL"));
  const missions = parent.slice(parent.indexOf('{tab === "missions"'), parent.indexOf("{/* REWARDS */}"));
  const createMission = parent.slice(parent.indexOf("const createMission = async"), parent.indexOf("const createReward = async"));
  const reorder = parent.slice(parent.indexOf("const saveMissionOrder = async"), parent.indexOf("const getChildLog"));
  const editMission = parent.slice(parent.indexOf("{/* Modal editar missão */}"), parent.indexOf("{/* Modal editar recompensa */}"));
  const modal = source.slice(source.indexOf("const MissionModal"), source.indexOf("const RewardModal"));

  assert.match(source, /import "\.\/styles\/parent-missions-refresh\.css"/);
  assert.match(missions, /className="ru-missions-page"/);
  assert.match(missions, /id="ru-new-mission-form"[\s\S]*onSubmit=/);
  assert.match(missions, /className="sr-only">Nome da missão/);
  assert.match(missions, /aria-pressed=\{newM\.frequency === o\.key\}/);
  assert.match(missions, /draggable=\{isDesktop && !orderingMissions\}/);
  assert.match(missions, /moveMission\(mission\.id, -1\)/);
  assert.match(missions, /moveMission\(mission\.id, 1\)/);
  assert.match(missions, /aria-live="polite"/);
  assert.match(missions, /aria-expanded=\{showArchivedMissions\}/);
  assert.match(missions, /missionLimitReached \? "Ver Premium" : "Reativar"/);

  assert.match(createMission, /if \(creatingMission\) return/);
  assert.match(createMission, /newM\.title\.trim\(\)/);
  assert.match(createMission, /data\?\.success === false/);
  assert.ok(createMission.indexOf("durationWarning") < createMission.indexOf('notify(durationWarning || "🎯 Missão criada!"'));
  assert.match(createMission, /captureActionError\(durationError, "mission", "set_duration", "parent_missions"\)/);

  assert.match(reorder, /const \{ error \} = await supabase\.rpc\("reorder_missions"/);
  assert.ok(reorder.indexOf("if (error)") < reorder.indexOf("setMissions(withOrder)"));
  assert.match(reorder, /setReorderStatus\("A nova ordem não foi salva\."\)/);
  assert.match(parent, /familyPlan !== "premium" && missions\.length >= PLAN_LIMITS\.free\.activeMissions/);

  assert.match(editMission, /updatedMission\?\.success === false/);
  assert.ok(editMission.indexOf("updatedMission?.success === false") < editMission.indexOf("setEditingMission(null)"));
  assert.match(editMission, /p_minutes: data\.duration_minutes/);
  assert.match(modal, /mission\.duration_minutes \?\? 0/);
  assert.match(modal, /aria-labelledby="ru-mission-dialog-title"/);
  assert.match(modal, /aria-busy=\{saving\}/);
  assert.match(modal, /aria-busy=\{deactivating\}/);

  assert.match(css, /\.ru-parent-workspace\[data-tab="missions"\]/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
  assert.match(plan, /Backlog pos-refresh do Lovable/);
  assert.match(plan, /nao uma autorizacao de implementacao/);
});

test("tema do painel preserva o layout e recupera a paleta original do RotinUp", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/parent-theme-refresh.css", import.meta.url), "utf8");
  const parent = source.slice(source.indexOf("const ParentDash"), source.indexOf("// ADMIN PANEL"));

  assert.match(source, /const PARENT_THEME_STORAGE_KEY = "rotinup-parent-theme-v1"/);
  assert.match(source, /const getStoredParentTheme = \(\) =>/);
  assert.match(source, /import "\.\/styles\/parent-theme-refresh\.css"/);
  assert.match(parent, /useState\(getStoredParentTheme\)/);
  assert.match(parent, /window\.localStorage\.setItem\(PARENT_THEME_STORAGE_KEY, parentTheme\)/);
  assert.match(parent, /className="ru-parent-shell" data-theme=\{parentTheme\}/);
  assert.match(parent, /aria-pressed=\{parentTheme === "dark"\}/);
  assert.match(parent, /aria-label=\{parentTheme === "dark" \? "Ativar tema claro" : "Ativar tema escuro"\}/);

  for (const color of ["#0f0f1a", "#252540", "#ff6b35", "#ffd23f", "#06d6a0", "#9b5de5", "#4cc9f0", "#f72585"]) {
    assert.match(css, new RegExp(color));
  }
  assert.match(css, /\.ru-parent-shell\[data-theme="dark"\]/);
  assert.match(css, /color-scheme: dark/);
  assert.match(css, /\.ru-parent-theme-toggle:focus-visible/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
});

test("recompensas e resgates preservam transicoes e evitam acoes duplicadas", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/parent-rewards-refresh.css", import.meta.url), "utf8");
  const cancelSql = await readFile(new URL("../supabase_fix_auditoria_p1.sql", import.meta.url), "utf8");
  const parent = source.slice(source.indexOf("const ParentDash"), source.indexOf("// ADMIN PANEL"));
  const rewards = parent.slice(parent.indexOf('{tab === "rewards"'), parent.indexOf("{/* STATS */}"));
  const createReward = parent.slice(parent.indexOf("const createReward = async"), parent.indexOf("const suggestMissions"));
  const redemptionActions = parent.slice(parent.indexOf("const confirmDelivery = async"), parent.indexOf("const applyDemerit"));
  const editReward = parent.slice(parent.indexOf("{/* Modal editar recompensa */}"), parent.indexOf("{/* Navegação desktop"));
  const modal = source.slice(source.indexOf("const RewardModal"), source.indexOf("const nullif0"));

  assert.match(source, /import "\.\/styles\/parent-rewards-refresh\.css"/);
  assert.match(rewards, /className="ru-rewards-page"/);
  assert.match(rewards, /className="ru-redemption-card" data-stage="requested"/);
  assert.match(rewards, /className="ru-redemption-card" data-stage="approved"/);
  assert.match(rewards, /confirmingCancel \? cancelRedemption\(redemption\.id\) : setConfirmCancelRed\(redemption\.id\)/);
  assert.match(rewards, /id="ru-new-reward-form"[\s\S]*onSubmit=/);
  assert.match(rewards, /className="sr-only">Nome da recompensa/);
  assert.match(rewards, /aria-pressed=\{newR\.emoji === option\}/);
  assert.match(rewards, /aria-expanded=\{showArchivedRewards\}/);
  assert.match(rewards, /rewardLimitReached \? "Ver Premium" : "Reativar"/);

  assert.match(parent, /familyPlan !== "premium" && activeRewardCount >= PLAN_LIMITS\.free\.activeRewards/);
  assert.match(createReward, /if \(creatingReward\) return/);
  assert.match(createReward, /newR\.title\.trim\(\)/);
  assert.match(createReward, /data\?\.success === false/);
  assert.ok(createReward.indexOf("durationWarning") < createReward.indexOf('notify(durationWarning || "🎁 Recompensa criada!"'));
  assert.match(createReward, /captureActionError\(durationError, "reward", "set_duration", "parent_rewards"\)/);

  assert.equal((redemptionActions.match(/redemptionActionsRef\.current\.has\(redemptionId\)/g) || []).length, 3);
  assert.equal((redemptionActions.match(/redemptionActionsRef\.current\.add\(redemptionId\)/g) || []).length, 3);
  assert.equal((redemptionActions.match(/redemptionActionsRef\.current\.delete\(redemptionId\)/g) || []).length, 3);
  assert.match(redemptionActions, /supabase\.rpc\("approve_redemption"/);
  assert.match(redemptionActions, /supabase\.rpc\("confirm_redemption"/);
  assert.match(redemptionActions, /supabase\.rpc\("cancel_redemption"/);

  assert.match(editReward, /updatedReward\?\.success === false/);
  assert.ok(editReward.indexOf("updatedReward?.success === false") < editReward.indexOf("setEditingReward(null)"));
  assert.match(editReward, /p_minutes: data\.duration_minutes/);
  assert.match(modal, /reward\.duration_minutes \?\? 0/);
  assert.match(modal, /aria-labelledby="ru-reward-dialog-title"/);
  assert.match(modal, /aria-busy=\{saving\}/);
  assert.match(modal, /aria-busy=\{deactivating\}/);

  const guardedTransition = cancelSql.indexOf("UPDATE redemption_logs");
  const transitionResult = cancelSql.indexOf("RETURNING * INTO v_log", guardedTransition);
  const refund = cancelSql.indexOf("UPDATE profiles SET kidcoins", transitionResult);
  assert.ok(guardedTransition >= 0 && guardedTransition < transitionResult && transitionResult < refund);
  assert.match(cancelSql, /AND status IN \('requested','approved'\)/);

  assert.match(css, /\.ru-parent-workspace\[data-tab="rewards"\]/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
});

test("estatisticas, conta, Premium e LGPD preservam contratos na etapa 4D", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/parent-account-refresh.css", import.meta.url), "utf8");
  const product = await readFile(new URL("../src/config/product.js", import.meta.url), "utf8");
  const aiLimitSql = await readFile(new URL("../supabase_ia_rate_limit.sql", import.meta.url), "utf8");
  const parent = source.slice(source.indexOf("const ParentDash"), source.indexOf("// ADMIN PANEL"));
  const stats = parent.slice(parent.indexOf('{tab === "stats"'), parent.indexOf("{/* CONTA / CONFIGURAÇÕES */}"));
  const settings = parent.slice(parent.indexOf('{tab === "settings"'), parent.indexOf("</>}"));
  const addAIMission = parent.slice(parent.indexOf("const addAIMission = async"), parent.indexOf("const navTabs"));
  const deleteAccount = parent.slice(parent.indexOf("const deleteAccount = async"), parent.indexOf("// Reconciliação de pagamento"));
  const claimPremium = parent.slice(parent.indexOf("const claimPremium = async"), parent.indexOf("useEffect(() =>", parent.indexOf("const claimPremium = async")));
  const push = source.slice(source.indexOf("async function subscribePush"), source.indexOf("// ─── Add Child Modal"));
  const reportModal = source.slice(source.indexOf("const ReportIssueModal"), source.indexOf("const TermsGate"));
  const upgradeModal = source.slice(source.indexOf("const UpgradeModal"), source.indexOf("// ─── Mission Modal"));

  assert.match(source, /import "\.\/styles\/parent-account-refresh\.css"/);
  assert.match(parent, /<LoadErrorBlock onRetry=\{load\} tone=\{parentTheme\}/);
  assert.match(stats, /className="ru-insights-page"/);
  assert.match(stats, /className="ru-insights-metrics"/);
  assert.match(stats, /aria-valuenow=\{familyProgressPercent\}/);
  assert.match(stats, /childInsights\.map/);
  assert.match(stats, /className="ru-insights-ai"/);
  assert.match(stats, /Até 200 solicitações de IA por dia/);
  assert.match(stats, /Até 40 solicitações de IA por dia/);
  assert.match(stats, /aria-busy=\{addingAIMission === mission\.title\}/);

  assert.match(addAIMission, /if \(addingAIMission\) return/);
  assert.ok(addAIMission.indexOf("setAddingAIMission(m.title)") < addAIMission.indexOf('supabase.rpc("create_mission"'));
  assert.match(addAIMission, /data\?\.success === false/);
  assert.match(addAIMission, /captureActionError\(error, "ai", "create_suggested_mission", "parent_stats"\)/);
  assert.match(addAIMission, /finally[\s\S]*setAddingAIMission\(null\)/);

  assert.match(settings, /className="ru-settings-page"/);
  assert.match(settings, /id="parent-display-name"/);
  assert.match(settings, /<NotifyToggle userId=\{profile\.id\}/);
  assert.match(settings, /confirmRemoveCoParent === cp\.id \? removeCoParent\(cp\.id\)/);
  assert.match(settings, /Digite <b>EXCLUIR<\/b> para confirmar/);
  assert.match(settings, /deleteConfirmationText !== "EXCLUIR"/);
  assert.match(settings, /profile\.terms_version \|\| TERMS_VERSION/);
  assert.match(deleteAccount, /if \(deletingAccount \|\| deleteConfirmationText !== "EXCLUIR"\) return/);
  assert.match(deleteAccount, /supabase\.functions\.invoke\("delete-account"\)/);

  assert.match(push, /"Notification" in window/);
  assert.match(push, /className="ru-notify-unavailable" role="status"/);
  assert.match(push, /if \(error\) throw error/);
  assert.match(push, /if \(upsertError\) throw upsertError/);
  assert.match(push, /if \(deleteError\) throw deleteError/);
  assert.match(push, /captureActionError\(err, "push", "refresh", "account_notifications"\)/);
  assert.match(reportModal, /theme = "dark"/);
  assert.match(reportModal, /data-theme=\{theme\}/);
  assert.match(reportModal, /aria-labelledby="report-issue-title"/);

  assert.match(upgradeModal, /theme = "dark"/);
  assert.match(upgradeModal, /data-theme=\{theme\}/);
  assert.match(upgradeModal, /aria-pressed=\{billing === key\}/);
  assert.match(upgradeModal, /HOTMART_CHECKOUT_URLS\[billing\]/);
  assert.match(upgradeModal, /encodeURIComponent\(userEmail\)/);
  assert.match(upgradeModal, /activated = await onClaim\(\)/);
  assert.ok(upgradeModal.indexOf("setClaiming(false)") < upgradeModal.indexOf("if (activated) onClose()"));
  assert.match(claimPremium, /return true/);
  assert.equal((claimPremium.match(/return false/g) || []).length, 2);

  assert.match(product, /IA: até 200 solicitações por dia/);
  assert.match(product, /IA: até 40 solicitações por dia/);
  assert.match(product, /IA: relatório semanal sob demanda/);
  assert.match(aiLimitSql, /v_plan = 'premium' THEN 200 ELSE 40/);
  assert.doesNotMatch(product, /IA: sugestão de missões ilimitada/);
  assert.doesNotMatch(source, /relatórios semanais automáticos/);

  assert.match(css, /\.ru-parent-workspace\[data-tab="stats"\]/);
  assert.match(css, /\.ru-parent-workspace\[data-tab="settings"\]/);
  assert.match(css, /\.ru-parent-modal-scope\[data-theme="dark"\]/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
});

test("reativacao de missoes e recompensas respeita limites atomicos", async () => {
  const sql = await readFile(new URL("../supabase_harden_reactivation_limits.sql", import.meta.url), "utf8");
  const sourceOfTruth = await readFile(new URL("../SQL_SOURCE_OF_TRUTH.md", import.meta.url), "utf8");

  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reactivate_mission\(p_mission_id UUID\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reactivate_reward\(p_reward_id UUID\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.enforce_active_catalog_limit\(\)/);
  assert.equal((sql.match(/FOR UPDATE;/g) || []).length, 3);
  assert.equal((sql.match(/v_plan <> 'premium'/g) || []).length, 2);
  assert.match(sql, /v_active_count >= 5/);
  assert.match(sql, /v_active_count >= 3/);
  assert.match(sql, /OLD\.family_id IS NOT DISTINCT FROM NEW\.family_id/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF is_active, family_id ON public\.missions/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF is_active, family_id ON public\.rewards/);
  assert.equal((sql.match(/SET search_path = pg_catalog, public/g) || []).length, 3);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.enforce_active_catalog_limit\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reactivate_mission\(UUID\) FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reactivate_reward\(UUID\) FROM PUBLIC, anon/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sourceOfTruth, /supabase_harden_reactivation_limits\.sql/);
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
