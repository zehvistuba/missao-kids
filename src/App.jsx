import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  FREE_FEATURES,
  getAdminChildCount,
  HOTMART_CHECKOUT_URLS,
  PLAN_LIMITS,
  PLANS,
  PREMIUM_FEATURES,
  TERMS_LAST_UPDATED_LABEL,
  TERMS_VERSION,
} from "./config/product.js";
import { useModalDialog } from "./hooks/useModalDialog.js";
import { reportAppError, reportUserIssue } from "./lib/errorReporter.js";
import { supabase } from "./lib/supabase.js";
import heroFamilyImage from "./assets/rotinup-hero-family.webp";
import "./styles/landing-refresh.css";
import "./styles/flow-refresh.css";
import "./styles/parent-shell-refresh.css";
import "./styles/parent-home-refresh.css";
import "./styles/parent-missions-refresh.css";
import "./styles/parent-rewards-refresh.css";
import "./styles/parent-theme-refresh.css";
import "./styles/parent-account-refresh.css";
import "./styles/managed-child-refresh.css";
import "./styles/admin-refresh.css";

const PARENT_THEME_STORAGE_KEY = "rotinup-parent-theme-v1";
const REWARD_EMOJIS = ["🎁","🍕","🎮","🎬","🏖️","🍦","📱","🎪","🎠","🚀","🎤","🏆","🛍️","🎲","🧸","🍫","🌟","🍿","🎡","🎯"];

const getStoredParentTheme = () => {
  try {
    return window.localStorage.getItem(PARENT_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

const sanitizeStr = (v, maxLen = 120) =>
  Array.from(String(v ?? ""), (char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : char;
  }).join("").replace(/[<>"'`]/g, "").trim().slice(0, maxLen);

const sanitizeContext = (ctx) => {
  if (!ctx || typeof ctx !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string") out[k] = sanitizeStr(v);
    else if (typeof v === "number") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.map(item =>
      typeof item === "object" ? sanitizeContext(item) : typeof item === "string" ? sanitizeStr(item) : item
    );
    else if (typeof v === "object" && v !== null) out[k] = sanitizeContext(v);
    else out[k] = v;
  }
  return out;
};

const aiCooldowns = {};
const AI_COOLDOWN_MS = 8000;

const withRequestReference = (message, requestId) => {
  const compactId = String(requestId ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return compactId ? `${message} (ref. ${compactId})` : message;
};

const readFunctionFailure = async (data, error, fallback) => {
  let responseBody = data;
  if (!responseBody && error?.context?.json) {
    try {
      responseBody = await error.context.json();
    } catch {
      // Network and gateway failures may not expose a JSON response body.
    }
  }

  const message = responseBody?.error || error?.message || fallback;
  return withRequestReference(message, responseBody?.requestId);
};

const callAI = async (action, context) => {
  const now = Date.now();
  if (aiCooldowns[action] && now - aiCooldowns[action] < AI_COOLDOWN_MS) {
    throw new Error("Aguarde alguns segundos antes de tentar novamente");
  }
  aiCooldowns[action] = now;

  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { action, context: sanitizeContext(context) },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = withRequestReference(body.error, body.requestId);
    } catch {
      // Some network errors do not expose a JSON response body.
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(withRequestReference(data.error, data.requestId));
  return data?.result;
};

const captureActionError = (error, source, action, screen) => {
  void reportAppError({ error, source, action, screen });
};

const invokePushNotification = async (body, source, screen) => {
  try {
    const { data, error } = await supabase.functions.invoke("push-notify", { body });
    if (error || data?.error) {
      const failure = await readFunctionFailure(data, error, "Erro ao enviar notificação");
      captureActionError(new Error(failure), source, "send", screen);
    }
  } catch (error) {
    captureActionError(error, source, "send", screen);
  }
};

const FREQ_OPTS = [
  { key: "daily",    label: "Diária",    emoji: "📅" },
  { key: "weekly",   label: "Semanal",   emoji: "📆" },
  { key: "biweekly", label: "Quinzenal", emoji: "🗓️" },
  { key: "monthly",  label: "Mensal",    emoji: "🌙" },
];
const freqLabel = (f) => FREQ_OPTS.find(o => o.key === f)?.label ?? "Diária";

const T = {
  primary: "#FF6B35", secondary: "#FFD23F", accent: "#06D6A0",
  purple: "#9B5DE5", blue: "#4CC9F0", pink: "#F72585",
  darker: "#0F0F1A", card: "#252540", cardLight: "#2E2E50",
  text: "#F0F0FF", textMuted: "#9090B0", warning: "#FFD23F",
};

// Paleta de fundos para ícones de missão/recompensa — cicla por índice
const ICON_GRADIENTS = [
  `linear-gradient(135deg, #FF6B3522, #FF6B3544)`,
  `linear-gradient(135deg, #06D6A022, #06D6A044)`,
  `linear-gradient(135deg, #9B5DE522, #9B5DE544)`,
  `linear-gradient(135deg, #4CC9F022, #4CC9F044)`,
  `linear-gradient(135deg, #FFD23F22, #FFD23F44)`,
  `linear-gradient(135deg, #F7258522, #F7258544)`,
];
const ICON_BORDERS = ["#FF6B3555","#06D6A055","#9B5DE555","#4CC9F055","#FFD23F55","#F7258555"];
const iconGrad   = (i) => ICON_GRADIENTS[i % ICON_GRADIENTS.length];
const iconBorder = (i) => ICON_BORDERS[i % ICON_BORDERS.length];

const DEMERIT_PRESETS = [
  { emoji: "😤", title: "Reclamação",               coins: 15 },
  { emoji: "🌙", title: "Não dormiu no horário",    coins: 10 },
  { emoji: "📋", title: "ATA da escola",             coins: 30 },
  { emoji: "😠", title: "Respondeu ao responsável",  coins: 20 },
  { emoji: "❌", title: "Mau comportamento",         coins: 25 },
  { emoji: "📱", title: "Excesso de tela",           coins: 15 },
];

const LEVELS = [
  { level: 1, name: "Recruta",     xpNeeded: 0,    color: "#9090B0", emoji: "🌱" },
  { level: 2, name: "Explorador",  xpNeeded: 100,  color: "#4CC9F0", emoji: "⭐" },
  { level: 3, name: "Aventureiro", xpNeeded: 300,  color: "#06D6A0", emoji: "🚀" },
  { level: 4, name: "Herói",       xpNeeded: 600,  color: "#FFD23F", emoji: "🦸" },
  { level: 5, name: "Lendário",    xpNeeded: 1000, color: "#FF6B35", emoji: "👑" },
  { level: 6, name: "Supremo",     xpNeeded: 1500, color: "#F72585", emoji: "💎" },
];

const getLvl  = (xp) => LEVELS.filter(l => xp >= l.xpNeeded).pop();
const getNext = (xp) => LEVELS.find(l => l.xpNeeded > xp) || LEVELS[LEVELS.length - 1];
const getSaudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

// Retorna data LOCAL no formato YYYY-MM-DD (evita bug de fuso UTC vs Brasil)
const localDateStr = (daysAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const calcAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const b = new Date(birthDate);
  let age = today.getFullYear() - b.getFullYear();
  if (today.getMonth() - b.getMonth() < 0 || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--;
  return age;
};

const DateInp = ({ value, onChange }) => (
  <div style={{ position: "relative", marginBottom: 14 }}>
    <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, zIndex: 1, pointerEvents: "none" }}>🎂</span>
    <input type="date" value={value} onChange={onChange}
      max={new Date().toISOString().split("T")[0]}
      min={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
      style={{ width: "100%", padding: "14px 18px 14px 46px", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 15, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
    />
  </div>
);

// ─── UI Components ────────────────────────────────────────
const Notif = ({ msg, type }) => msg ? (
  <div role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"} style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", width: "min(calc(100vw - 32px), 398px)", zIndex: 9999, background: T.card, borderRadius: 16, padding: "14px 20px", border: `1px solid ${type === "error" ? T.pink : T.accent}44`, color: T.text, fontWeight: 700, fontSize: 14, textAlign: "center", animation: "slideDown 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{msg}</div>
) : null;

const Inp = ({ placeholder, type = "text", value, onChange, icon, maxLength }) => (
  <div style={{ position: "relative", marginBottom: 14 }}>
    {icon && <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, zIndex: 1 }}>{icon}</span>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength}
      style={{ width: "100%", padding: icon ? "14px 18px 14px 46px" : "14px 18px", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 15, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box" }}
      onFocus={e => e.target.style.borderColor = T.primary}
      onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
    />
  </div>
);

const Btn = ({ children, onClick, gradient, disabled, outline, small }) => (
  <button onClick={onClick} disabled={disabled} style={{ width: small ? "auto" : "100%", padding: small ? "10px 20px" : "15px 24px", borderRadius: 16, border: outline ? "1px solid rgba(255,255,255,0.15)" : "none", background: disabled ? "rgba(255,255,255,0.08)" : outline ? "rgba(255,255,255,0.04)" : gradient || `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: disabled ? T.textMuted : T.text, fontWeight: 800, fontSize: small ? 13 : 15, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", letterSpacing: 0.3 }}>{children}</button>
);

// ─── DiceBear Avatar System ────────────────────────────────
const DB_STYLES = [
  { key: "__emoji__",   label: "🐾 Figurinha"   },
  { key: "adventurer",  label: "🧒 Cartoon"     },
  { key: "avataaars",   label: "🎨 Personagem"  },
  { key: "bottts",      label: "🤖 Robô"        },
  { key: "micah",       label: "🌈 Colorido"    },
  { key: "pixel-art",   label: "🕹️ Pixel"       },
];
const DB_SEEDS = [
  "Luna","Bento","Sofia","Pedro","Leo","Ana","Gabi","Rafa","Nina","Theo",
  "Mia","Duda","Luca","Bia","Gui","Lara","Mel","Kaio","Isis","Teo",
  "Turbo","Flash","Foguete","Ninja","Dragao","Estrela","Cometa","Neon",
  "Pixel","Spark","Bolt","Nova","Sora","Kira","Zara","Ace","Max","Rex",
];
const EMOJI_AVATARS = [
  "🐶","🐱","🐼","🦁","🐯","🦊","🐻","🐨","🐸","🐧","🦋","🦄",
  "🐬","🦈","🦅","🦜","🐢","🐠","🦔","🐰","🐹","🐭","🦮","🐕‍🦺",
  "⚽","🏀","🎾","🏊","🚴","🤸","🥊","🏋️","🛹","🎽","🏄","🧗",
  "🚀","⭐","🌟","💫","🔥","⚡","🌈","🎯","🏆","🥇","💎","🎮",
  "🦸","🦹","🧙","🧝","🧜","🧚","🦸‍♂️","🧑‍🚀","🧑‍🎨","🧑‍🔬","🧑‍🍳","🧑‍🎤",
];
const avatarUrl = (seed, style = "adventurer") =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

const AvatarImg = ({ value, size = 48, radius = 14, style: css = {} }) => {
  if (value?.startsWith("http")) {
    return <img src={value} alt="avatar" width={size} height={size} style={{ borderRadius: radius, objectFit: "cover", display: "block", background: "rgba(156,93,229,0.15)", ...css }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.55, background: "rgba(255,255,255,0.06)", ...css }}>
      {value || "👦"}
    </div>
  );
};

const DiceBearPicker = ({ value, onChange, tone = "dark" }) => {
  const isEmoji = value && !value.startsWith("http");
  const isLight = tone === "light";
  const [dbStyle, setDbStyle] = useState(
    isEmoji ? "__emoji__" : (DB_STYLES.find(s => value?.includes(`/${s.key}/`))?.key || "__emoji__")
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
        {DB_STYLES.map(s => (
          <button type="button" key={s.key} onClick={() => setDbStyle(s.key)} aria-pressed={dbStyle === s.key}
            style={{ padding: "5px 10px", borderRadius: 10, border: `2px solid ${dbStyle === s.key ? (isLight ? "#C84734" : T.purple) : (isLight ? "#DCE3ED" : "rgba(255,255,255,0.12)")}`, background: dbStyle === s.key ? (isLight ? "#FFF1ED" : `${T.purple}22`) : (isLight ? "#FFFFFF" : "rgba(255,255,255,0.04)"), color: dbStyle === s.key ? (isLight ? "#A93628" : T.purple) : (isLight ? "#59647B" : T.textMuted), fontWeight: 800, fontSize: 10, cursor: "pointer", fontFamily: "'Nunito', sans-serif", lineHeight: 1.5, whiteSpace: "nowrap", flexShrink: 0 }}>
            {s.label}
          </button>
        ))}
      </div>
      {dbStyle === "__emoji__" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, maxHeight: 210, overflowY: "auto" }}>
          {EMOJI_AVATARS.map(em => (
            <button type="button" key={em} onClick={() => onChange(em)} aria-label={`Usar avatar ${em}`} aria-pressed={value === em}
              style={{ cursor: "pointer", borderRadius: 14, padding: 4, border: `2.5px solid ${value === em ? (isLight ? "#C84734" : T.purple) : "transparent"}`, background: value === em ? (isLight ? "#FFF1ED" : `${T.purple}22`) : (isLight ? "#F7F9FC" : "rgba(255,255,255,0.04)"), transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontFamily: "'Nunito', sans-serif" }}>
              {em}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, maxHeight: 210, overflowY: "auto" }}>
          {DB_SEEDS.map(seed => {
            const url = avatarUrl(seed, dbStyle);
            const sel = value === url;
            return (
              <button type="button" key={seed} onClick={() => onChange(url)} aria-label={`Usar avatar ${seed}`} aria-pressed={sel}
                style={{ cursor: "pointer", borderRadius: 14, padding: 3, border: `2.5px solid ${sel ? (isLight ? "#C84734" : T.purple) : "transparent"}`, background: sel ? (isLight ? "#FFF1ED" : `${T.purple}22`) : (isLight ? "#F7F9FC" : "transparent"), transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={url} alt={seed} width={46} height={46} style={{ borderRadius: 10, display: "block" }} loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePush(userId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (!VAPID_PUBLIC_KEY) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    if (sub) {
      const { error } = await supabase.from("push_subscriptions")
        .upsert({ user_id: userId, subscription: sub.toJSON() }, { onConflict: "user_id" });
      if (error) throw error;
    }
    return sub || null;
  } catch (err) {
    console.warn("[push] subscribePush falhou:", err?.message || err);
    captureActionError(err, "push", "subscribe", "account_notifications");
    return null;
  }
}

function NotifyToggle({ userId }) {
  const [status, setStatus] = useState(() => (
    typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported"
  ));
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(async sub => {
      setSubscribed(!!sub);
      if (sub && userId) {
        // Sempre sincroniza endpoint atual com o banco (evita endpoint expirado)
        await subscribePush(userId);
      } else if (Notification.permission === "granted" && !sub && userId) {
        const newSub = await subscribePush(userId);
        setSubscribed(!!newSub);
      }
    }).catch(() => {});
  }, [userId]);

  if (!("Notification" in window) || !VAPID_PUBLIC_KEY) {
    return (
      <div className="ru-notify-unavailable" role="status">
        <strong>Notificações indisponíveis</strong>
        <p>Este dispositivo ou ambiente ainda não pode receber lembretes.</p>
      </div>
    );
  }

  const handleEnable = async () => {
    setLoading(true);
    setError("");
    try {
      const perm = await Notification.requestPermission();
      setStatus(perm);
      if (perm === "granted") {
        const sub = await subscribePush(userId);
        setSubscribed(!!sub);
        if (!sub) setError("Não foi possível ativar os lembretes agora.");
      }
    } catch (err) {
      captureActionError(err, "push", "permission", "account_notifications");
      setError("Não foi possível solicitar a permissão de notificações.");
    } finally {
      setLoading(false);
    }
  };

  // Reativar/atualizar: troca a inscrição velha por uma nova com a chave VAPID atual
  // (resolve o caso "ativadas mas não recebe" sem precisar de console).
  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const { error: upsertError } = await supabase.from("push_subscriptions")
        .upsert({ user_id: userId, subscription: sub.toJSON() }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;
      setSubscribed(true);
    } catch (err) {
      console.warn("[push] reativar falhou:", err?.message || err);
      captureActionError(err, "push", "refresh", "account_notifications");
      setSubscribed(false);
      setError("Não foi possível atualizar os lembretes.");
    }
    setLoading(false);
  };

  // Desativar: remove a inscrição do navegador e do banco.
  const handleDisable = async () => {
    setLoading(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      const { error: deleteError } = await supabase.from("push_subscriptions").delete().eq("user_id", userId);
      if (deleteError) throw deleteError;
      setSubscribed(false);
    } catch (err) {
      console.warn("[push] desativar falhou:", err?.message || err);
      captureActionError(err, "push", "disable", "account_notifications");
      setSubscribed(false);
      setError("Não foi possível desativar os lembretes.");
    }
    setLoading(false);
  };

  if (status === "granted") {
    return (
      <section className="ru-notify-card" data-active={subscribed} aria-label="Notificações de missões">
        <div className="ru-notify-card__status">
          <span className="ru-notify-card__icon" aria-hidden="true">🔔</span>
          <div>
            <strong>
              {subscribed ? "Notificações ativadas" : "Notificações pausadas"}
            </strong>
            <p>
              {subscribed ? "Você receberá lembretes de missões" : "Toque em reativar para voltar a receber"}
            </p>
          </div>
          <span className="ru-notify-card__indicator" aria-label={subscribed ? "Ativas" : "Pausadas"}>{subscribed ? "Ativas" : "Pausadas"}</span>
        </div>
        {error && <p className="ru-notify-card__error" role="alert">{error}</p>}
        <div className="ru-notify-card__actions">
          <button type="button" className="ru-account-button ru-account-button--secondary" onClick={handleRefresh} disabled={loading} aria-busy={loading}>
            {loading ? "Atualizando..." : "Atualizar inscrição"}
          </button>
          {subscribed && (
            <button type="button" className="ru-account-button ru-account-button--quiet" onClick={handleDisable} disabled={loading}>
              Desativar
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <button type="button" className="ru-notify-enable" onClick={handleEnable} disabled={loading || status === "denied"} aria-busy={loading}>
      <span aria-hidden="true">🔔</span>
      {loading ? "Ativando..." : status === "denied" ? "Notificações bloqueadas — ative no navegador" : "Ativar notificações de missões"}
    </button>
  );
}

// ─── Add Child Modal ───────────────────────────────────────
const AddChildModal = ({ onAdd, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [name, setName]         = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [avatar, setAvatar]     = useState(avatarUrl("Luna"));
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  const age = birthDate ? calcAge(birthDate) : null;

  const handleAdd = async () => {
    if (!name || !birthDate) return;
    if (new Date(birthDate) >= new Date()) { setErr("Data de nascimento inválida."); return; }
    setErr("");
    setLoading(true);
    const { error } = await supabase.rpc("add_child", {
      p_display_name: name,
      p_avatar_emoji: avatar,
      p_age: age,
      p_birth_date: birthDate || null,
    });
    if (error) { setLoading(false); setErr(error.message || "Erro ao adicionar filho. Tente novamente."); return; }
    setLoading(false);
    onAdd();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Adicionar filho" tabIndex={-1} onClick={e => e.stopPropagation()} style={{ position: "relative", background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease" }}>
        <button onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.08)", color: T.textMuted, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 18, marginBottom: 16, textAlign: "center" }}>👶 Adicionar Filho(a)</div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <AvatarImg value={avatar} size={72} radius={22} />
        </div>
        <DiceBearPicker value={avatar} onChange={setAvatar} />
        <div style={{ marginTop: 14 }}>
          <Inp icon="🧒" placeholder="Nome do filho(a)" value={name} onChange={e => setName(e.target.value)} />
          <DateInp value={birthDate} onChange={e => setBirthDate(e.target.value)} />
          {age !== null && <div style={{ color: T.textMuted, fontSize: 12, marginTop: -10, marginBottom: 12, paddingLeft: 4 }}>{age} anos</div>}
          {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Btn onClick={handleAdd} disabled={loading || !name || !birthDate} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>
              {loading ? "Salvando..." : "✅ Adicionar"}
            </Btn>
            <Btn onClick={onClose} outline small>Cancelar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Edit Child Modal ──────────────────────────────────────
const EditChildModal = ({ child, onSave, onDelete, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [name, setName]           = useState(child.display_name || "");
  const [birthDate, setBirthDate] = useState(child.birth_date || "");
  const [avatar, setAvatar]       = useState(child.avatar_emoji || avatarUrl("Luna"));
  const [loading, setLoading]     = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr]             = useState("");

  const age = birthDate ? calcAge(birthDate) : child.age;

  const handleSave = async () => {
    if (!name.trim()) return;
    if (birthDate && new Date(birthDate) >= new Date()) { setErr("Data de nascimento inválida."); return; }
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("update_child", {
      p_child_id:     child.id,
      p_display_name: name.trim(),
      p_birth_date:   birthDate || null,
      p_avatar_emoji: avatar,
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onSave();
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    const { error } = await supabase.rpc("delete_child", { p_child_id: child.id });
    setDeleting(false);
    if (error) { setErr(error.message); return; }
    onDelete();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Editar ${child.display_name}`} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ position: "relative", background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.08)", color: T.textMuted, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 18, marginBottom: 16, textAlign: "center" }}>✏️ Editar {child.display_name}</div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <AvatarImg value={avatar} size={72} radius={22} />
        </div>
        <DiceBearPicker value={avatar} onChange={setAvatar} />
        <div style={{ marginTop: 14 }}>
          <Inp icon="🧒" placeholder="Nome da criança" value={name} onChange={e => setName(e.target.value)} />
          <DateInp value={birthDate} onChange={e => setBirthDate(e.target.value)} />
          {age !== null && <div style={{ color: T.textMuted, fontSize: 12, marginTop: -10, marginBottom: 12, paddingLeft: 4 }}>{age} anos</div>}
          {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <Btn onClick={handleSave} disabled={loading || !name.trim()} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>
              {loading ? "Salvando..." : "✅ Salvar"}
            </Btn>
            <Btn onClick={onClose} outline small>Cancelar</Btn>
          </div>
          <button onClick={handleDelete} disabled={deleting} style={{ width: "100%", padding: "13px", borderRadius: 14, border: `1px solid ${confirmDel ? T.pink : "rgba(255,255,255,0.1)"}`, background: confirmDel ? `${T.pink}22` : "transparent", color: confirmDel ? T.pink : T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s" }}>
            {deleting ? "Excluindo..." : confirmDel ? "⚠️ Toque para confirmar exclusão" : "🗑️ Excluir criança"}
          </button>
          {confirmDel && <div style={{ color: T.textMuted, fontSize: 11, textAlign: "center", marginTop: 6 }}>Esta ação é irreversível e remove todos os dados da criança.</div>}
        </div>
      </div>
    </div>
  );
};

// ─── Child Join (criança sem família) ─────────────────────
const ChildJoin = ({ onDone }) => {
  const [step, setStep]           = useState("code"); // "code" | "claim" | "profile"
  const [code, setCode]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState("");
  const [avatar, setAvatar]       = useState(avatarUrl("Luna"));
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving]       = useState(false);
  const [orphans, setOrphans]     = useState([]);
  const [claiming, setClaiming]   = useState(false);

  const join = async () => {
    if (code.length < 6) return;
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("join_family_by_code", { p_code: code });
    if (error) { setLoading(false); setErr(error.message || "Código inválido ou expirado"); return; }

    // Check for orphan profiles the parent may have pre-created
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); setStep("profile"); return; }
    const { data: myProfile } = await supabase.from("profiles").select("family_id").eq("id", authUser.id).single();
    if (myProfile?.family_id) {
      const { data: kids } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_emoji, age")
        .eq("family_id", myProfile.family_id)
        .eq("role", "child")
        .neq("id", authUser.id);
      if (kids?.length > 0) {
        setOrphans(kids);
        setLoading(false);
        setStep("claim");
        return;
      }
    }
    setLoading(false);
    setStep("profile");
  };

  const claimProfile = async (orphanId) => {
    setErr(""); setClaiming(true);
    const { error } = await supabase.rpc("claim_child_profile", { p_orphan_id: orphanId });
    setClaiming(false);
    if (error) { setErr(error.message || "Erro ao vincular perfil"); return; }
    onDone();
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updates = { avatar_emoji: avatar };
      if (birthDate) { updates.birth_date = birthDate; updates.age = calcAge(birthDate); }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
        if (error) throw error;
      }
      onDone();
    } catch {
      setErr("Não foi possível salvar o perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "claim") {
    return (
      <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", padding: "0 24px", justifyContent: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>👋</div>
          <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Você é algum desses?</div>
          <div style={{ color: T.textMuted, fontSize: 15 }}>Seu responsável já criou um perfil pra você!</div>
        </div>
        {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {orphans.map(child => (
            <button key={child.id} onClick={() => claimProfile(child.id)} disabled={claiming}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 20, border: `2px solid ${T.accent}44`, background: `${T.accent}10`, cursor: claiming ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", textAlign: "left", opacity: claiming ? 0.7 : 1 }}>
              <AvatarImg value={child.avatar_emoji} size={48} radius={14} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>{child.display_name}</div>
                {child.age && <div style={{ color: T.textMuted, fontSize: 13 }}>{child.age} anos</div>}
              </div>
              <div style={{ color: T.accent, fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
                {claiming ? "..." : "Sou eu! 👋"}
              </div>
            </button>
          ))}
        </div>
        <button onClick={() => setStep("profile")}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, color: T.textMuted, fontSize: 14, padding: "13px", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>
          Não sou nenhum desses — criar meu perfil
        </button>
      </div>
    );
  }

  if (step === "profile") {
    const age = birthDate ? calcAge(birthDate) : null;
    return (
      <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", padding: "0 24px", justifyContent: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Bem-vindo à família!</div>
          <div style={{ color: T.textMuted, fontSize: 15 }}>Escolha seu avatar e data de nascimento</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <AvatarImg value={avatar} size={72} radius={22} />
        </div>
        <DiceBearPicker value={avatar} onChange={setAvatar} />
        <div style={{ marginTop: 14 }}>
          <DateInp value={birthDate} onChange={e => setBirthDate(e.target.value)} />
          {age !== null && <div style={{ color: T.textMuted, fontSize: 12, marginTop: -10, marginBottom: 12, paddingLeft: 4 }}>{age} anos</div>}
          <Btn onClick={saveProfile} disabled={saving} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>
            {saving ? "Salvando..." : "🚀 Entrar na aventura!"}
          </Btn>
          <button onClick={onDone} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 13, marginTop: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%", textAlign: "center" }}>Pular por agora</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", padding: "0 24px", justifyContent: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔗</div>
        <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Entrar na família</div>
        <div style={{ color: T.textMuted, fontSize: 15 }}>Peça o código de convite ao seu responsável</div>
      </div>
      <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código de convite" maxLength={8}
        style={{ width: "100%", padding: "18px 24px", borderRadius: 20, background: "rgba(255,255,255,0.06)", border: `2px solid ${T.accent}55`, color: T.text, fontSize: 28, fontFamily: "'Nunito', sans-serif", fontWeight: 900, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 8, marginBottom: 16 }}
      />
      {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
      <Btn onClick={join} disabled={loading || code.length < 4} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>
        {loading ? "Verificando..." : "🔗 Entrar na família"}
      </Btn>
      <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 13, marginTop: 20, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%", textAlign: "center" }}>← Sair e usar outra conta</button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// SPLASH
// ═══════════════════════════════════════════════════════════
const Splash = ({ onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ animation: "bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1)", textAlign: "center" }}>
        <img src="/icon.png" alt="RotinUp" style={{ width: 110, height: 110, marginBottom: 20, borderRadius: 28, filter: `drop-shadow(0 0 24px #9B5DE566)` }} />
        <div style={{ fontSize: 38, fontWeight: 900, color: T.text, letterSpacing: 0, fontFamily: "'Nunito', sans-serif" }}>rotin<span style={{ color: T.primary }}>up</span></div>
        <div style={{ color: T.textMuted, fontSize: 13, marginTop: 8, letterSpacing: 2 }}>TRANSFORME A ROTINA EM AVENTURA</div>
      </div>
      <div style={{ marginTop: 60, display: "flex", gap: 8 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: i === 0 ? 28 : 8, height: 8, borderRadius: 999, background: i === 0 ? T.primary : "rgba(255,255,255,0.2)", animation: `pulse 1s ease-in-out ${i*0.2}s infinite` }} />)}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PLANOS — compartilhado entre LandingPremiumCard e UpgradeModal
// ═══════════════════════════════════════════════════════════
// ─── Card Premium para Landing Page ──────────────────────
const LandingPremiumCard = () => {
  const [billing, setBilling] = useState("annual");
  const plan = PLANS[billing];

  return (
    <article className="ru-plan ru-plan--premium">
      <div className="ru-plan__header">
        <div>
          <h3>Premium</h3>
          <p>Mais espaço para a família crescer</p>
        </div>
        <span className="ru-plan__badge">{plan.badge}</span>
      </div>

      <div className="ru-plan__toggle" aria-label="Período da assinatura">
        {["monthly","annual"].map(b => (
          <button key={b} type="button" aria-pressed={billing === b} onClick={() => setBilling(b)}>
            {b === "monthly" ? "Mensal" : "Anual"}
          </button>
        ))}
      </div>

      <div className="ru-plan__price">
        <div>
          <span>R$</span>
          <strong>{plan.price}</strong>
          <span>{plan.period}</span>
        </div>
        {billing === "annual" && (
          <div className="ru-plan__saving">
            <span>≈ R$ {plan.total}</span>
            <strong>Economize {plan.savings}</strong>
          </div>
        )}
      </div>

      <ul className="ru-plan__features">
        {PREMIUM_FEATURES.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
      </ul>

      <a className="ru-button ru-button--premium" href={HOTMART_CHECKOUT_URLS[billing]} target="_blank" rel="noopener noreferrer">
        Assinar {plan.label} · R$ {plan.price}{plan.period}
      </a>
      <p className="ru-plan__payment">Pagamento seguro via Hotmart</p>
    </article>
  );
};

// ═══════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════
const LandingPage = ({ onSignup, onLogin }) => {
  const [showTerms, setShowTerms] = useState(false);
  const features = [
    { emoji: "🎯", title: "Missões Diárias", desc: "Transforme tarefas em missões claras e adequadas à rotina da família" },
    { emoji: "🪙", title: "KidCoins & Recompensas", desc: "A criança acumula moedas e troca por recompensas definidas pela família" },
    { emoji: "🤖", title: "IA Personalizada", desc: "Sugestões inteligentes de missões e relatórios semanais sob demanda" },
    { emoji: "👨‍👩‍👧", title: "Toda a Família", desc: "Responsáveis organizam e acompanham o progresso de cada criança" },
  ];

  return (
    <div className="ru-landing">
      <section className="ru-hero" aria-labelledby="ru-hero-title">
        <img className="ru-hero__media" src={heroFamilyImage} alt="Família organizando missões e recompensas da rotina" />
        <header className="ru-hero__header">
          <div className="ru-brand" aria-label="RotinUp">
            <img src="/icon.png" alt="" />
            <span>rotin<strong>up</strong></span>
          </div>
          <button type="button" className="ru-button ru-button--quiet" onClick={onLogin}>Entrar</button>
        </header>
        <div className="ru-hero__content">
          <p className="ru-eyebrow">Rotina leve para toda a família</p>
          <h1 id="ru-hero-title">RotinUp</h1>
          <h2>Transforme tarefas em pequenas conquistas.</h2>
          <p className="ru-hero__copy">Missões, KidCoins e recompensas ajudam crianças de diferentes idades a construir autonomia com acompanhamento dos responsáveis.</p>
          <div className="ru-hero__actions">
            <button type="button" className="ru-button ru-button--primary" onClick={onSignup}>Criar conta grátis</button>
            <button type="button" className="ru-button ru-button--secondary" onClick={onLogin}>Já tenho conta</button>
          </div>
          <p className="ru-hero__trust">Comece sem cartão · Perfis infantis gerenciados pelo responsável</p>
        </div>
      </section>

      <section className="ru-stats" aria-label="Destaques do RotinUp">
        {[{ n: "R$ 0", label: "para começar" }, { n: "6", label: "níveis de evolução" }, { n: "16", label: "conquistas para ganhar" }].map((s, i) => (
          <div key={i}>
            <strong>{s.n}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </section>

      <section className="ru-section ru-section--features" aria-labelledby="ru-features-title">
        <div className="ru-section__heading">
          <p className="ru-eyebrow">Um sistema simples de repetir</p>
          <h2 id="ru-features-title">Tudo que sua família precisa</h2>
          <p>Organize a rotina, reconheça o esforço e acompanhe a evolução sem transformar a casa em uma planilha.</p>
        </div>
        <div className="ru-feature-grid">
          {features.map((f, i) => (
            <article className={`ru-feature ru-feature--${i + 1}`} key={f.title}>
              <div className="ru-feature__icon" aria-hidden="true">{f.emoji}</div>
              <div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ru-section ru-section--steps" aria-labelledby="ru-steps-title">
        <div className="ru-section__heading">
          <p className="ru-eyebrow">Do combinado à conquista</p>
          <h2 id="ru-steps-title">Como funciona</h2>
        </div>
        <ol className="ru-step-grid">
          {[
          { step: "1", emoji: "👨‍👩‍👧", title: "Crie a família", desc: "Responsável cadastra a família e adiciona os filhos" },
          { step: "2", emoji: "🎯", title: "Crie missões", desc: "Defina tarefas do dia a dia como missões com recompensas" },
          { step: "3", emoji: "⭐", title: "Registre o progresso", desc: "A família acompanha as tarefas concluídas e o avanço de cada criança" },
          { step: "4", emoji: "✅", title: "Reconheça o esforço", desc: "Aprove as missões e libere KidCoins para as recompensas combinadas" },
        ].map(item => (
          <li key={item.step}>
            <span className="ru-step__number">{item.step}</span>
            <div>
              <h3><span aria-hidden="true">{item.emoji}</span> {item.title}</h3>
              <p>{item.desc}</p>
            </div>
          </li>
          ))}
        </ol>
      </section>

      <section className="ru-section ru-section--levels" aria-labelledby="ru-levels-title">
        <div className="ru-section__heading">
          <p className="ru-eyebrow">Progresso que dá para perceber</p>
          <h2 id="ru-levels-title">6 níveis de evolução</h2>
          <p>Cada missão soma XP, celebra a constância e abre novas conquistas.</p>
        </div>
        <div className="ru-level-grid">
          {LEVELS.map((lv, i) => (
            <article className="ru-level" key={lv.level} style={{ "--level-color": lv.color }}>
              <div className="ru-level__icon" aria-hidden="true">{lv.emoji}</div>
              <div>
                <h3>Nível {lv.level} · {lv.name}</h3>
                <p>{lv.xpNeeded === 0 ? "Início da jornada" : `A partir de ${lv.xpNeeded} XP`}</p>
              </div>
              {i === LEVELS.length - 1 && <span className="ru-level__top">Topo</span>}
            </article>
          ))}
        </div>
      </section>

      <section className="ru-section ru-section--plans" aria-labelledby="ru-plans-title">
        <div className="ru-section__heading">
          <p className="ru-eyebrow">Comece no seu ritmo</p>
          <h2 id="ru-plans-title">Escolha seu plano</h2>
          <p>Use o essencial gratuitamente e faça upgrade quando a família precisar de mais espaço.</p>
        </div>
        <div className="ru-plan-grid">
          <article className="ru-plan ru-plan--free">
            <div className="ru-plan__header">
              <div>
                <h3>Gratuito</h3>
                <p>Para sempre, sem cartão</p>
              </div>
              <strong className="ru-plan__free-price">R$ 0</strong>
            </div>
            <ul className="ru-plan__features">
              {FREE_FEATURES.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
            </ul>
            <button type="button" className="ru-button ru-button--secondary ru-button--full" onClick={onSignup}>Criar conta grátis</button>
          </article>
          <LandingPremiumCard />
        </div>
      </section>

      <section className="ru-final-cta" aria-labelledby="ru-final-title">
        <span aria-hidden="true">★</span>
        <h2 id="ru-final-title">Uma rotina mais leve começa com o primeiro combinado.</h2>
        <p>Crie sua família gratuitamente. Sem cartão de crédito.</p>
        <button type="button" className="ru-button ru-button--light" onClick={onSignup}>Começar grátis agora</button>
      </section>
      <footer className="ru-footer">
        <div className="ru-brand" aria-label="RotinUp">
          <img src="/icon.png" alt="" />
          <span>rotin<strong>up</strong></span>
        </div>
        <p>Rotinas mais claras, conquistas compartilhadas.</p>
        <button type="button" onClick={() => setShowTerms(true)}>Termos de Uso e Política de Privacidade</button>
      </footer>
      {showTerms && createPortal(<TermsModal onClose={() => setShowTerms(false)} />, document.body)}
    </div>
  );
};

const FlowHeader = ({ onBack, backLabel = "Voltar" }) => (
  <header className="ru-flow-header">
    <div className="ru-flow-header__side">
      {onBack && <button type="button" className="ru-icon-button" onClick={onBack} aria-label={backLabel}>←</button>}
    </div>
    <div className="ru-flow-brand" aria-label="RotinUp">
      <img src="/icon.png" alt="" />
      <span>rotin<strong>up</strong></span>
    </div>
    <div className="ru-flow-header__side" aria-hidden="true" />
  </header>
);

// ─── Terms & Privacy Modal ────────────────────────────────
const TermsModal = ({ onClose }) => {
  const dialogRef = useModalDialog(onClose);
  return (
  <div className="ru-legal-overlay" onClick={onClose}>
    <div ref={dialogRef} className="ru-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="ru-legal-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
      <header className="ru-legal__header">
        <div>
          <p>Documento legal</p>
          <h2 id="ru-legal-title">Termos de Uso e Privacidade</h2>
        </div>
        <button type="button" className="ru-icon-button" onClick={onClose} aria-label="Fechar Termos">×</button>
      </header>

      <div className="ru-legal__content">
        <div className="ru-legal__version">Versão {TERMS_VERSION} · Atualizada em {TERMS_LAST_UPDATED_LABEL}</div>

      {[
        { title: "1. Sobre o RotinUp", body: "O RotinUp é um aplicativo de gamificação de rotinas infantis desenvolvido por JV Digital (CNPJ em processo de abertura). Ao usar o app, você concorda com estes Termos de Uso e Política de Privacidade, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD) e o Estatuto da Criança e do Adolescente (Lei 8.069/1990 — ECA)." },
        { title: "2. Uso do Serviço e Responsabilidade Parental", body: "O RotinUp destina-se exclusivamente a responsáveis legais (pais, tutores ou guardiões) que criam e gerenciam as contas de seus filhos menores de 18 anos.\n\nAo se cadastrar, o responsável declara:\n• Ter 18 anos ou mais;\n• Ser o responsável legal pelas crianças cadastradas;\n• Autorizar expressamente o uso do app pelo menor sob sua supervisão;\n• Monitorar e supervisionar o uso do app pela criança.\n\nCrianças não criam contas próprias — o acesso é sempre configurado e controlado pelo responsável. É proibido usar o serviço para fins ilegais ou compartilhar credenciais." },
        { title: "3. Planos e Pagamento", body: "O plano gratuito permite 1 filho e acesso às funcionalidades básicas. O plano Premium é cobrado mensalmente ou anualmente, conforme a oferta escolhida antes da compra, via Hotmart. A renovação e o cancelamento seguem as condições apresentadas no checkout. Valores sujeitos a alteração com aviso prévio de 30 dias." },
        { title: "4. Dados coletados (LGPD — Lei 13.709/18)", body: "Coletamos: e-mail e nome do responsável; nome, idade e avatar dos filhos cadastrados; registros de missões, recompensas e tropeços; dados de uso e autenticação.\n\nNão coletamos fotos, localização, documentos de identificação ou qualquer dado sensível de crianças." },
        { title: "5. Finalidade do tratamento", body: "Os dados são usados exclusivamente para: operar as funcionalidades do app; personalizar a experiência; processar pagamentos (via Hotmart); enviar notificações do serviço.\n\nBase legal: execução de contrato (Art. 7º, V — LGPD) e legítimo interesse do responsável no desenvolvimento do filho (Art. 7º, IX — LGPD)." },
        { title: "6. Compartilhamento de dados", body: "Seus dados podem ser processados por:\n• Supabase (banco de dados e autenticação — EUA)\n• Hotmart (processamento de pagamentos — Brasil)\n• Google (autenticação OAuth opcional — EUA)\n• Google Gemini (IA — EUA): ao usar os recursos de inteligência artificial (sugestões de missões, mensagens de incentivo do \"Capitão Rotina\" e relatórios), são enviados o nome, a idade, o nível e o progresso de tarefas da criança para gerar o conteúdo. NÃO são enviados e-mail, dados de contato, documentos, localização nem dados sensíveis. Esse processamento ocorre apenas quando um recurso de IA é acionado.\n\nNão vendemos, alugamos ou compartilhamos dados com terceiros para fins publicitários." },
        { title: "7. Proteção de dados de menores (LGPD Art. 14)", body: "Em conformidade com o Art. 14 da LGPD, o tratamento de dados pessoais de crianças e adolescentes:\n\n• É realizado exclusivamente com consentimento específico dado pelo responsável legal;\n• Limita-se ao mínimo necessário (nome, idade, avatar, progresso de tarefas);\n• Não é utilizado para fins comerciais, publicitários ou de perfilamento;\n• Pode ser revogado a qualquer momento pelo responsável, que pode excluir o perfil da criança diretamente pelo app.\n\nO responsável legal responde pelas informações cadastradas sobre o menor." },
        { title: "8. Limitação de responsabilidade", body: "O RotinUp é uma ferramenta de apoio à rotina familiar e não substitui orientação médica, psicológica ou pedagógica.\n\nA JV Digital não se responsabiliza por:\n• Decisões de criação ou conteúdo das missões definidas pelo responsável;\n• Consequências do uso inadequado por parte do responsável ou da criança;\n• Falhas de conectividade, interrupções do serviço ou perda de dados por motivos de força maior.\n\nO responsável assume integral responsabilidade pelo uso do app e pelo conteúdo configurado." },
        { title: "9. Retenção e exclusão", body: "Dados ficam armazenados enquanto a conta estiver ativa. Ao excluir a conta, os dados são removidos em até 30 dias. Para solicitar exclusão antecipada, envie e-mail para privacidade@jvdigital.com.br." },
        { title: "10. Direitos do titular (LGPD Arts. 17–22)", body: "Você tem direito a: acessar seus dados; corrigir informações incorretas; solicitar exclusão; revogar consentimento; receber seus dados em formato portável; opor-se ao tratamento.\n\nPara exercer seus direitos: privacidade@jvdigital.com.br\nPrazo de resposta: até 15 dias úteis." },
        { title: "11. Segurança", body: "Utilizamos criptografia em trânsito (HTTPS/TLS) e em repouso. Senhas nunca são armazenadas em texto puro. Em caso de incidente de segurança que possa ocasionar risco ou dano relevante aos titulares, notificaremos a ANPD e os usuários afetados quando exigido e dentro do prazo legal aplicável." },
        { title: "12. Alterações", body: "Podemos atualizar estes termos. Alterações relevantes serão comunicadas por e-mail ou notificação no app com antecedência mínima de 15 dias. O uso continuado após a vigência das alterações implica aceitação." },
        { title: "13. Foro e legislação aplicável", body: "Estes termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de Maringá/PR para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja." },
        { title: "14. Contato", body: "JV Digital\nE-mail: contato@jvdigital.com.br\nPrivacidade/LGPD: privacidade@jvdigital.com.br\nWhatsApp: (44) 99114-1555" },
      ].map((s, i) => (
        <section className="ru-legal__section" key={i}>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </section>
      ))}
      </div>
      <footer className="ru-legal__footer">
        <span>Última atualização: {TERMS_LAST_UPDATED_LABEL}</span>
        <button type="button" className="ru-flow-button ru-flow-button--primary" onClick={onClose}>Entendido</button>
      </footer>
    </div>
  </div>
  );
};

// Bloco de erro de carregamento (dashboards) — evita tela "vazia" silenciosa.
const LoadErrorBlock = ({
  onRetry,
  onSignOut,
  title = "Não foi possível carregar seus dados",
  message = "Verifique sua conexão e tente novamente.",
  tone = "dark",
}) => {
  const isLight = tone === "light";
  return (
    <section role="alert" style={{ padding: "48px 24px", textAlign: "center" }}>
      <div aria-hidden="true" style={{ fontSize: 44, marginBottom: 12 }}>📡</div>
      <div style={{ color: isLight ? "#17213E" : T.text, fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{title}</div>
      <div style={{ color: isLight ? "#59647B" : T.textMuted, fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{message}</div>
      <button type="button" onClick={onRetry} style={{ padding: "12px 24px", borderRadius: isLight ? 8 : 14, border: "none", background: isLight ? "#C84734" : `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>🔄 Tentar novamente</button>
      {onSignOut && <button type="button" onClick={onSignOut} style={{ display: "block", margin: "14px auto 0", padding: "10px 18px", borderRadius: isLight ? 8 : 12, border: isLight ? "1px solid #BAC5D4" : "1px solid rgba(255,255,255,0.12)", background: "transparent", color: isLight ? "#59647B" : T.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Sair e usar outra conta</button>}
    </section>
  );
};

// Tela de aceite de termos (responsável legal) — gate antes de onboarding/dashboard.
const ReportIssueModal = ({ onClose, theme = "dark" }) => {
  const dialogRef = useModalDialog(onClose);
  const [category, setCategory] = useState("unexpected_behavior");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (description.trim().length < 10) {
      setError("Conte um pouco mais sobre o que aconteceu.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await reportUserIssue({ category, description: description.trim() });
      setReference(result?.reference || "registrado");
    } catch {
      setError("Nao foi possivel enviar agora. Tente novamente em alguns instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="ru-parent-modal-scope ru-report-overlay" data-theme={theme} onClick={onClose}>
      <div ref={dialogRef} className="ru-report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-issue-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="ru-dialog-close" onClick={onClose} aria-label="Fechar">×</button>
        <h2 id="report-issue-title">Reportar um problema</h2>
        <p className="ru-report-dialog__intro">Descreva o que tentou fazer e o resultado. Não inclua senhas, documentos ou dados de pagamento.</p>

        {reference ? (
          <div className="ru-report-dialog__success" aria-live="polite">
            <strong>Problema registrado</strong>
            <p>Referência: <code>{reference}</code></p>
            <button type="button" className="ru-account-button ru-account-button--primary" onClick={onClose}>Concluir</button>
          </div>
        ) : (
          <form className="ru-report-form" onSubmit={submit} aria-busy={submitting}>
            <label htmlFor="issue-category">Tipo de problema</label>
            <select id="issue-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="unexpected_behavior">Algo funcionou errado</option>
              <option value="missing_data">Dados não apareceram</option>
              <option value="payment">Pagamento ou Premium</option>
              <option value="access">Acesso ou conta</option>
              <option value="suggestion">Sugestão de melhoria</option>
            </select>

            <label htmlFor="issue-description">O que aconteceu</label>
            <textarea id="issue-description" value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} maxLength={500} rows={5} placeholder="Ex.: toquei em concluir o cronômetro e a tela continuou carregando..." aria-describedby="issue-description-count" />
            <span id="issue-description-count" className="ru-report-form__count">{description.length}/500</span>
            {error && <div className="ru-report-form__error" role="alert">{error}</div>}
            <button type="submit" className="ru-account-button ru-account-button--primary" disabled={submitting || description.trim().length < 10}>{submitting ? "Enviando..." : "Enviar reporte"}</button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

const TermsGate = ({ onAccept, onSignOut }) => {
  const [agreed, setAgreed]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [err, setErr]         = useState("");
  const accept = async () => {
    if (!agreed) return;
    setSaving(true); setErr("");
    const { error } = await supabase.rpc("accept_terms", { p_terms_version: TERMS_VERSION });
    setSaving(false);
    if (error) { setErr("Não foi possível registrar o aceite. Tente novamente."); return; }
    onAccept();
  };
  return (
    <main className="ru-flow-page ru-consent-page">
      <FlowHeader />
      <div className="ru-consent-shell">
        <section className="ru-consent-intro" aria-labelledby="ru-consent-title">
          <span className="ru-flow-kicker">Consentimento versionado · LGPD</span>
          <div className="ru-consent-shield" aria-hidden="true">✓</div>
          <h1 id="ru-consent-title">Antes de começar</h1>
          <p>Precisamos confirmar que você é o responsável legal e entende como os dados da família serão usados.</p>
          <span className="ru-flow-version">Versão {TERMS_VERSION}</span>
        </section>

        <section className="ru-consent-panel" aria-label="Resumo do consentimento">
          <h2>Ao continuar, você declara que:</h2>
          <ul className="ru-consent-list">
            <li><span aria-hidden="true">✓</span><p>É o <strong>responsável legal</strong> pelas crianças cadastradas e supervisiona o uso do aplicativo.</p></li>
            <li><span aria-hidden="true">✓</span><p>Autoriza o tratamento de <strong>nome, idade, avatar e progresso</strong> para operar o RotinUp.</p></li>
            <li><span aria-hidden="true">✓</span><p>Está ciente de que recursos de <strong>IA do Google Gemini</strong> processam dados mínimos ao gerar conteúdo.</p></li>
            <li><span aria-hidden="true">✓</span><p>Entende que pagamentos Premium são processados pela <strong>Hotmart</strong>.</p></li>
            <li><span aria-hidden="true">✓</span><p>Pode <strong>revogar o consentimento e excluir os dados</strong> pelo aplicativo.</p></li>
          </ul>

          <button type="button" className="ru-flow-link" onClick={() => setShowFull(true)}>Ler Termos de Uso e Política de Privacidade completos</button>

          <div className="ru-check-row">
            <input id="terms-gate-consent" type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <label htmlFor="terms-gate-consent">Li e concordo com os Termos de Uso e a Política de Privacidade como responsável legal.</label>
          </div>

          {err && <div className="ru-form-alert" role="alert">{err}</div>}
          <div className="ru-consent-actions">
            <button type="button" className="ru-flow-button ru-flow-button--primary" onClick={accept} disabled={!agreed || saving}>{saving ? "Registrando..." : "Aceitar e continuar"}</button>
            <button type="button" className="ru-flow-button ru-flow-button--secondary" onClick={onSignOut}>Sair</button>
          </div>
        </section>
      </div>
      {showFull && createPortal(<TermsModal onClose={() => setShowFull(false)} />, document.body)}
    </main>
  );
};

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const AuthScreen = ({ initialMode = "login", onTermsAccepted, onBack }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [mode, setMode]           = useState(initialMode);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [notif, setNotif]       = useState(null);
  const [notifType, setNotifType] = useState("success");
  const [inlineErr, setInlineErr] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [mode]);

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3500); };

  const authErrPT = (msg = "") => {
    if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) return "Email ou senha incorretos";
    if (msg.includes("Email not confirmed"))       return "Confirme seu email antes de entrar";
    if (msg.includes("User already registered") || msg.includes("user_already_exists") || msg.includes("already registered")) return "Este email já está cadastrado";
    if (msg.includes("Password should be") || msg.includes("weak_password") || msg.includes("password"))  return "A senha deve ter pelo menos 6 caracteres";
    if (msg.includes("Unable to validate email") || msg.includes("invalid email")) return "Email inválido";
    if (msg.includes("rate limit") || msg.includes("too_many_requests")) return "Muitas tentativas. Aguarde alguns minutos";
    if (msg.includes("network") || msg.includes("fetch")) return "Erro de conexão. Verifique sua internet";
    if (msg.includes("sending confirmation email") || msg.includes("unexpected_failure")) return "Problema no envio do email de confirmação. Tente entrar com Google ou fale com o suporte.";
    return "Erro ao autenticar. Tente novamente";
  };

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleEmail = async (event) => {
    event?.preventDefault();
    setInlineErr("");
    if (mode === "forgot") {
      if (!email) { setInlineErr("Digite seu email"); return; }
      if (!isValidEmail(email)) { setInlineErr("Email inválido"); return; }
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "?reset=1",
      });
      setLoading(false);
      if (error) notify(authErrPT(error.message), "error");
      else { notify("✅ Email de recuperação enviado! Verifique sua caixa de entrada."); setTimeout(() => setMode("login"), 3000); }
      return;
    }
    if (mode !== "login" && !name) { setInlineErr("Digite seu nome"); return; }
    if (!email) { setInlineErr("Digite seu email"); return; }
    if (!isValidEmail(email)) { setInlineErr("Email inválido"); return; }
    if (!password) { setInlineErr("Digite sua senha"); return; }
    if (mode === "signup" && !agreedTerms) { setInlineErr("Você precisa aceitar os Termos para criar a conta"); return; }
    setLoading(true);
    setInlineErr("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: name, role: "parent" } }
        });
        if (error) throw error;
        if (data?.session) {
          // Confirmação de e-mail desligada: já entra direto (onAuthStateChange navega).
          // Registra o aceite dos termos (o checkbox foi marcado).
          const { error: termsError } = await supabase.rpc("accept_terms", { p_terms_version: TERMS_VERSION });
          if (termsError) {
            console.error("[Auth] Falha ao registrar aceite dos termos:", termsError);
            notify("Conta criada. Confirme os Termos na próxima tela.", "error");
          } else {
            await onTermsAccepted?.(data.session.user.id);
            notify("✅ Conta criada! Bem-vindo(a) ao RotinUp! 🎉");
          }
        } else {
          // Confirmação de e-mail ligada: precisa confirmar antes de entrar
          notify("✅ Conta criada! Confirme seu e-mail para entrar.");
          setTimeout(() => setMode("login"), 2500);
        }
      }
    } catch (err) {
      // Erro persistente (inline) + toast — o toast some em 3.5s e pode passar batido
      const msg = authErrPT(err?.message);
      setInlineErr(msg);
      notify(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) { notify(authErrPT(error.message), "error"); setLoading(false); }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setInlineErr("");
    setPassword("");
    if (nextMode !== "signup") setAgreedTerms(false);
  };

  return (
    <main className="ru-auth-page">
      <Notif msg={notif} type={notifType} />
      <aside className="ru-auth-visual" aria-hidden="true">
        <img src={heroFamilyImage} alt="" />
        <div className="ru-auth-visual__copy">
          <span>Rotina compartilhada</span>
          <p>Combine, acompanhe e reconheça cada pequena conquista.</p>
        </div>
      </aside>

      <section className="ru-auth-main">
        <FlowHeader onBack={onBack} backLabel="Voltar para a página inicial" />
        <div className="ru-auth-form-wrap">
          <header className="ru-auth-heading">
            <span className="ru-flow-kicker">Acesso do responsável</span>
            <h1>{mode === "login" ? "Entre na sua conta" : mode === "forgot" ? "Recupere sua senha" : "Crie sua conta"}</h1>
            <p>{mode === "login" ? "Continue de onde sua família parou." : mode === "forgot" ? "Enviaremos um link seguro para o email cadastrado." : "Comece gratuitamente e organize a rotina da família."}</p>
          </header>

      {mode === "signup" && (
        <div className="ru-auth-note">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Cadastro para responsáveis</strong>
            <p>Você adiciona as crianças pelo painel. Elas não criam conta nem precisam de email.</p>
          </div>
        </div>
      )}

          {mode === "forgot" ? (
            <form className="ru-auth-form" onSubmit={handleEmail} noValidate>
              <div className="ru-field">
                <label htmlFor="auth-recovery-email">Email</label>
                <input id="auth-recovery-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setInlineErr(""); }} placeholder="voce@exemplo.com" aria-describedby={inlineErr ? "auth-error" : undefined} />
              </div>
              {inlineErr && <div id="auth-error" className="ru-form-alert" role="alert">{inlineErr}</div>}
              <button className="ru-flow-button ru-flow-button--primary" type="submit" disabled={loading}>{loading ? "Enviando..." : "Enviar link de recuperação"}</button>
              <button className="ru-flow-link ru-flow-link--center" type="button" onClick={() => switchMode("login")}>Voltar ao login</button>
            </form>
          ) : (
            <form className="ru-auth-form" onSubmit={handleEmail} noValidate>
              {mode === "signup" && (
                <div className="ru-field">
                  <label htmlFor="auth-name">Seu nome</label>
                  <input id="auth-name" type="text" autoComplete="name" maxLength={80} value={name} onChange={e => { setName(e.target.value); setInlineErr(""); }} placeholder="Como podemos chamar você?" />
                </div>
              )}
              <div className="ru-field">
                <label htmlFor="auth-email">Email</label>
                <input id="auth-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setInlineErr(""); }} placeholder="voce@exemplo.com" aria-describedby={inlineErr ? "auth-error" : undefined} />
              </div>
              <div className="ru-field">
                <div className="ru-field__label-row">
                  <label htmlFor="auth-password">Senha</label>
                  {mode === "login" && <button className="ru-flow-link" type="button" onClick={() => switchMode("forgot")}>Esqueci a senha</button>}
                </div>
                <input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 6 : undefined} value={password} onChange={e => { setPassword(e.target.value); setInlineErr(""); }} placeholder={mode === "signup" ? "Mínimo de 6 caracteres" : "Sua senha"} aria-describedby={inlineErr ? "auth-error" : undefined} />
              </div>

              {mode === "signup" && (
                <div className="ru-check-row ru-check-row--signup">
                  <input id="signup-terms-consent" type="checkbox" checked={agreedTerms} onChange={e => { setAgreedTerms(e.target.checked); setInlineErr(""); }} />
                  <div>
                    <label htmlFor="signup-terms-consent">Sou o responsável legal e concordo com o tratamento de dados de menores, uso de IA e pagamento descritos nos termos.</label>
                    <button type="button" className="ru-flow-link" onClick={() => setShowTerms(true)}>Ler Termos de Uso e Política de Privacidade</button>
                  </div>
                </div>
              )}

              {inlineErr && <div id="auth-error" className="ru-form-alert" role="alert">{inlineErr}</div>}
              <button className="ru-flow-button ru-flow-button--primary" type="submit" disabled={loading || (mode === "signup" && !agreedTerms)}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
            </form>
          )}

          {mode !== "forgot" && <>
            <div className="ru-auth-divider"><span>ou continue com</span></div>
            <button type="button" className="ru-flow-button ru-flow-button--google" onClick={handleGoogle} disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com Google
            </button>

            <div className="ru-auth-switch">
              {mode === "login"
                ? <>Novo por aqui? <button type="button" className="ru-flow-link" onClick={() => switchMode("signup")}>Criar conta grátis</button></>
                : <>Já tem conta? <button type="button" className="ru-flow-link" onClick={() => switchMode("login")}>Fazer login</button></>
              }
            </div>
          </>}

          <footer className="ru-auth-footer">
            <button type="button" className="ru-flow-link" onClick={() => setShowTerms(true)}>Termos de Uso e Política de Privacidade</button>
          </footer>
        </div>
      </section>

      {showTerms && createPortal(<TermsModal onClose={() => setShowTerms(false)} />, document.body)}
    </main>
  );
};

// ═══════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════
const Onboarding = ({ onDone }) => {
  // step: "recovering" | "recover_error" | "choice" | "create" | "addchild" | "join"
  const [step, setStep]               = useState("recovering");
  const [familyName, setFamilyName]   = useState("");
  const [childName, setChildName]     = useState("");
  const [childBirth, setChildBirth]   = useState("");
  const [avatar, setAvatar]           = useState(avatarUrl("Luna"));
  const [joinCode, setJoinCode]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState("");
  const [recoverAttempt, setRecoverAttempt] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [step]);

  // Tenta reconectar família automaticamente ao entrar no onboarding
  useEffect(() => {
    const tryRecover = async () => {
      const { data, error } = await supabase.rpc("recover_family");
      if (error) {
        void reportAppError({ error, source: "onboarding", action: "recover_family", screen: "onboarding" });
        setErr("Não foi possível verificar sua família. Confira a conexão e tente novamente.");
        setStep("recover_error");
      } else if (data?.found) {
        onDone(); // reconectado — vai direto pro dashboard
      } else {
        setStep("choice");
      }
    };
    tryRecover();
  }, [onDone, recoverAttempt]);

  const onboardingError = (error, fallback) => {
    const message = error?.message || "";
    if (/nome muito curto/i.test(message)) return "Use um nome de família com pelo menos 2 caracteres.";
    if (/ja pertence|já pertence/i.test(message)) return "Sua conta já pertence a uma família.";
    if (/codigo.*(?:invalido|inválido|expirado)/i.test(message)) return "Código inválido ou expirado.";
    if (/limite/i.test(message)) return "Esta família atingiu o limite do plano atual.";
    if (/network|fetch/i.test(message)) return "Não foi possível conectar. Verifique sua internet e tente novamente.";
    return fallback;
  };

  const createFamily = async (event) => {
    event?.preventDefault();
    const normalizedName = familyName.trim();
    if (normalizedName.length < 2) return;
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("create_family", { p_family_name: normalizedName });
    setLoading(false);
    if (error) { setErr(onboardingError(error, "Não foi possível criar a família. Tente novamente.")); return; }
    setStep("addchild");
  };

  const addChild = async (event) => {
    event?.preventDefault();
    const normalizedChildName = childName.trim();
    if (!normalizedChildName || !childBirth) return;
    if (new Date(childBirth) >= new Date()) { setErr("Data de nascimento inválida."); return; }
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("add_child", {
      p_display_name: normalizedChildName,
      p_avatar_emoji: avatar,
      p_age: calcAge(childBirth),
      p_birth_date: childBirth || null,
    });
    if (error) { setLoading(false); setErr(onboardingError(error, "Não foi possível adicionar a criança. Tente novamente.")); return; }
    setLoading(false);
    onDone();
  };

  const joinFamily = async (event) => {
    event?.preventDefault();
    if (!joinCode.trim()) return;
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("join_family_by_code", { p_code: joinCode.trim() });
    setLoading(false);
    if (error) { setErr(onboardingError(error, "Não foi possível entrar na família. Confira o código.")); return; }
    onDone();
  };

  const totalSteps = step === "join" ? 1 : 2;
  const currentStep = step === "choice" ? 0 : step === "create" ? 0 : step === "join" ? 0 : 1;

  return (
    <main className="ru-flow-page ru-onboarding-page">
      <FlowHeader />
      <div className={`ru-onboarding-shell ru-onboarding-shell--${step}`}>

        {/* RECOVERING */}
        {step === "recovering" && (
          <section className="ru-recovering" role="status" aria-live="polite">
            <span className="ru-flow-spinner" aria-hidden="true" />
            <h1>Preparando sua conta</h1>
            <p>Estamos verificando se sua família já está configurada.</p>
          </section>
        )}

        {step === "recover_error" && (
          <section className="ru-recovering" role="alert">
            <div className="ru-recovering__error" aria-hidden="true">!</div>
            <h1>Não foi possível verificar sua conta</h1>
            <p>{err}</p>
            <button type="button" className="ru-flow-button ru-flow-button--primary" onClick={() => { setErr(""); setStep("recovering"); setRecoverAttempt(value => value + 1); }}>Tentar novamente</button>
          </section>
        )}

        {/* CHOICE */}
        {step === "choice" && (
          <section className="ru-onboarding-step" aria-labelledby="ru-onboarding-choice-title">
            <header className="ru-onboarding-heading">
              <span className="ru-flow-kicker">Primeira configuração</span>
              <h1 id="ru-onboarding-choice-title">Como você deseja começar?</h1>
              <p>Crie uma nova família ou use o convite enviado por outro responsável.</p>
            </header>
            <div className="ru-onboarding-choice-grid">
            <button type="button" className="ru-choice-button ru-choice-button--coral" onClick={() => setStep("create")}>
              <span className="ru-choice-button__icon" aria-hidden="true">⌂</span>
              <div>
                <strong>Criar minha família</strong>
                <p>Comece uma rotina nova e adicione as crianças.</p>
              </div>
            </button>
            <button type="button" className="ru-choice-button ru-choice-button--mint" onClick={() => setStep("join")}>
              <span className="ru-choice-button__icon" aria-hidden="true">↗</span>
              <div>
                <strong>Entrar com convite</strong>
                <p>Use o código compartilhado por outro responsável.</p>
              </div>
            </button>
            </div>
          </section>
        )}

        {/* CREATE FAMILY */}
        {step === "create" && (
          <section className="ru-onboarding-step ru-onboarding-step--form" aria-labelledby="ru-create-family-title">
            <header className="ru-onboarding-heading">
              <span className="ru-flow-kicker">Etapa 1 de 2</span>
              <h1 id="ru-create-family-title">Crie sua família</h1>
              <p>Escolha um nome fácil de reconhecer. Você poderá alterá-lo depois.</p>
            </header>
            <form className="ru-onboarding-form" onSubmit={createFamily} noValidate>
              <div className="ru-field">
                <label htmlFor="family-name">Nome da família</label>
                <input id="family-name" type="text" autoComplete="organization" maxLength={60} value={familyName} onChange={e => { setFamilyName(e.target.value); setErr(""); }} placeholder="Ex.: Família Silva" aria-describedby={err ? "onboarding-error" : "family-name-hint"} autoFocus />
                <span id="family-name-hint" className="ru-field__hint">Use pelo menos 2 caracteres.</span>
              </div>
              {err && <div id="onboarding-error" className="ru-form-alert" role="alert">{err}</div>}
              <button className="ru-flow-button ru-flow-button--primary" type="submit" disabled={loading || familyName.trim().length < 2}>{loading ? "Criando..." : "Continuar"}</button>
              <button className="ru-flow-link ru-flow-link--center" type="button" onClick={() => { setStep("choice"); setErr(""); }}>Voltar</button>
            </form>
          </section>
        )}

        {/* ADD CHILD */}
        {step === "addchild" && (
          <section className="ru-onboarding-step ru-onboarding-step--child" aria-labelledby="ru-add-child-title">
            <header className="ru-onboarding-heading">
              <span className="ru-flow-kicker">Etapa 2 de 2</span>
              <h1 id="ru-add-child-title">Adicione a primeira criança</h1>
              <p>Esses dados personalizam missões, níveis e sugestões para a faixa etária.</p>
            </header>
            <form className="ru-onboarding-form ru-onboarding-form--child" onSubmit={addChild} noValidate>
              <div className="ru-avatar-preview">
                <AvatarImg value={avatar} size={72} radius={18} />
                <div><strong>Escolha um avatar</strong><span>Ele poderá ser trocado no perfil.</span></div>
              </div>
              <div className="ru-avatar-picker"><DiceBearPicker value={avatar} onChange={setAvatar} tone="light" /></div>
              <div className="ru-onboarding-field-grid">
                <div className="ru-field">
                  <label htmlFor="child-name">Nome da criança</label>
                  <input id="child-name" type="text" autoComplete="off" maxLength={80} value={childName} onChange={e => { setChildName(e.target.value); setErr(""); }} placeholder="Nome ou apelido" />
                </div>
                <div className="ru-field">
                  <label htmlFor="child-birth">Data de nascimento</label>
                  <input id="child-birth" type="date" value={childBirth} onChange={e => { setChildBirth(e.target.value); setErr(""); }} max={localDateStr(1)} />
                  {childBirth && <span className="ru-field__hint">Idade calculada: {calcAge(childBirth)} anos</span>}
                </div>
              </div>
              {err && <div id="onboarding-error" className="ru-form-alert" role="alert">{err}</div>}
              <button className="ru-flow-button ru-flow-button--primary" type="submit" disabled={loading || !childName.trim() || !childBirth}>{loading ? "Salvando..." : "Salvar e abrir o painel"}</button>
              <button className="ru-flow-link ru-flow-link--center" type="button" onClick={onDone}>Pular por agora</button>
            </form>
          </section>
        )}

        {/* JOIN WITH CODE */}
        {step === "join" && (
          <section className="ru-onboarding-step ru-onboarding-step--form" aria-labelledby="ru-join-family-title">
            <header className="ru-onboarding-heading">
              <span className="ru-flow-kicker">Convite de responsável</span>
              <h1 id="ru-join-family-title">Entre em uma família</h1>
              <p>Digite o código compartilhado pelo responsável que já administra a família.</p>
            </header>
            <form className="ru-onboarding-form" onSubmit={joinFamily} noValidate>
              <div className="ru-field">
                <label htmlFor="family-invite-code">Código de convite</label>
                <input id="family-invite-code" className="ru-code-input" type="text" inputMode="text" autoComplete="off" value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); setErr(""); }} placeholder="ABC123" maxLength={8} aria-describedby={err ? "onboarding-error" : "invite-code-hint"} autoFocus />
                <span id="invite-code-hint" className="ru-field__hint">Use apenas letras e números.</span>
              </div>
              {err && <div id="onboarding-error" className="ru-form-alert" role="alert">{err}</div>}
              <button className="ru-flow-button ru-flow-button--primary" type="submit" disabled={loading || joinCode.length < 4}>{loading ? "Verificando..." : "Entrar na família"}</button>
              <button className="ru-flow-link ru-flow-link--center" type="button" onClick={() => { setStep("choice"); setErr(""); }}>Voltar</button>
            </form>
          </section>
        )}

      {step !== "choice" && step !== "recovering" && (
        <nav className="ru-onboarding-progress" aria-label="Progresso da configuração">
          {Array.from({length: totalSteps}).map((_, i) => (
            <span key={i} className={i === currentStep ? "is-current" : ""}><span className="sr-only">Etapa {i + 1}{i === currentStep ? " atual" : ""}</span></span>
          ))}
        </nav>
      )}
      </div>
    </main>
  );
};

// ═══════════════════════════════════════════════════════════
// CHILD DASHBOARD
// ═══════════════════════════════════════════════════════════
// Contagem regressiva ao vivo (recompensa de tempo). Tica a cada segundo.
function Countdown({ endsAt, tone = "dark" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(endsAt).getTime() - now;
  const over = ms <= 0;
  const tot = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(tot / 3600);
  const mm = Math.floor((tot % 3600) / 60);
  const ss = tot % 60;
  const p2 = (n) => String(n).padStart(2, "0");
  const low = ms > 0 && ms <= 5 * 60000;
  return (
    <span className={`ru-countdown ru-countdown--${tone}`} data-status={over ? "over" : low ? "low" : "active"}>
      {over ? "⏱️ acabou" : (hh > 0 ? `${hh}:${p2(mm)}:${p2(ss)}` : `${p2(mm)}:${p2(ss)}`)}
    </span>
  );
}

// Anel circular de progresso de XP (em volta do avatar na home da criança).
function XPRing({ size = 76, stroke = 5, pct = 0, color = "#fff", trackColor = "rgba(255,255,255,0.12)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

// Controle do cronômetro de recompensa: ▶️ Iniciar/Retomar · ⏸️ Pausar · contagem ao vivo
function TimerControl({ t, onStart, onPause, onFinish, busy, tone = "dark" }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmationNow, setConfirmationNow] = useState(() => Date.now());
  const pad = (n) => String(n).padStart(2, "0");
  const running = t.timer_state === "running";
  const remaining = Math.max(0, running ? (new Date(t.timer_ends_at).getTime() - confirmationNow) / 1000 : (t.timer_remaining_seconds ?? (t.duration_minutes || 0) * 60));
  const fmt = (secs) => { secs = Math.max(0, Math.floor(secs)); const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
  const doneBtn = (
    <button type="button" className="ru-timer-button ru-timer-button--done" onClick={() => { setConfirmationNow(Date.now()); setConfirming(true); }} disabled={busy} title="Concluir agora" aria-label={`Concluir cronômetro de ${t.reward_title || "recompensa"}`}>✓</button>
  );

  if (confirming) {
    return (
      <div className={`ru-timer-control ru-timer-control--${tone} ru-timer-control--confirming`}>
        <span className="ru-timer-confirmation">Faltam {fmt(remaining)}. Concluir?</span>
        <button type="button" className="ru-timer-button ru-timer-button--confirm" onClick={() => { setConfirming(false); onFinish(t.id); }} disabled={busy}>Sim</button>
        <button type="button" className="ru-timer-button ru-timer-button--cancel" onClick={() => setConfirming(false)}>Não</button>
      </div>
    );
  }

  if (running) {
    return (
      <div className={`ru-timer-control ru-timer-control--${tone}`}>
        <Countdown endsAt={t.timer_ends_at} tone={tone} />
        <button type="button" className="ru-timer-button ru-timer-button--pause" onClick={() => onPause(t.id)} disabled={busy} title="Pausar" aria-label={`Pausar cronômetro de ${t.reward_title || "recompensa"}`}>⏸️</button>
        {doneBtn}
      </div>
    );
  }

  const paused = t.timer_state === "paused";
  const hh = Math.floor(remaining / 3600), mm = Math.floor((remaining % 3600) / 60), ss = Math.floor(remaining % 60);
  const idleLabel = hh > 0 ? `⏱️ ${hh}h${mm > 0 ? ` ${mm}min` : ""}` : `⏱️ ${mm} min`;
  const pausedLabel = hh > 0 ? `⏸️ ${hh}:${pad(mm)}:${pad(ss)}` : `⏸️ ${pad(mm)}:${pad(ss)}`;
  return (
    <div className={`ru-timer-control ru-timer-control--${tone}`}>
      <span className="ru-timer-status" data-status={paused ? "paused" : "idle"}>
        {paused ? pausedLabel : idleLabel}
      </span>
      <button type="button" className="ru-timer-button ru-timer-button--start" onClick={() => onStart(t.id)} disabled={busy}>▶️ {paused ? "Retomar" : "Iniciar"}</button>
      {doneBtn}
    </div>
  );
}

const ChildDash = ({ profile, onSignOut, onRefresh }) => {
  const [tab, setTab]         = useState("home");
  const [missions, setMissions] = useState([]);
  const [rewards, setRewards]   = useState([]);
  const [achievements, setAch]  = useState([]);
  const [logs, setLogs]         = useState([]);
  const [notif, setNotif]       = useState(null);
  const [notifType, setNotifType] = useState("success");
  const [loading, setLoading]   = useState(true);
  const [surpriseMission, setSurpriseMission] = useState(null);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseError, setSurpriseError] = useState(null);
  const [surpriseSubmitting, setSurpriseSubmitting] = useState(false);
  const [surpriseSubmitted, setSurpriseSubmitted] = useState(false);
  const [celebration, setCelebration] = useState(null); // { msg, coins, xp }
  // Profile editing
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatar_emoji || avatarUrl("Luna"));
  const [editingAvatar, setEditingAvatar] = useState(false);
  const avatarDialogRef = useModalDialog(() => setEditingAvatar(false), editingAvatar);
  const [siblings, setSiblings] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [demeritLogs, setDemeritLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [streakDays, setStreakDays] = useState([]); // last 7 days active?
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(null); // mission id being submitted
  const [quantities, setQuantities] = useState({});   // { [rewardId]: number }
  const [familyPlan, setFamilyPlan] = useState("free");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pendingReds, setPendingReds] = useState([]);
  const [activeTimers, setActiveTimers] = useState([]);
  const [timerBusy, setTimerBusy] = useState(null);
  const [cancellingRed, setCancellingRed] = useState(null);

  // ── Fase 2B: missões de duração (▶️ Iniciar). Cronômetro local por criança.
  // runs = { [missionId]: endsAtMs }. Persistido em localStorage p/ sobreviver a
  // recarregar a página. Ao zerar, a missão é enviada sozinha p/ aprovação.
  const runsKey = `rotinup_mruns_${profile.id}`;
  const loadRuns = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(runsKey) || "{}");
      const t = Date.now();
      const clean = {};
      // mantém em andamento, ou recém-terminado (até 5min) p/ auto-enviar ao reabrir
      for (const [mid, endsAt] of Object.entries(raw)) {
        if (typeof endsAt === "number" && endsAt > t - 5 * 60000) clean[mid] = endsAt;
      }
      return clean;
    } catch { return {}; }
  };
  const [runs, setRuns] = useState(loadRuns);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const firedRef = useRef(new Set());
  const persistRuns = (next) => {
    setRuns(next);
    try { localStorage.setItem(runsKey, JSON.stringify(next)); } catch {
      // Timers still work in memory when storage is unavailable.
    }
  };
  const startRun = (m) => {
    const mins = m.duration_minutes || 0;
    if (mins <= 0) return;
    firedRef.current.delete(m.id);
    // Wall-clock access happens only after a user action, never during render.
    // eslint-disable-next-line react-hooks/purity
    persistRuns({ ...runs, [m.id]: Date.now() + mins * 60000 });
    // eslint-disable-next-line react-hooks/purity
    setNowTick(Date.now());
  };
  const cancelRun = (mid) => {
    firedRef.current.delete(mid);
    const next = { ...runs }; delete next[mid]; persistRuns(next);
  };
  // tica de 1s só quando há cronômetro de missão rodando
  useEffect(() => {
    if (Object.keys(runs).length === 0) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runs]);
  const qty    = (rid) => quantities[rid] || 1;
  const setQty = (rid, delta, max) =>
    setQuantities(prev => ({ ...prev, [rid]: Math.min(max, Math.max(1, (prev[rid] || 1) + delta)) }));

  const lvl  = getLvl(profile.xp || 0);
  const next = getNext(profile.xp || 0);
  const xpIn  = (profile.xp || 0) - lvl.xpNeeded;
  const xpFor = next.xpNeeded - lvl.xpNeeded;

  // Atualização otimista de coins — não depende do onRefresh() terminar
  const [localCoins, setLocalCoins] = useState(profile.kidcoins || 0);
  // Sincroniza o saldo confirmado depois que a atualização otimista retorna do servidor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocalCoins(profile.kidcoins || 0); }, [profile.kidcoins]);

  // ─── Capitão Rotina: saudação + incentivo na home (IA bounded, via única) ───
  const [companion, setCompanion] = useState(null);
  const companionTriedRef = useRef(false);

  const buildCompanionContext = () => {
    const cutoff = { daily: 0, weekly: 6, biweekly: 13, monthly: 29 };
    const isDone = (m) => {
      const c = localDateStr(cutoff[m.frequency] ?? 0);
      return logs.some(l => l.mission_id === m.id && l.due_date >= c && l.status !== "rejected");
    };
    const pend = missions.filter(m => !isDone(m));
    const aspir = rewards.filter(r => (r.coin_cost || 0) > localCoins)
      .sort((a, b) => (a.coin_cost || 0) - (b.coin_cost || 0))[0];
    const avg = missions.length
      ? Math.max(1, Math.round(missions.reduce((s, m) => s + (m.coins_reward || 0), 0) / missions.length)) : 20;
    const gap = aspir ? (aspir.coin_cost || 0) - localCoins : 0;
    return {
      childName: profile.display_name, age: profile.age,
      level: lvl.level, levelName: lvl.name, streak: profile.streak || 0,
      missionsLeftToday: pend.length, nextMissionTitle: pend[0]?.title || "",
      goalRewardTitle: aspir?.title || "", goalRewardGap: gap,
      goalRewardMissions: aspir ? Math.max(1, Math.ceil(gap / avg)) : 0,
    };
  };

  const companionFallback = (c) => {
    if (c.missionsLeftToday === 0) return `Mandou bem, ${c.childName}! Tudo em dia hoje 🌟`;
    let m = `Oi, ${c.childName}! `;
    if (c.streak > 0) m += `Sua sequência está em ${c.streak} dia${c.streak > 1 ? "s" : ""} 🔥 `;
    m += c.missionsLeftToday === 1 ? "Falta 1 missão hoje" : `Faltam ${c.missionsLeftToday} missões hoje`;
    m += c.nextMissionTitle ? ` — que tal "${c.nextMissionTitle}"? 🚀` : "! 🚀";
    return m;
  };

  const loadCompanion = async () => {
    const key = `companion-${profile.id}-${localDateStr(0)}`;
    const cached = localStorage.getItem(key);
    if (cached) { setCompanion(cached); return; }
    if (companionTriedRef.current) return;          // 1 tentativa por sessão (evita spam no Gemini)
    companionTriedRef.current = true;
    const ctx = buildCompanionContext();
    setCompanion(companionFallback(ctx));            // mostra já, sem travar a tela
    try {
      const msg = await callAI("companion", ctx);
      if (msg && msg.trim()) {
        const finalMsg = msg.trim();
        setCompanion(finalMsg);
        localStorage.setItem(key, finalMsg);          // cacheia o sucesso só por hoje
      }
    } catch {
      // mantém o fallback templado; tenta a IA de novo na próxima abertura
    }
  };

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => loadCompanion(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Streak efetivo: 0 se last_active_date não for hoje nem ontem (BUG-16)
  const effectiveStreak = (() => {
    const lad = profile.last_active_date;
    if (!lad) return profile.streak || 0;
    return (lad === localDateStr(0) || lad === localDateStr(1)) ? (profile.streak || 0) : 0;
  })();

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };

  const deleteChildAccount = async () => {
    setDeletingAccount(true);
    // Edge function: apaga dados do app + remove do Auth (LGPD)
    const { data, error } = await supabase.functions.invoke("delete-account");
    if (error || data?.error) {
      const failure = await readFunctionFailure(data, error, "Erro ao excluir conta");
      captureActionError(new Error(failure), "child_account", "delete", "child_profile");
      setDeletingAccount(false);
      return notify(failure, "error");
    }
    await supabase.auth.signOut();
    setDeletingAccount(false);
    onSignOut();
  };

  const missionsRef = useRef([]);
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);
    try {
      const last7  = Array.from({length: 7},  (_, i) => localDateStr(i));
      const last30 = Array.from({length: 30}, (_, i) => localDateStr(i));
      const results = await Promise.all([
        supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active", true),
        supabase.from("rewards").select("*").eq("family_id", profile.family_id).eq("is_active", true),
        supabase.from("achievements").select("*").order("condition_val"),
        supabase.from("mission_logs").select("*").eq("child_id", profile.id).in("due_date", last30).in("status", ["pending","approved"]),
        supabase.from("mission_logs").select("due_date").eq("child_id", profile.id).eq("status", "approved").in("due_date", last7),
        supabase.rpc("get_family_plan"),
        supabase.from("redemption_logs").select("id,reward_title,reward_emoji,coin_cost,created_at,status").eq("child_id", profile.id).in("status", ["requested","approved"]).order("created_at", { ascending: false }),
        supabase.from("redemption_logs").select("id,reward_title,reward_emoji,duration_minutes,timer_state,timer_ends_at,timer_remaining_seconds").eq("child_id", profile.id).eq("status","delivered").in("timer_state",["idle","running","paused"]).order("created_at", { ascending: false }),
      ]);
      const failedQuery = results.find((result) => result.error)?.error;
      if (failedQuery) throw failedQuery;
      const [{ data: m }, { data: r }, { data: a }, { data: l }, { data: sd }, { data: planData }, { data: pr }, { data: td }] = results;
      if (myId !== loadIdRef.current) return; // load mais recente já está em andamento
      setFamilyPlan(planData || "free");
      missionsRef.current = m || [];
      setMissions(m || []); setRewards(r || []); setLogs(l || []); setPendingReds(pr || []); setActiveTimers(td || []);
      const activeDaysSet = new Set((sd || []).map(x => x.due_date));
      setStreakDays(last7.reverse().map(d => activeDaysSet.has(d)));
      if (a) {
        const { data: earned, error: earnedError } = await supabase.from("child_achievements").select("achievement_id").eq("child_id", profile.id);
        if (earnedError) throw earnedError;
        const earnedSet = new Set((earned || []).map(e => e.achievement_id));
        setAch(a.map(ach => ({ ...ach, earned: earnedSet.has(ach.id) })));
      }
      setLoadError(null);
    } catch (error) {
      void reportAppError({ error, source: "child_dashboard", action: "load", screen: "child" });
      if (myId === loadIdRef.current) setLoadError("Não foi possível carregar seus dados. Tente novamente.");
    } finally {
      if (myId === loadIdRef.current) setLoading(false);
    }
  }, [profile.family_id, profile.id]);

  const loadProfileExtras = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const results = await Promise.all([
        supabase.from("profiles")
          .select("id,display_name,avatar_emoji,xp,kidcoins,streak")
          .eq("family_id", profile.family_id)
          .eq("role", "child")
          .order("xp", { ascending: false }),
        supabase.from("mission_logs")
          .select("id,coins_earned,due_date,mission_id,missions(title,emoji,coins_reward)")
          .eq("child_id", profile.id)
          .eq("status", "approved")
          .order("due_date", { ascending: false })
          .limit(20),
        supabase.from("demerit_logs")
          .select("id,title,emoji,coins_deducted,created_at")
          .eq("child_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const failedQuery = results.find((result) => result.error)?.error;
      if (failedQuery) throw failedQuery;
      const [{ data: sibs }, { data: hist }, { data: dem }] = results;
      setSiblings(sibs || []);
      setHistoryLogs(hist || []);
      setDemeritLogs(dem || []);
    } catch (error) {
      void reportAppError({ error, source: "child_profile", action: "load_extras", screen: "child_profile" });
      // silent — profile extras are optional
    } finally {
      setHistoryLoading(false);
    }
  }, [profile.family_id, profile.id]);

  const startTimer = async (id) => {
    setTimerBusy(id);
    const { error } = await supabase.rpc("start_reward_timer", { p_log_id: id });
    setTimerBusy(null);
    if (error) { captureActionError(error, "reward_timer", "start", "child"); return notify(error.message || "Erro no cronômetro", "error"); }
    load();
  };

  const pauseTimer = async (id) => {
    setTimerBusy(id);
    const { error } = await supabase.rpc("pause_reward_timer", { p_log_id: id });
    setTimerBusy(null);
    if (error) { captureActionError(error, "reward_timer", "pause", "child"); return notify(error.message || "Erro no cronômetro", "error"); }
    load();
  };

  const finishTimer = async (id) => {
    setTimerBusy(id);
    const { error } = await supabase.rpc("finish_reward_timer", { p_log_id: id });
    setTimerBusy(null);
    if (error) { captureActionError(error, "reward_timer", "finish", "child"); return notify(error.message || "Erro ao concluir", "error"); }
    notify("✅ Recompensa concluída!");
    load();
  };

  useEffect(() => {
    // Initial remote load is intentional synchronization with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const channel = supabase
      .channel(`approved-${profile.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "mission_logs",
        filter: `child_id=eq.${profile.id}`,
      }, async (payload) => {
        if (payload.new.status === "approved") {
          load();
          await onRefresh?.();
          let mission = missionsRef.current.find(m => m.id === payload.new.mission_id);
          if (!mission) {
            const { data } = await supabase.from("missions").select("*").eq("id", payload.new.mission_id).single();
            if (data) mission = data;
          }
          const coinsEarned = mission?.coins_reward || 0;
          const xpGained = mission?.xp_reward || 0;
          const oldLevel = getLvl(profile.xp || 0);
          const newLevel = getLvl((profile.xp || 0) + xpGained);
          const levelUp = newLevel.level > oldLevel.level ? newLevel : null;
          try {
            const msg = await callAI("motivational", {
              childName: profile.display_name,
              age: profile.age,
              level: newLevel.level,
              missionName: mission?.title || "essa missão",
              coins: coinsEarned,
              xp: xpGained,
            });
            setCelebration({ msg, coins: coinsEarned, xp: xpGained, levelUp });
          } catch {
            const fallbacks = [
              `Incrível, ${profile.display_name}! Você completou mais uma missão! Continue assim, campeão! 🚀`,
              "Uhuuul! Missão concluída! Você está arrasando! Cada missão te deixa mais forte! 💪⭐",
              "Que aventureiro incrível! Missão cumprida com sucesso! O Capitão Rotina está orgulhoso! 🎖️",
            ];
            const msg = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            setCelebration({ msg, coins: coinsEarned, xp: xpGained, levelUp });
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, onRefresh, profile.age, profile.display_name, profile.id, profile.xp]);

  useEffect(() => {
    if (tab !== "profile") return;
    // Profile history is fetched only when its tab becomes visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfileExtras();
  }, [loadProfileExtras, tab]);

  const saveAvatar = async (emoji) => {
    setAvatarEmoji(emoji);
    setEditingAvatar(false);
    await supabase.from("profiles").update({ avatar_emoji: emoji }).eq("id", profile.id);
    if (onRefresh) onRefresh();
  };

  const generateSurpriseMission = async () => {
    if (familyPlan === "free") {
      setSurpriseError("Missão Surpresa é exclusiva do plano Premium! 👑 Peça ao responsável para fazer upgrade.");
      return;
    }
    setSurpriseLoading(true);
    setSurpriseError(null);
    try {
      const raw = await callAI("surprise_mission", {
        childName: profile.display_name,
        age: profile.age,
        level: getLvl(profile.xp || 0).level,
        levelName: getLvl(profile.xp || 0).name,
        xp: profile.xp || 0,
      });
      setSurpriseMission(JSON.parse(raw));
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("premium_required")) { setShowUpgrade(true); setSurpriseLoading(false); return; }
      const isQuota = msg.includes("quota") || msg.includes("429");
      const isOverload = msg.includes("503") || msg.includes("overload") || msg.includes("UNAVAILABLE");
      setSurpriseError(isQuota ? "IA em pausa ⏳ Tente mais tarde" : isOverload ? "IA sobrecarregada 🤖 Tente em instantes" : "Não consegui gerar 😅 Tente novamente!");
    }
    setSurpriseLoading(false);
  };

  const submitSurpriseMission = async () => {
    if (!surpriseMission) return;
    setSurpriseSubmitting(true);
    const { error } = await supabase.rpc("submit_surprise_mission", {
      p_title:       surpriseMission.title,
      p_emoji:       surpriseMission.emoji,
      p_coins:       surpriseMission.coins_reward,
      p_xp:          surpriseMission.xp_reward,
      p_description: surpriseMission.description,
      p_due_date:    localDateStr(0),
    });
    setSurpriseSubmitting(false);
    if (error) { notify("Erro ao enviar missão surpresa: " + error.message, "error"); return; }
    setSurpriseSubmitted(true);
    setSurpriseMission(null);
    notify("✅ Missão surpresa enviada para aprovação!");
  };

  const getLog = (mid, frequency = "daily") => {
    const cutoffDays = { daily: 0, weekly: 6, biweekly: 13, monthly: 29 }[frequency] ?? 0;
    const cutoffStr = localDateStr(cutoffDays);
    return logs.find(l => l.mission_id === mid && l.due_date >= cutoffStr);
  };

  const countLogsInPeriod = (mid, frequency = "daily") => {
    const cutoffDays = { daily: 0, weekly: 6, biweekly: 13, monthly: 29 }[frequency] ?? 0;
    const cutoffStr = localDateStr(cutoffDays);
    return logs.filter(l => l.mission_id === mid && l.due_date >= cutoffStr && l.status !== "rejected").length;
  }

  async function submit(mid) {
    setSubmitting(mid);
    const { error } = await supabase.rpc("submit_mission", { p_mission_id: mid, p_due_date: localDateStr(0) });
    setSubmitting(null);
    if (error) return notify("Erro ao enviar missão", "error");
    notify("✅ Missão enviada para aprovação!"); load();
    const mission = missions.find(m => m.id === mid);
    void invokePushNotification(
      { family_id: profile.family_id, title: "Nova missão para aprovar! 📋", body: `${mission?.emoji || "✅"} ${mission?.title || "Missão"} foi enviada por ${profile.display_name}` },
      "push_notification",
      "child_missions",
    );
  }

  useEffect(() => {
    const expired = Object.entries(runs).filter(([mid, endsAt]) => endsAt <= Date.now() && !firedRef.current.has(mid));
    if (expired.length === 0) return;
    const nextRuns = { ...runs };
    expired.forEach(([missionId]) => {
      firedRef.current.add(missionId);
      delete nextRuns[missionId];
      submit(missionId);
    });
    try { localStorage.setItem(runsKey, JSON.stringify(nextRuns)); } catch {
      // Timers still work in memory when storage is unavailable.
    }
    setRuns(nextRuns);
    // The interval tick is the trigger; including transient handlers would restart this check every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  const redeem = async (rid, cost) => {
    const n     = qty(rid);
    const total = cost * n;
    if (localCoins < total) return notify("KidCoins insuficientes! 😢", "error");
    setLocalCoins(prev => prev - total); // otimista
    const { error } = await supabase.rpc("request_redemption_bulk", { p_reward_id: rid, p_quantity: n });
    if (error) {
      captureActionError(error, "redemption", "request", "child_store");
      setLocalCoins(profile.kidcoins || 0); // rollback
      return notify(error.message || "Erro ao resgatar", "error");
    }
    setQuantities(prev => ({ ...prev, [rid]: 1 }));
    notify(`🎁 ${n > 1 ? `${n}x ` : ""}Recompensa solicitada! Aguarde a entrega.`);
    load();
    if (onRefresh) onRefresh();
  };

  const cancelChildRedemption = async (redId, cost) => {
    setCancellingRed(redId);
    setLocalCoins(prev => prev + cost); // otimista
    const { error } = await supabase.rpc("cancel_redemption", { p_log_id: redId });
    setCancellingRed(null);
    if (error) {
      captureActionError(error, "redemption", "cancel", "child_store");
      setLocalCoins(profile.kidcoins || 0); // rollback
      return notify(error.message || "Erro ao cancelar", "error");
    }
    notify("🔄 Pedido cancelado. Coins devolvidos!"); load();
  };

  const navTabs = [{ key:"home",icon:"🏠",label:"Início"},{key:"store",icon:"🏪",label:"Loja"},{key:"achievements",icon:"🏆",label:"Conquistas"},{key:"profile",icon:"👤",label:"Perfil"}];

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column" }}>
      <Notif msg={notif} type={notifType} />
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {/* Modal de celebração IA */}
      {celebration && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
          {/* Coins caindo */}
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ position: "absolute", top: "-10%", left: `${10 + i * 11}%`, fontSize: 24, animation: `coinFloat ${1.2 + i * 0.18}s ease-in ${i * 0.12}s infinite`, pointerEvents: "none", zIndex: 9901 }}>🪙</div>
          ))}
          <div style={{ background: `linear-gradient(135deg, ${T.purple}EE, ${T.pink}EE)`, borderRadius: 32, padding: "36px 28px", maxWidth: 360, width: "100%", textAlign: "center", border: "2px solid rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", position: "relative", zIndex: 9902 }}>
            <div style={{ fontSize: 80, marginBottom: 16, animation: "bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}>🎉</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 12 }}>Missão Aprovada!</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "10px 18px" }}>
                <div style={{ color: T.secondary, fontWeight: 900, fontSize: 20 }}>🪙 +{celebration.coins}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>KidCoins</div>
              </div>
              {celebration.xp > 0 && (
                <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "10px 18px" }}>
                  <div style={{ color: T.accent, fontWeight: 900, fontSize: 20 }}>⚡ +{celebration.xp}</div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>XP</div>
                </div>
              )}
            </div>
            {/* Level Up section */}
            {celebration.levelUp && (
              <div style={{ background: `linear-gradient(135deg, ${celebration.levelUp.color}44, ${celebration.levelUp.color}22)`, borderRadius: 20, padding: "16px 20px", marginBottom: 20, border: `2px solid ${celebration.levelUp.color}88`, animation: "levelUpPop 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
                <div style={{ fontSize: 40, marginBottom: 6 }}>{celebration.levelUp.emoji}</div>
                <div style={{ color: celebration.levelUp.color, fontWeight: 900, fontSize: 18, letterSpacing: 0.5 }}>LEVEL UP!</div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, marginTop: 4 }}>Agora você é {celebration.levelUp.name}!</div>
              </div>
            )}
            <div style={{ color: "rgba(255,255,255,0.95)", fontSize: 16, fontWeight: 700, marginBottom: 28, lineHeight: 1.6 }}>{celebration.msg}</div>
            <button onClick={() => setCelebration(null)} style={{ width: "100%", padding: "15px", borderRadius: 18, border: "none", background: "rgba(255,255,255,0.22)", color: "#fff", fontWeight: 900, fontSize: 17, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Uhuuul! 🚀</button>
          </div>
        </div>
      )}

      {/* Header com saudação personalizada */}
      <div style={{ padding: "16px 20px 0" }}>
        {/* Hero: avatar com anel de XP + nível + chips (🔥 streak · 🪙 coins · ⚡ XP) */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: `linear-gradient(135deg, ${T.card}, ${T.cardLight})`, borderRadius: 22, padding: "14px 16px", border: `1px solid ${lvl.color}33`, marginBottom: 4 }}>
          <XPRing size={76} stroke={5} pct={xpFor ? xpIn / xpFor : 0} color={lvl.color}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AvatarImg value={profile.avatar_emoji} size={60} radius={30} />
            </div>
          </XPRing>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.textMuted, fontSize: 11 }}>{getSaudacao()},</div>
            <div style={{ color: T.text, fontSize: 18, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.display_name} {lvl.emoji}</div>
            <div style={{ color: lvl.color, fontWeight: 900, fontSize: 11, letterSpacing: 0.5, marginTop: 1 }}>NÍVEL {lvl.level} · {lvl.name}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, background: `${T.warning}1A`, borderRadius: 9, padding: "3px 9px", fontSize: 12, fontWeight: 900, color: T.warning }}>🔥 {effectiveStreak}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, background: `${T.secondary}1A`, borderRadius: 9, padding: "3px 9px", fontSize: 12, fontWeight: 900, color: T.secondary }}>🪙 {localCoins}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, background: `${lvl.color}1A`, borderRadius: 9, padding: "3px 9px", fontSize: 12, fontWeight: 900, color: lvl.color }}>⚡ {xpIn}/{xpFor}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 90px" }}>
        {loading ? <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Carregando... ⏳</div> : loadError ? <LoadErrorBlock onRetry={load} /> : <>

          {/* HOME */}
          {tab === "home" && (
            <div>
              {/* Capitão Rotina — saudação + incentivo do dia */}
              {companion && (
                <div style={{ background: `linear-gradient(135deg, ${T.blue}22, ${T.purple}1A)`, borderRadius: 20, padding: "14px 16px", marginBottom: 16, border: `1px solid ${T.blue}33`, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 32, flexShrink: 0 }}>🚀</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.blue, fontWeight: 900, fontSize: 11, letterSpacing: 0.5, marginBottom: 3 }}>CAPITÃO ROTINA</div>
                    <div style={{ color: T.text, fontSize: 14, lineHeight: 1.45, fontWeight: 600 }}>{companion}</div>
                  </div>
                </div>
              )}

              {/* HOJE — progresso das missões do dia */}
              {missions.length > 0 && (() => {
                const doneToday = missions.filter(m => getLog(m.id, m.frequency)?.status === "approved").length;
                const total = missions.length;
                const pct = total ? doneToday / total : 0;
                const allDone = doneToday === total;
                return (
                  <div style={{ background: `linear-gradient(135deg, ${T.accent}1A, ${T.blue}10)`, borderRadius: 18, padding: "16px 18px", marginBottom: 16, border: `1px solid ${allDone ? T.accent + "66" : T.accent + "22"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ color: T.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>🎯 MISSÕES DE HOJE</span>
                      <span style={{ color: allDone ? T.accent : T.text, fontSize: 15, fontWeight: 900 }}>{doneToday}/{total} {allDone ? "✅" : ""}</span>
                    </div>
                    <div style={{ height: 12, borderRadius: 7, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct * 100}%`, borderRadius: 7, background: `linear-gradient(90deg, ${T.accent}, ${T.blue})`, transition: "width 0.5s ease", boxShadow: pct > 0 ? `0 0 10px ${T.accent}66` : "none" }} />
                    </div>
                  </div>
                );
              })()}

              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🎯 Missões</div>
              {missions.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>Nenhuma missão ainda!</div>
                : missions.map((m, mi) => {
                    const log = getLog(m.id, m.frequency);
                    const done = log?.status === "approved";
                    const pend = log?.status === "pending";
                    const timesInPeriod = countLogsInPeriod(m.id, m.frequency);
                    return (
                      <div key={m.id} style={{ background: done ? `${T.accent}11` : pend ? `${T.secondary}11` : T.card, borderRadius: 18, padding: 16, marginBottom: 12, border: `1px solid ${done ? T.accent+"44" : pend ? T.secondary+"44" : "rgba(255,255,255,0.06)"}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 18, fontSize: 28, background: done ? `${T.accent}22` : iconGrad(mi), border: `1px solid ${done ? T.accent+"44" : iconBorder(mi)}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: done ? "none" : `0 4px 12px rgba(0,0,0,0.2)` }}>{done ? "✅" : m.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: done ? T.textMuted : T.text, fontWeight: 700, fontSize: 15, textDecoration: done ? "line-through" : "none" }}>{m.title}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, color: T.secondary }}>🪙 {m.coins_reward}</span>
                              <span style={{ fontSize: 11, color: T.accent }}>+{m.xp_reward} XP</span>
                              {m.frequency && m.frequency !== "daily" && <span style={{ fontSize: 10, color: T.purple, background: `${T.purple}22`, borderRadius: 6, padding: "1px 6px", fontWeight: 800 }}>{freqLabel(m.frequency)}</span>}
                              {m.duration_minutes > 0 && <span style={{ fontSize: 10, color: T.blue, background: `${T.blue}22`, borderRadius: 6, padding: "1px 6px", fontWeight: 800 }}>⏱️ {m.duration_minutes}min</span>}
                              {timesInPeriod > 1 && <span style={{ fontSize: 10, color: T.warning, background: `${T.warning}22`, borderRadius: 6, padding: "1px 6px", fontWeight: 800 }}>🔁 {timesInPeriod}ª vez</span>}
                            </div>
                          </div>
                          {(() => {
                            if (pend) return <span style={{ fontSize: 11, color: T.secondary, fontWeight: 700, flexShrink: 0 }}>⏳ Aguardando</span>;
                            const endsAt = runs[m.id];
                            if (endsAt) {
                              const rem = endsAt - nowTick;
                              if (rem > 0) {
                                const mm = Math.floor(rem / 60000), ss = Math.floor((rem % 60000) / 1000);
                                const low = rem <= 60000;
                                return (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                    <span style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums", fontSize: 15, color: low ? T.warning : T.accent }}>⏱️ {String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}</span>
                                    <button onClick={() => cancelRun(m.id)} title="Cancelar" style={{ padding: "5px 9px", borderRadius: 10, border: `1px solid ${T.pink}55`, background: `${T.pink}15`, color: T.pink, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✕</button>
                                  </div>
                                );
                              }
                              return <span style={{ fontSize: 11, color: T.secondary, fontWeight: 700, flexShrink: 0 }}>enviando…</span>;
                            }
                            if (m.duration_minutes > 0) return <button onClick={() => startRun(m)} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.blue})`, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>▶️ {done ? "De novo" : "Iniciar"}</button>;
                            if (!done) return <button onClick={() => submit(m.id)} disabled={submitting === m.id} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 12, cursor: submitting === m.id ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>{submitting === m.id ? "..." : "Feito!"}</button>;
                            return <button onClick={() => submit(m.id)} disabled={submitting === m.id} style={{ padding: "7px 12px", borderRadius: 12, border: `1px solid ${T.warning}55`, background: `${T.warning}15`, color: T.warning, fontWeight: 800, fontSize: 11, cursor: submitting === m.id ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>{submitting === m.id ? "..." : "🔁 Fiz de novo!"}</button>;
                          })()}
                        </div>
                      </div>
                    );
                  })
              }
              {/* Badge "Missões Concluídas" */}
              {missions.length > 0 && missions.every(m => getLog(m.id, m.frequency)?.status === "approved") && (
                <div style={{ background: `linear-gradient(135deg, ${T.accent}22, ${T.blue}22)`, borderRadius: 20, padding: "18px 20px", textAlign: "center", border: `2px solid ${T.accent}55`, animation: "bounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1)", marginBottom: 16 }}>
                  <div style={{ fontSize: 44, marginBottom: 8 }}>🌟</div>
                  <div style={{ color: T.accent, fontWeight: 900, fontSize: 17, marginBottom: 4 }}>Missões do Dia Concluídas!</div>
                  <div style={{ color: T.textMuted, fontSize: 13 }}>Você é incrível! Continue assim amanhã 🚀</div>
                </div>
              )}

              {/* Progresso semanal — gráfico de barras + streak */}
              {streakDays.length === 7 && (() => {
                const DAY_LABELS = ["D","S","T","Q","Q","S","S"];
                const days = Array.from({length: 7}, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() - (6 - i));
                  return localDateStr(6 - i);
                });
                const approvedLogs = logs.filter(l => l.status === "approved");
                const perDay = days.map((date, i) => {
                  const d = new Date(date + "T12:00:00");
                  const count = approvedLogs.filter(l => l.due_date === date).length;
                  const xpDay = approvedLogs.filter(l => l.due_date === date)
                    .reduce((s, l) => s + (missions.find(m => m.id === l.mission_id)?.xp_reward || 0), 0);
                  return { date, label: DAY_LABELS[d.getDay()], count, xpDay, active: streakDays[i], isToday: i === 6 };
                });
                const maxCount = Math.max(...perDay.map(d => d.count), 1);
                const totalWeek = perDay.reduce((s, d) => s + d.count, 0);
                const totalXP   = perDay.reduce((s, d) => s + d.xpDay, 0);
                return (
                  <div style={{ background: T.card, borderRadius: 20, padding: "16px 16px 12px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>ESTA SEMANA</div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontSize: 11, color: T.accent, fontWeight: 800 }}>✅ {totalWeek} missões</span>
                        <span style={{ fontSize: 11, color: T.purple, fontWeight: 800 }}>⭐ {totalXP} XP</span>
                      </div>
                    </div>
                    {/* Barras */}
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 64, marginBottom: 6 }}>
                      {perDay.map((d, i) => {
                        const pct = d.count / maxCount;
                        const color = d.isToday ? T.primary : d.active ? T.accent : "rgba(255,255,255,0.12)";
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                            {d.count > 0 && <div style={{ fontSize: 9, color: d.isToday ? T.primary : T.textMuted, fontWeight: 800 }}>{d.count}</div>}
                            <div style={{ width: "100%", height: `${Math.max(pct * 52, d.count > 0 ? 10 : 4)}px`, borderRadius: 6, background: d.count > 0 ? `linear-gradient(180deg, ${color}, ${color}99)` : "rgba(255,255,255,0.06)", transition: "height 0.4s", boxShadow: d.isToday && d.count > 0 ? `0 0 8px ${T.primary}66` : "none" }} />
                          </div>
                        );
                      })}
                    </div>
                    {/* Labels + streak */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {perDay.map((d, i) => (
                        <div key={i} style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: d.isToday ? T.primary : T.textMuted, fontWeight: d.isToday ? 800 : 600 }}>{d.label}</div>
                          <div style={{ fontSize: 13, marginTop: 2 }}>{d.active ? "🔥" : "⚪"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Missão Surpresa IA */}
              <div style={{ background: `linear-gradient(135deg, ${T.purple}, ${T.pink})`, borderRadius: 22, padding: 20, marginBottom: 20, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -16, top: -16, fontSize: 72, opacity: 0.12, pointerEvents: "none" }}>🎲</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>🎲 Missão Surpresa</div>
                    <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 }}>Gerada por IA só pra você!</div>
                  </div>
                  {familyPlan === "free" ? (
                    <div style={{ padding: "8px 14px", borderRadius: 14, border: "2px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🔒</span>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 900, fontSize: 12 }}>Premium</div>
                        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>peça upgrade 👑</div>
                      </div>
                    </div>
                  ) : !surpriseMission ? (
                    <button onClick={generateSurpriseMission} disabled={surpriseLoading} style={{ padding: "10px 16px", borderRadius: 14, border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: surpriseLoading ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif" }}>
                      {surpriseLoading ? "✨ Gerando..." : "✨ Gerar"}
                    </button>
                  ) : (
                    <button onClick={() => { setSurpriseMission(null); setSurpriseError(null); }} style={{ padding: "8px 14px", borderRadius: 12, border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Nova 🔄</button>
                  )}
                </div>
                {surpriseError && (
                  <div style={{ marginTop: 12, background: "rgba(0,0,0,0.22)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>😅</span>
                    <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700 }}>{surpriseError}</span>
                  </div>
                )}
                {surpriseMission && (
                  <div style={{ marginTop: 14, background: "rgba(0,0,0,0.22)", borderRadius: 16, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ fontSize: 34, marginTop: 2 }}>{surpriseMission.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{surpriseMission.title}</div>
                        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{surpriseMission.description}</div>
                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                          <span style={{ fontSize: 12, color: T.secondary, fontWeight: 700 }}>🪙 {surpriseMission.coins_reward}</span>
                          <span style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>+{surpriseMission.xp_reward} XP</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>Bônus do dia!</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={submitSurpriseMission}
                      disabled={surpriseSubmitting}
                      style={{ width: "100%", marginTop: 12, padding: "11px", borderRadius: 12, border: "none", background: surpriseSubmitting ? "rgba(255,255,255,0.1)" : `linear-gradient(135deg, ${T.purple}, #7B2FBE)`, color: surpriseSubmitting ? T.textMuted : "#fff", fontWeight: 800, fontSize: 13, cursor: surpriseSubmitting ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif" }}
                    >
                      {surpriseSubmitting ? "Enviando..." : "🚀 Enviar para aprovação"}
                    </button>
                  </div>
                )}
                {surpriseSubmitted && !surpriseMission && (
                  <div style={{ marginTop: 14, background: `${T.accent}18`, borderRadius: 16, padding: "12px 16px", border: `1px solid ${T.accent}33`, textAlign: "center" }}>
                    <div style={{ color: T.accent, fontWeight: 800, fontSize: 13 }}>✅ Missão enviada! Aguardando aprovação do responsável.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STORE */}
          {tab === "store" && (
            <div>
              {/* Saldo — card destaque */}
              <div style={{ background: `linear-gradient(135deg, ${T.secondary}, ${T.primary})`, borderRadius: 22, padding: "18px 20px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -8, top: -10, fontSize: 78, opacity: 0.18, pointerEvents: "none" }}>🪙</div>
                <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>🏪 LOJA · SEU SALDO</div>
                <div style={{ color: "#1A1200", fontWeight: 900, fontSize: 32, marginTop: 2 }}>🪙 {localCoins}</div>
                <div style={{ color: "rgba(0,0,0,0.6)", fontWeight: 700, fontSize: 12, marginTop: 2 }}>KidCoins pra trocar por recompensas!</div>
              </div>

              {/* Cronômetros em andamento — recompensas de tempo entregues */}
              {activeTimers.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 14, marginBottom: 10 }}>⏱️ Em andamento</div>
                  {activeTimers.map(t => (
                    <div key={t.id} style={{ background: `linear-gradient(135deg, ${T.accent}14, ${T.blue}0C)`, borderRadius: 16, padding: "14px 16px", marginBottom: 8, border: `1px solid ${T.accent}33`, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 30, flexShrink: 0 }}>{t.reward_emoji || "🎮"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.reward_title}</div>
                        <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>aproveite o seu tempo!</div>
                      </div>
                      <TimerControl t={t} onStart={startTimer} onPause={pauseTimer} onFinish={finishTimer} busy={timerBusy === t.id} />
                    </div>
                  ))}
                </div>
              )}

              {/* Resgates pendentes do filho — BUG-13 */}
              {pendingReds.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🎁 Meus resgates</div>
                  {pendingReds.map(r => (
                    <div key={r.id} style={{ background: `${T.secondary}0D`, borderRadius: 16, padding: "12px 14px", marginBottom: 8, border: `1px solid ${T.secondary}22`, display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>{r.reward_emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{r.reward_title}</div>
                        <div style={{ color: r.status === "approved" ? T.accent : T.secondary, fontSize: 11, fontWeight: 700 }}>
                          🪙 {r.coin_cost} · {r.status === "approved" ? "✅ aprovado, aguardando entrega" : "⏳ aguardando aprovação"}
                        </div>
                      </div>
                      <button
                        onClick={() => cancelChildRedemption(r.id, r.coin_cost)}
                        disabled={cancellingRed === r.id}
                        style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${T.pink}55`, background: `${T.pink}15`, color: T.pink, fontWeight: 800, fontSize: 11, cursor: cancellingRed === r.id ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                        {cancellingRed === r.id ? "..." : "Cancelar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {rewards.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>Nenhuma recompensa ainda!</div>
                : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {rewards.map((r, ri) => {
                      const q        = qty(r.id);
                      const total    = r.coin_cost * q;
                      const maxQty   = Math.max(1, Math.floor(localCoins / r.coin_cost));
                      const can      = localCoins >= r.coin_cost;
                      const canMore  = localCoins >= r.coin_cost * (q + 1);
                      return (
                        <div key={r.id} style={{ background: T.card, borderRadius: 20, padding: 16, textAlign: "center", border: `1px solid ${can ? T.accent+"44" : "rgba(255,255,255,0.06)"}`, opacity: can ? 1 : 0.6 }}>
                          <div style={{ width: 64, height: 64, borderRadius: 20, background: iconGrad(ri + 2), border: `1px solid ${iconBorder(ri + 2)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, margin: "0 auto 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}>{r.emoji}</div>
                          <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{r.title}</div>
                          <div style={{ color: T.secondary, fontWeight: 900, fontSize: 13, marginBottom: 10 }}>
                            🪙 {r.coin_cost}{q > 1 ? <span style={{ color: T.textMuted, fontSize: 11 }}> × {q} = <span style={{ color: T.secondary }}>{total}</span></span> : ""}
                          </div>
                          {/* Stepper de quantidade */}
                          {can && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
                              <button onClick={() => setQty(r.id, -1, maxQty)} disabled={q <= 1}
                                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: q <= 1 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)", color: q <= 1 ? T.textMuted : T.text, fontSize: 16, fontWeight: 900, cursor: q <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif" }}>−</button>
                              <span style={{ color: T.text, fontWeight: 900, fontSize: 16, minWidth: 20, textAlign: "center" }}>{q}</span>
                              <button onClick={() => setQty(r.id, +1, maxQty)} disabled={!canMore}
                                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: !canMore ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)", color: !canMore ? T.textMuted : T.text, fontSize: 16, fontWeight: 900, cursor: !canMore ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif" }}>+</button>
                            </div>
                          )}
                          <button onClick={() => redeem(r.id, r.coin_cost)} disabled={!can}
                            style={{ width: "100%", padding: "8px 0", borderRadius: 12, border: "none", background: can ? `linear-gradient(135deg, ${T.accent}, ${T.blue})` : "rgba(255,255,255,0.06)", color: can ? "#fff" : T.textMuted, fontWeight: 800, fontSize: 12, cursor: can ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif" }}>
                            {can ? `Resgatar${q > 1 ? ` (🪙 ${total})` : ""}` : "Sem saldo"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          )}

          {/* ACHIEVEMENTS */}
          {tab === "achievements" && (
            <div>
              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🏆 Conquistas</div>
              {/* Resumo — quantas desbloqueadas */}
              {achievements.length > 0 && (() => {
                const earned = achievements.filter(a => a.earned).length;
                const total = achievements.length;
                const pct = total ? earned / total : 0;
                return (
                  <div style={{ background: `linear-gradient(135deg, ${T.secondary}1A, ${T.primary}10)`, borderRadius: 18, padding: "16px 18px", marginBottom: 16, border: `1px solid ${T.secondary}33` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ color: T.secondary, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>✨ DESBLOQUEADAS</span>
                      <span style={{ color: T.text, fontSize: 15, fontWeight: 900 }}>{earned}/{total}</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct * 100}%`, borderRadius: 6, background: `linear-gradient(90deg, ${T.secondary}, ${T.primary})`, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })()}
              {achievements.map(a => {
                const isStreak = a.condition_key === "streak_days";
                const currentStreak = effectiveStreak;
                const streakPct = isStreak ? Math.min(1, currentStreak / a.condition_val) : 0;
                const accentColor = a.earned ? T.secondary : (isStreak ? T.primary : T.accent);
                return (
                  <div key={a.id} style={{ background: a.earned ? `${accentColor}11` : T.card, borderRadius: 18, padding: 16, marginBottom: 10, border: `1px solid ${a.earned ? accentColor+"44" : "rgba(255,255,255,0.06)"}`, display: "flex", alignItems: "center", gap: 16, opacity: a.earned ? 1 : 0.55 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 16, fontSize: 28, background: a.earned ? `${accentColor}22` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", filter: a.earned ? "none" : "grayscale(100%)", flexShrink: 0 }}>{a.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: a.earned ? T.text : T.textMuted, fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                      <div style={{ color: T.textMuted, fontSize: 12, marginTop: 3 }}>{a.description}</div>
                      {isStreak && !a.earned && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 3 }}>
                            <div style={{ height: "100%", width: `${streakPct * 100}%`, background: T.primary, borderRadius: 999, transition: "width 0.5s" }} />
                          </div>
                          <div style={{ fontSize: 10, color: T.textMuted }}>🔥 {currentStreak}/{a.condition_val} dias</div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                        {a.earned && <span style={{ background: `${T.secondary}22`, color: T.secondary, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>✨ Desbloqueado</span>}
                        {(a.bonus_coins > 0) && <span style={{ background: `${T.accent}18`, color: T.accent, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>+{a.bonus_coins}🪙 bônus</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PROFILE */}
          {tab === "profile" && (
            <div>
              {/* Avatar picker modal */}
              {editingAvatar && (
                <div onClick={() => setEditingAvatar(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div ref={avatarDialogRef} role="dialog" aria-modal="true" aria-label="Escolher avatar" tabIndex={-1} onClick={e => e.stopPropagation()} style={{ position: "relative", background: T.card, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 430 }}>
                    <button onClick={() => setEditingAvatar(false)} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.08)", color: T.textMuted, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
                    <div style={{ color: T.text, fontWeight: 900, fontSize: 17, textAlign: "center", marginBottom: 16 }}>✏️ Escolher avatar</div>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                      <AvatarImg value={avatarEmoji} size={64} radius={20} />
                    </div>
                    <DiceBearPicker value={avatarEmoji} onChange={saveAvatar} />
                    <button onClick={() => setEditingAvatar(false)} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif", marginTop: 14 }}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* Avatar + nome */}
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <button type="button" onClick={() => setEditingAvatar(true)} aria-label="Editar avatar" style={{ position: "relative", display: "inline-block", cursor: "pointer", marginBottom: 12, padding: 0, border: "none", background: "transparent" }}>
                  <XPRing size={116} stroke={6} pct={xpFor ? xpIn / xpFor : 0} color={lvl.color}>
                    <div style={{ width: 96, height: 96, borderRadius: "50%", background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      <AvatarImg value={avatarEmoji} size={96} radius={48} />
                    </div>
                  </XPRing>
                  <div style={{ position: "absolute", bottom: 2, right: 2, width: 28, height: 28, borderRadius: 10, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: `2px solid ${T.darker}`, zIndex: 1 }}>✏️</div>
                </button>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 22 }}>{profile.display_name}</div>
                <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>{profile.age ? `${profile.age} anos · ` : ""}{lvl.name} {lvl.emoji}</div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {[
                  { label:"KidCoins", value:localCoins, icon:"🪙", color:T.secondary },
                  { label:"XP Total", value:profile.xp||0, icon:"⚡", color:T.accent },
                  { label:"Nível", value:lvl.level, icon:lvl.emoji, color:lvl.color },
                  { label:"Streak", value:`${effectiveStreak}🔥`, icon:"", color:T.warning },
                ].map((s,i) => (
                  <div key={i} style={{ background: T.card, borderRadius: 14, padding: "12px 8px", border: `1px solid ${s.color}22`, textAlign: "center" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ color: s.color, fontWeight: 900, fontSize: 14 }}>{s.value}</div>
                    <div style={{ color: T.textMuted, fontSize: 9, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Ranking entre irmãos */}
              {siblings.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>🏆 Ranking da Família</div>
                  {siblings.map((s, i) => {
                    const isMe = s.id === profile.id;
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}º`;
                    return (
                      <div key={s.id} style={{ background: isMe ? `${T.primary}18` : T.card, borderRadius: 16, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, border: `1px solid ${isMe ? T.primary+"44" : "rgba(255,255,255,0.06)"}` }}>
                        <div style={{ fontSize: 20, width: 28, textAlign: "center" }}>{medal}</div>
                        <AvatarImg value={s.avatar_emoji} size={32} radius={10} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: isMe ? T.primary : T.text, fontWeight: isMe ? 800 : 600, fontSize: 14 }}>{s.display_name}{isMe ? " (você)" : ""}</div>
                          <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>⚡ {s.xp||0} XP · 🪙 {s.kidcoins||0}</div>
                        </div>
                        <div style={{ color: T.warning, fontWeight: 800, fontSize: 13 }}>{s.streak||0}🔥</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Histórico de missões */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>✅ Missões Concluídas</div>
                {historyLoading ? (
                  <div style={{ color: T.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>Carregando... ⏳</div>
                ) : historyLogs.length === 0 ? (
                  <div style={{ background: T.card, borderRadius: 16, padding: 20, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>Nenhuma missão concluída ainda!
                  </div>
                ) : historyLogs.map((log, i) => (
                  <div key={log.id || i} style={{ background: T.card, borderRadius: 14, padding: "11px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 22 }}>{log.missions?.emoji || "✅"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{log.missions?.title || "Missão"}</div>
                      <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{log.due_date}</div>
                    </div>
                    <div style={{ color: T.secondary, fontWeight: 800, fontSize: 13 }}>+🪙{log.coins_earned || log.missions?.coins_reward || 0}</div>
                  </div>
                ))}
              </div>

              {/* Histórico de deméritos */}
              {!historyLoading && demeritLogs.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: T.pink, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>⚠️ Tropeços Recebidos</div>
                  {demeritLogs.map((d, i) => (
                    <div key={d.id || i} style={{ background: `${T.pink}0D`, borderRadius: 14, padding: "11px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.pink}22` }}>
                      <div style={{ fontSize: 22 }}>{d.emoji || "⚠️"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: T.text, fontWeight: 600, fontSize: 13 }}>{d.title}</div>
                        <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{new Date(d.created_at).toLocaleDateString("pt-BR")}</div>
                      </div>
                      {d.coins_deducted > 0 && <div style={{ color: T.pink, fontWeight: 800, fontSize: 13 }}>-🪙{d.coins_deducted}</div>}
                    </div>
                  ))}
                </div>
              )}

              <NotifyToggle userId={profile.id} />
              <button onClick={onSignOut} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: T.textMuted, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Sair da conta</button>

              {/* Excluir conta — LGPD */}
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {!confirmDeleteAccount ? (
                  <button onClick={() => setConfirmDeleteAccount(true)} style={{ background: "none", border: "none", color: `${T.pink}99`, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, width: "100%", textAlign: "center" }}>
                    🗑️ Excluir minha conta
                  </button>
                ) : (
                  <div style={{ background: `${T.pink}12`, borderRadius: 16, padding: 16, border: `1px solid ${T.pink}33` }}>
                    <div style={{ color: T.pink, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>⚠️ Excluir conta</div>
                    <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>Seu perfil, histórico de missões e conquistas serão excluídos permanentemente.</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={deleteChildAccount} disabled={deletingAccount}
                        style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: T.pink, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                        {deletingAccount ? "Excluindo..." : "Sim, excluir"}
                      </button>
                      <button onClick={() => setConfirmDeleteAccount(false)}
                        style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: T.textMuted, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto", background: `${T.darker}EE`, backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", padding: "12px 0 24px" }}>
        {navTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
            <div style={{ fontSize: 22, filter: tab===t.key?"none":"grayscale(80%)", transform: tab===t.key?"scale(1.2)":"scale(1)", transition: "all 0.2s" }}>{t.icon}</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: tab===t.key?T.primary:T.textMuted }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Upgrade Modal ────────────────────────────────────────
const UpgradeModal = ({ onClose, userEmail, onClaim, theme = "dark" }) => {
  const dialogRef = useModalDialog(onClose);
  const [billing, setBilling] = useState("annual");
  const [claiming, setClaiming] = useState(false);
  const plan = PLANS[billing];
  const base = HOTMART_CHECKOUT_URLS[billing];
  // pré-preenche o e-mail da conta no checkout → o webhook casa a compra automaticamente
  const checkoutUrl = userEmail ? `${base}&email=${encodeURIComponent(userEmail)}` : base;
  const handleClaim = async () => {
    if (claiming || !onClaim) return;
    setClaiming(true);
    let activated;
    try {
      activated = await onClaim();
    } finally {
      setClaiming(false);
    }
    if (activated) onClose();
  };

  return (
    <div className="ru-parent-modal-scope ru-upgrade-overlay" data-theme={theme} onClick={onClose}>
      <div ref={dialogRef} className="ru-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="ru-upgrade-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <button type="button" className="ru-dialog-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="ru-upgrade-dialog__header">
          <span aria-hidden="true">👑</span>
          <div>
            <span className="ru-account-kicker">Plano para toda a família</span>
            <h2 id="ru-upgrade-title">RotinUp Premium</h2>
            <p>Mais espaço, automações e recursos para acompanhar cada criança.</p>
          </div>
        </div>

        <div className="ru-upgrade-billing" aria-label="Período de cobrança">
          {Object.entries(PLANS).map(([key, p]) => (
            <button type="button" key={key} onClick={() => setBilling(key)} aria-pressed={billing === key}>
              <span>{p.label}</span>
              <small>{p.badge}</small>
            </button>
          ))}
        </div>

        <section className="ru-upgrade-price" aria-label={`Plano ${plan.label}`}>
          <span className="ru-upgrade-price__badge">{billing === "annual" ? `Economize ${plan.savings}` : "Lançamento"}</span>
          <p>{billing === "annual" ? "Cobrança única anual" : "Cobrança mensal recorrente"}</p>
          <div className="ru-upgrade-price__value">
            <span>R$</span><strong>{plan.price}</strong><span>{plan.period}</span>
          </div>
          {billing === "annual" && plan.total && (
            <p className="ru-upgrade-price__detail">Equivale a R$ {plan.total}; acesso por 12 meses</p>
          )}
          {billing === "monthly" && (
            <p className="ru-upgrade-price__detail">Cancele quando quiser</p>
          )}
        </section>

        <div className="ru-upgrade-compare">
          <section>
            <h3>Grátis</h3>
            <ul>
            {FREE_FEATURES.map((item, i) => (
              <li key={i}><span aria-hidden="true">•</span>{item}</li>
            ))}
            </ul>
          </section>
          <section data-plan="premium">
            <h3>Premium <span aria-hidden="true">👑</span></h3>
            <ul>
            {PREMIUM_FEATURES.map((item, i) => (
              <li key={i}><span aria-hidden="true">✓</span>{item}</li>
            ))}
            </ul>
          </section>
        </div>

        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
          className="ru-upgrade-checkout" aria-label={`Assinar o plano ${plan.label} por R$ ${plan.price}${plan.period} na Hotmart`}>
          Assinar {plan.label} · R$ {plan.price}{plan.period}
        </a>
        {userEmail && (
          <p className="ru-upgrade-email">Use <strong>{userEmail}</strong> no pagamento para conciliar a assinatura automaticamente.</p>
        )}
        {onClaim && (
          <button type="button" className="ru-account-button ru-account-button--success" onClick={handleClaim} disabled={claiming} aria-busy={claiming}>
            {claiming ? "Verificando assinatura..." : "Já assinei · verificar agora"}
          </button>
        )}
        <button type="button" className="ru-account-button ru-account-button--quiet" onClick={onClose}>
          Continuar no plano gratuito
        </button>
      </div>
    </div>
  );
};

// ─── Mission Modal ────────────────────────────────────────
const MissionModal = ({ mission, emojiCategories, onSave, onDeactivate, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [title, setTitle]     = useState(mission.title || "");
  const [emoji, setEmoji]     = useState(mission.emoji || "⭐");
  const [coins, setCoins]     = useState(mission.coins_reward ?? 20);
  const [xp, setXp]           = useState(mission.xp_reward ?? 15);
  const [frequency, setFreq]  = useState(mission.frequency || "daily");
  const [duration, setDuration] = useState(mission.duration_minutes ?? 0);
  const [saving, setSaving]   = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [emojiCat, setEmojiCat] = useState(Object.keys(emojiCategories)[0]);

  const handleSave = async () => {
    if (!title.trim() || saving || deactivating) return;
    setSaving(true);
    const saved = await onSave({ title: title.trim(), emoji, coins_reward: coins, xp_reward: xp, frequency, duration_minutes: duration });
    if (saved === false) setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (saving || deactivating) return;
    setDeactivating(true);
    const deactivated = await onDeactivate();
    if (deactivated === false) setDeactivating(false);
  };

  return (
    <div className="ru-mission-dialog-backdrop" onClick={saving || deactivating ? undefined : onClose}>
      <div ref={dialogRef} className="ru-mission-dialog" role="dialog" aria-modal="true" aria-labelledby="ru-mission-dialog-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
        <header className="ru-mission-dialog__header">
          <div>
            <span className="ru-missions-kicker">Configuração</span>
            <h2 id="ru-mission-dialog-title">Editar missão</h2>
          </div>
          <button type="button" className="ru-mission-icon-button" onClick={onClose} disabled={saving || deactivating} aria-label="Fechar edição">✕</button>
        </header>

        <div className="ru-mission-dialog__categories" aria-label="Categorias de ícones">
          {Object.keys(emojiCategories).map(cat => (
            <button type="button" key={cat} onClick={() => setEmojiCat(cat)} aria-pressed={emojiCat === cat}>{cat}</button>
          ))}
        </div>
        <div className="ru-mission-dialog__emojis" role="group" aria-label="Escolha um ícone">
          {(emojiCategories[emojiCat] || []).map(e => (
            <button type="button" key={e} onClick={() => setEmoji(e)} aria-label={`Usar ${e}`} aria-pressed={emoji === e}>{e}</button>
          ))}
        </div>

        <div className="ru-mission-field">
          <label htmlFor="edit-mission-title">Nome da missão</label>
          <label className="ru-mission-title-input" htmlFor="edit-mission-title"><span aria-hidden="true">{emoji}</span><span className="sr-only">Nome da missão</span><input id="edit-mission-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={60} autoFocus /></label>
        </div>

        <fieldset className="ru-mission-frequency">
          <legend>Frequência</legend>
          <div>
            {FREQ_OPTS.map(o => (
              <button type="button" key={o.key} onClick={() => setFreq(o.key)} aria-pressed={frequency === o.key}>
                <span aria-hidden="true">{o.emoji}</span>{o.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="ru-mission-value-grid">
          <div className="ru-mission-field"><label htmlFor="edit-mission-coins">KidCoins</label><input id="edit-mission-coins" type="number" value={coins === 0 ? "" : coins} placeholder="0" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setCoins(event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0))} /></div>
          <div className="ru-mission-field"><label htmlFor="edit-mission-xp">XP</label><input id="edit-mission-xp" type="number" value={xp === 0 ? "" : xp} placeholder="0" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setXp(event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0))} /></div>
          <div className="ru-mission-field"><label htmlFor="edit-mission-duration">Duração (min)</label><input id="edit-mission-duration" type="number" value={duration === 0 ? "" : duration} placeholder="Sem timer" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setDuration(event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0))} /></div>
        </div>

        <div className="ru-mission-dialog__actions">
          <button type="button" className="ru-missions-button ru-missions-button--primary" onClick={handleSave} disabled={saving || deactivating || title.trim().length < 2} aria-busy={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
          <button type="button" className="ru-missions-button ru-missions-button--secondary" onClick={onClose} disabled={saving || deactivating}>Cancelar</button>
        </div>
        <button type="button" className="ru-mission-dialog__deactivate" data-confirming={confirm} onClick={handleDeactivate} disabled={saving || deactivating} aria-busy={deactivating}>
          {deactivating ? "Desativando..." : confirm ? "Confirmar desativação" : "Desativar missão"}
        </button>
      </div>
    </div>
  );
};

// ─── Reward Modal ─────────────────────────────────────────
const RewardModal = ({ reward, emojiCategories, onSave, onDeactivate, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [title, setTitle] = useState(reward.title || "");
  const [emoji, setEmoji] = useState(reward.emoji || "🎁");
  const [cost, setCost] = useState(reward.coin_cost ?? 50);
  const [duration, setDuration] = useState(reward.duration_minutes ?? 0);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [emojiCat, setEmojiCat] = useState(Object.keys(emojiCategories)[0]);

  const handleSave = async () => {
    if (saving || deactivating || title.trim().length < 2) return;
    setSaving(true);
    await onSave({ title: title.trim(), emoji, coin_cost: cost, duration_minutes: duration });
    setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (saving || deactivating) return;
    setDeactivating(true);
    const deactivated = await onDeactivate();
    if (deactivated === false) setConfirm(false);
    setDeactivating(false);
  };

  return (
    <div className="ru-reward-dialog-backdrop" onMouseDown={onClose}>
      <div ref={dialogRef} className="ru-reward-dialog" role="dialog" aria-modal="true" aria-labelledby="ru-reward-dialog-title" tabIndex={-1} onMouseDown={event => event.stopPropagation()}>
        <header className="ru-reward-dialog__header">
          <div><span className="ru-rewards-kicker">Configuração</span><h2 id="ru-reward-dialog-title">Editar recompensa</h2></div>
          <button type="button" className="ru-reward-icon-button" onClick={onClose} disabled={saving || deactivating} aria-label="Fechar edição">×</button>
        </header>
        <div className="ru-reward-dialog__categories" aria-label="Categorias de ícones">
          {Object.keys(emojiCategories).map(cat => (
            <button type="button" key={cat} onClick={() => setEmojiCat(cat)} aria-pressed={emojiCat === cat}>{cat}</button>
          ))}
        </div>
        <div className="ru-reward-dialog__emojis">
          {(emojiCategories[emojiCat] || []).map(option => (
            <button type="button" key={option} onClick={() => setEmoji(option)} aria-pressed={emoji === option} aria-label={`Usar ${option}`}>{option}</button>
          ))}
        </div>
        <label className="ru-reward-title-input" htmlFor="edit-reward-title"><span aria-hidden="true">{emoji}</span><span className="sr-only">Nome da recompensa</span><input id="edit-reward-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={60} autoFocus /></label>
        <div className="ru-reward-value-grid">
          <div className="ru-reward-field"><label htmlFor="edit-reward-cost">Custo em KidCoins</label><input id="edit-reward-cost" type="number" value={cost === 0 ? "" : cost} placeholder="0" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setCost(event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0))} /></div>
          <div className="ru-reward-field"><label htmlFor="edit-reward-duration">Duração (min)</label><input id="edit-reward-duration" type="number" value={duration === 0 ? "" : duration} placeholder="Sem timer" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setDuration(event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0))} /></div>
        </div>
        <div className="ru-reward-dialog__actions">
          <button type="button" className="ru-rewards-button ru-rewards-button--primary" onClick={handleSave} disabled={saving || deactivating || title.trim().length < 2} aria-busy={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
          <button type="button" className="ru-rewards-button ru-rewards-button--secondary" onClick={onClose} disabled={saving || deactivating}>Cancelar</button>
        </div>
        <button type="button" className="ru-reward-dialog__deactivate" data-confirming={confirm} onClick={handleDeactivate} disabled={saving || deactivating} aria-busy={deactivating}>
          {deactivating ? "Desativando..." : confirm ? "Confirmar desativação" : "Desativar recompensa"}
        </button>
      </div>
    </div>
  );
};

// coins_earned=0 no banco significa "não gravado" — trata como ausente
const nullif0 = v => (v === 0 || v === null || v === undefined) ? null : v;

// ─── Extrato Modal ────────────────────────────────────────
const ExtratoModal = ({ child, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [freshKidcoins, setFreshKidcoins] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [
        { data: profileData },
        { data: missions },
        { data: redemptions },
        { data: demerits },
        { data: streakBonuses },
      ] = await Promise.all([
        // B2: busca saldo atualizado diretamente do banco (não usa child.kidcoins stale)
        supabase.from("profiles").select("kidcoins").eq("id", child.id).single(),
        // B1: sem LIMIT — mostra todo o histórico
        supabase.from("mission_logs")
          .select("id,coins_earned,due_date,reviewed_at,missions(title,emoji,coins_reward,xp_reward)")
          .eq("child_id", child.id)
          .eq("status", "approved")
          .order("due_date", { ascending: false }),
        supabase.from("redemption_logs")
          .select("id,reward_title,reward_emoji,coin_cost,status,created_at")
          .eq("child_id", child.id)
          .order("created_at", { ascending: false }),
        supabase.from("demerit_logs")
          .select("id,title,emoji,coins_deducted,created_at")
          .eq("child_id", child.id)
          .order("created_at", { ascending: false }),
        supabase.from("streak_bonus_logs")
          .select("id,bonus_coins,streak_days,granted_at")
          .eq("child_id", child.id)
          .order("granted_at", { ascending: false }),
      ]);

      setFreshKidcoins(profileData?.kidcoins ?? child.kidcoins ?? 0);

      // B3: sortKey uniformizado — missões usam reviewed_at se disponível, senão due_date+'T23:59:59'
      const all = [
        ...(missions || []).map(m => {
          const coins = +(nullif0(m.coins_earned) ?? m.missions?.coins_reward ?? 0);
          const sortKey = m.reviewed_at || (m.due_date + "T23:59:59");
          return {
            id: m.id, type: "mission",
            emoji: m.missions?.emoji || "✅",
            label: m.missions?.title || "Missão",
            coins,
            date: m.due_date,
            sortKey,
          };
        }),
        ...(redemptions || []).map(r => ({
          id: r.id, type: "redemption",
          emoji: r.reward_emoji || "🎁",
          label: r.reward_title,
          coins: r.status === "cancelled" ? 0 : -(r.coin_cost || 0),
          rawCost: r.coin_cost || 0,
          date: r.created_at?.slice(0, 10),
          status: r.status,
          sortKey: r.created_at,
        })),
        ...(demerits || []).map(d => ({
          id: d.id, type: "demerit",
          emoji: d.emoji || "⚠️",
          label: d.title,
          coins: -(d.coins_deducted || 0),
          date: d.created_at?.slice(0, 10),
          sortKey: d.created_at,
        })),
        ...(streakBonuses || []).map(s => ({
          id: s.id, type: "streak",
          emoji: "🔥",
          label: `Bônus sequência ${s.streak_days} dias!`,
          coins: +(s.bonus_coins || 0),
          date: s.granted_at?.slice(0, 10),
          sortKey: s.granted_at,
        })),
      ].sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""));

      setItems(all);
      setLoading(false);
    };
    fetchData();
  }, [child.id, child.kidcoins]);

  const typeColor = { mission: T.accent, redemption: T.secondary, demerit: T.pink, streak: T.primary };
  const typeLabel = { mission: "Missão", redemption: "Resgate", demerit: "Tropeço", streak: "Sequência" };

  const saldoAtual = freshKidcoins !== null ? freshKidcoins : (child.kidcoins || 0);
  const totalGanhos = items.filter(i => i.coins > 0).reduce((s, i) => s + i.coins, 0);
  const totalGastos = items.filter(i => i.coins < 0).reduce((s, i) => s + i.coins, 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 9200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Extrato de ${child.display_name}`} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0 }}>
          <AvatarImg value={child.avatar_emoji} size={44} radius={14} />
          <div style={{ flex: 1 }}>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 17 }}>📋 Extrato de {child.display_name}</div>
            <div style={{ color: T.textMuted, fontSize: 12 }}>{items.length} movimentações · histórico completo</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Saldo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16, flexShrink: 0 }}>
          {[
            { label: "Ganhos", value: totalGanhos, color: T.accent, sign: "+" },
            { label: "Gastos", value: totalGastos, color: T.pink, sign: "" },
            { label: "Saldo atual", value: saldoAtual, color: T.secondary, sign: "" },
          ].map((s, i) => (
            <div key={i} style={{ background: T.darker, borderRadius: 14, padding: "10px 8px", textAlign: "center", border: `1px solid ${s.color}22` }}>
              <div style={{ color: s.color, fontWeight: 900, fontSize: 15 }}>{s.sign}{Math.abs(s.value)}</div>
              <div style={{ color: T.textMuted, fontSize: 10, marginTop: 2 }}>🪙 {s.label}</div>
            </div>
          ))}
        </div>

        {/* Lista */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Carregando... ⏳</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>Nenhuma movimentação ainda
            </div>
          ) : items.map((item, i) => {
            const positive = item.coins > 0;
            const cancelled = item.status === "cancelled";
            const color = typeColor[item.type];
            return (
              <div key={`${item.type}-${item.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{item.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: color, fontWeight: 800, background: `${color}18`, borderRadius: 6, padding: "1px 6px" }}>{typeLabel[item.type]}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{item.date}</span>
                    {item.type === "redemption" && item.status === "pending" && <span style={{ fontSize: 10, color: T.secondary, fontWeight: 700 }}>⏳ aguardando</span>}
                    {cancelled && <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700 }}>❌ cancelado</span>}
                  </div>
                </div>
                <div style={{ color: cancelled ? T.textMuted : positive ? T.accent : T.pink, fontWeight: 900, fontSize: 14, flexShrink: 0, textDecoration: cancelled ? "line-through" : "none", opacity: cancelled ? 0.5 : 1 }}>
                  {cancelled ? `-${item.rawCost || 0}🪙` : `${positive ? "+" : ""}${item.coins}🪙`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Demerit Modal ────────────────────────────────────────
const DemeritModal = ({ child, onApply, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [selected, setSelected] = useState(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customEmoji, setCustomEmoji] = useState("⚠️");
  const [coins, setCoins] = useState(0);
  const [applying, setApplying] = useState(false);

  const preset = selected !== null && selected >= 0 ? DEMERIT_PRESETS[selected] : null;
  const title = preset ? preset.title : customTitle;
  const emoji = preset ? preset.emoji : customEmoji;
  const canApply = selected !== null && title.trim().length > 0 && coins >= 0;

  const selectPreset = (index) => {
    setSelected(index);
    setCoins(DEMERIT_PRESETS[index].coins);
  };

  const selectCustom = () => {
    setSelected(-1);
    setCustomTitle("");
    setCoins(0);
  };

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    await onApply({ childId: child.id, title: title.trim(), emoji, coins });
    setApplying(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 9200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Registrar tropeço de ${child.display_name}`} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ position: "relative", background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.08)", color: T.textMuted, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <AvatarImg value={child.avatar_emoji} size={44} radius={14} />
          <div>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 17 }}>⚠️ Registrar Tropeço</div>
            <div style={{ color: T.textMuted, fontSize: 12 }}>{child.display_name} · 🪙 {child.kidcoins||0} coins</div>
          </div>
        </div>

        <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, marginBottom: 10 }}>TIPO DE TROPEÇO</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {DEMERIT_PRESETS.map((p, i) => (
            <button key={i} onClick={() => selectPreset(i)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 14, border: `2px solid ${selected === i ? T.pink : "rgba(255,255,255,0.1)"}`, background: selected === i ? `${T.pink}15` : "rgba(255,255,255,0.03)", cursor: "pointer", fontFamily: "'Nunito', sans-serif", textAlign: "left" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{p.emoji}</span>
              <div style={{ flex: 1, color: selected === i ? T.text : T.textMuted, fontWeight: 700, fontSize: 13 }}>{p.title}</div>
              <span style={{ color: T.pink, fontWeight: 900, fontSize: 12, flexShrink: 0 }}>-🪙{p.coins}</span>
            </button>
          ))}
          <button onClick={selectCustom}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 14, border: `2px solid ${selected === -1 ? T.pink : "rgba(255,255,255,0.1)"}`, background: selected === -1 ? `${T.pink}15` : "rgba(255,255,255,0.03)", cursor: "pointer", fontFamily: "'Nunito', sans-serif", textAlign: "left" }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>✏️</span>
            <div style={{ color: selected === -1 ? T.text : T.textMuted, fontWeight: 700, fontSize: 13 }}>Personalizado</div>
          </button>
        </div>

        {selected === -1 && (
          <div style={{ marginBottom: 16 }}>
            <Inp icon={customEmoji} placeholder="Motivo do tropeço" value={customTitle} onChange={e => setCustomTitle(e.target.value)} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {["⚠️","😤","📋","❌","😠","🌙","📱","🙅","💢","🔇"].map(e => (
                <button key={e} onClick={() => setCustomEmoji(e)} style={{ width: 36, height: 36, borderRadius: 10, fontSize: 18, border: `2px solid ${customEmoji === e ? T.pink : "rgba(255,255,255,0.12)"}`, background: customEmoji === e ? `${T.pink}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{e}</button>
              ))}
            </div>
          </div>
        )}

        {selected !== null && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, marginBottom: 8 }}>KIDCOINS A DESCONTAR</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setCoins(Math.max(0, coins - 5))} style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: T.text, fontSize: 22, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <div style={{ flex: 1, background: T.darker, borderRadius: 14, padding: "10px 16px", textAlign: "center", border: `2px solid ${T.pink}44` }}>
                <span style={{ color: T.pink, fontWeight: 900, fontSize: 22, fontFamily: "'Nunito', sans-serif" }}>🪙 {coins}</span>
              </div>
              <button onClick={() => setCoins(coins + 5)} style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: T.text, fontSize: 22, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
            {coins === 0 && <div style={{ color: T.textMuted, fontSize: 11, textAlign: "center", marginTop: 6 }}>0 coins = só registra, sem desconto</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleApply} disabled={applying || !canApply}
            style={{ flex: 1, padding: "14px", borderRadius: 16, border: "none", background: applying || !canApply ? "rgba(255,255,255,0.08)" : `linear-gradient(135deg, ${T.pink}, #FF4040)`, color: applying || !canApply ? T.textMuted : "#fff", fontWeight: 900, fontSize: 15, cursor: applying || !canApply ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif" }}>
            {applying ? "Registrando..." : "⚠️ Registrar Tropeço"}
          </button>
          <button onClick={onClose} style={{ padding: "14px 18px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
};

const ManagedChildView = ({
  child,
  missions,
  rewards,
  redemptions,
  activeTimers,
  checkingMission,
  redeemingFor,
  timerBusy,
  theme,
  getLog,
  countLogs,
  onComplete,
  onRedeem,
  onStartTimer,
  onPauseTimer,
  onFinishTimer,
  onEdit,
  onStatement,
  onBack,
  section,
  onSectionChange,
}) => {
  const [confirmMission, setConfirmMission] = useState(null);
  const [confirmReward, setConfirmReward] = useState(null);
  const level = getLvl(child.xp || 0);
  const nextLevel = getNext(child.xp || 0);
  const age = child.birth_date ? calcAge(child.birth_date) : child.age;
  const ageBand = age && age <= 7 ? "junior" : age && age <= 11 ? "explorer" : "independent";
  const xpRange = Math.max(1, nextLevel.xpNeeded - level.xpNeeded);
  const xpProgress = level === nextLevel ? 1 : Math.max(0, Math.min(1, ((child.xp || 0) - level.xpNeeded) / xpRange));
  const completed = missions.filter(mission => getLog(child.id, mission.id, mission.frequency)?.status === "approved").length;
  const progress = missions.length ? completed / missions.length : 0;
  const activeRewards = rewards.filter(reward => reward.is_active !== false);
  const childRedemptions = redemptions.filter(redemption => redemption.child_id === child.id);
  const childTimers = activeTimers.filter(timer => timer.child_id === child.id);
  const sectionTabs = [
    { key: "routine", icon: "🎯", label: "Rotina" },
    { key: "rewards", icon: "🎁", label: "Prêmios" },
    { key: "achievements", icon: "🏆", label: "Conquistas" },
    { key: "profile", icon: "👤", label: "Perfil" },
  ];

  const completeMission = async (mission, alreadyDone) => {
    if (checkingMission) return;
    if (alreadyDone && confirmMission !== mission.id) {
      setConfirmMission(mission.id);
      return;
    }
    setConfirmMission(null);
    await onComplete(child.id, mission.id);
  };

  const redeemReward = async (reward) => {
    if (redeemingFor || (child.kidcoins || 0) < reward.coin_cost) return;
    if (confirmReward !== reward.id) {
      setConfirmReward(reward.id);
      return;
    }
    setConfirmReward(null);
    await onRedeem(reward, child);
  };

  const chooseSection = (nextSection) => {
    onSectionChange(nextSection);
    setConfirmMission(null);
    setConfirmReward(null);
  };

  return (
    <div className="ru-managed-child" data-age-band={ageBand}>
      <div className="ru-managed-child__toolbar">
        <button type="button" className="ru-managed-child__back" onClick={onBack}>
          <span aria-hidden="true">←</span> Painel da família
        </button>
        <span className="ru-managed-child__supervision"><span aria-hidden="true">◆</span> Modo acompanhado</span>
      </div>

      <section className="ru-managed-child__hero" aria-labelledby="ru-managed-child-title">
        <div className="ru-managed-child__identity">
          <XPRing size={88} stroke={5} pct={xpProgress} color={level.color} trackColor="rgba(255,255,255,0.22)">
            <AvatarImg value={child.avatar_emoji} size={70} radius={35} style={{ background: "#ffffff" }} />
          </XPRing>
          <div>
            <span className="ru-managed-child__kicker">Jornada de hoje</span>
            <h2 id="ru-managed-child-title">{child.display_name}</h2>
            <p>{level.emoji} {level.name}{age ? ` · ${age} anos` : ""}</p>
          </div>
        </div>
        <dl className="ru-managed-child__stats">
          <div><dt>KidCoins</dt><dd><span aria-hidden="true">🪙</span> {child.kidcoins || 0}</dd></div>
          <div><dt>XP total</dt><dd><span aria-hidden="true">⚡</span> {child.xp || 0}</dd></div>
          <div><dt>Sequência</dt><dd><span aria-hidden="true">🔥</span> {child.streak || 0}</dd></div>
        </dl>
        <div className="ru-managed-child__day-progress">
          <div><span>Missões do período</span><strong>{completed}/{missions.length}</strong></div>
          <div role="progressbar" aria-label={`Progresso de ${child.display_name}`} aria-valuemin={0} aria-valuemax={missions.length || 1} aria-valuenow={completed}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </section>

      <nav className="ru-managed-child__tabs" aria-label={`Jornada de ${child.display_name}`}>
        {sectionTabs.map(item => (
          <button key={item.key} type="button" onClick={() => chooseSection(item.key)} aria-current={section === item.key ? "page" : undefined}>
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>

      {section === "routine" && (
        <div className="ru-managed-child__section">
          <header className="ru-managed-child__heading">
            <div><span>Agora</span><h3>Missões</h3></div>
            <strong>{missions.length - completed} restante{missions.length - completed !== 1 ? "s" : ""}</strong>
          </header>
          {childTimers.length > 0 && (
            <section className="ru-managed-child__timers" aria-labelledby="ru-managed-timers-title">
              <h4 id="ru-managed-timers-title">Prêmios em andamento</h4>
              {childTimers.map(timer => (
                <div key={timer.id} className="ru-managed-child__timer-row">
                  <span className="ru-managed-child__item-icon" aria-hidden="true">{timer.reward_emoji || "⏱️"}</span>
                  <div><strong>{timer.reward_title}</strong><span>Cronômetro do prêmio</span></div>
                  <TimerControl t={timer} onStart={onStartTimer} onPause={onPauseTimer} onFinish={onFinishTimer} busy={timerBusy === timer.id} tone={theme} />
                </div>
              ))}
            </section>
          )}
          {missions.length === 0 ? (
            <div className="ru-managed-child__empty"><span aria-hidden="true">🎯</span><strong>Nenhuma missão ativa</strong><p>A rotina está livre por enquanto.</p></div>
          ) : (
            <div className="ru-managed-child__mission-grid">
              {missions.map(mission => {
                const log = getLog(child.id, mission.id, mission.frequency);
                const done = log?.status === "approved";
                const waiting = log?.status === "pending";
                const busy = checkingMission === `${child.id}-${mission.id}`;
                const confirming = confirmMission === mission.id;
                const occurrences = countLogs(child.id, mission.id, mission.frequency);
                return (
                  <article key={mission.id} className="ru-managed-child__mission" data-status={waiting ? "waiting" : done ? "done" : "open"}>
                    <div className="ru-managed-child__mission-main">
                      <span className="ru-managed-child__item-icon" aria-hidden="true">{done ? "✓" : mission.emoji}</span>
                      <div><span>{freqLabel(mission.frequency)}</span><h4>{mission.title}</h4></div>
                    </div>
                    <div className="ru-managed-child__mission-meta">
                      <span>🪙 {mission.coins_reward}</span><span>⚡ {mission.xp_reward} XP</span>
                      {mission.duration_minutes > 0 && <span>⏱ {mission.duration_minutes} min</span>}
                      {occurrences > 1 && <span>↻ {occurrences} vezes</span>}
                    </div>
                    {waiting ? (
                      <span className="ru-managed-child__status">Aguardando aprovação</span>
                    ) : (
                      <button type="button" className="ru-managed-child__primary-action" data-confirming={confirming} onClick={() => completeMission(mission, done)} disabled={Boolean(checkingMission)} aria-busy={busy}>
                        {busy ? "Salvando..." : confirming ? "Confirmar repetição" : done ? "Registrar de novo" : "Marcar como feita"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {section === "rewards" && (
        <div className="ru-managed-child__section">
          <header className="ru-managed-child__heading">
            <div><span>Loja</span><h3>Prêmios</h3></div>
            <strong>🪙 {child.kidcoins || 0}</strong>
          </header>
          {childRedemptions.length > 0 && (
            <section className="ru-managed-child__redemptions" aria-labelledby="ru-managed-redemptions-title">
              <h4 id="ru-managed-redemptions-title">Pedidos em andamento</h4>
              <div>
                {childRedemptions.map(redemption => (
                  <article key={redemption.id}>
                    <span aria-hidden="true">{redemption.reward_emoji || "🎁"}</span>
                    <div><strong>{redemption.reward_title}</strong><small>{redemption.status === "approved" ? "Aguardando entrega" : "Aguardando aprovação"}</small></div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {activeRewards.length === 0 ? (
            <div className="ru-managed-child__empty"><span aria-hidden="true">🎁</span><strong>Nenhum prêmio disponível</strong><p>O catálogo está vazio por enquanto.</p></div>
          ) : (
            <div className="ru-managed-child__reward-grid">
              {activeRewards.map(reward => {
                const affordable = (child.kidcoins || 0) >= reward.coin_cost;
                const busy = redeemingFor === reward.id;
                const confirming = confirmReward === reward.id;
                return (
                  <article key={reward.id} className="ru-managed-child__reward" data-affordable={affordable}>
                    <span className="ru-managed-child__reward-icon" aria-hidden="true">{reward.emoji || "🎁"}</span>
                    <div><h4>{reward.title}</h4>{reward.duration_minutes > 0 && <span>⏱ {reward.duration_minutes} min</span>}</div>
                    <strong>🪙 {reward.coin_cost}</strong>
                    <button type="button" data-confirming={confirming} onClick={() => redeemReward(reward)} disabled={!affordable || Boolean(redeemingFor)} aria-busy={busy}>
                      {busy ? "Resgatando..." : !affordable ? `Faltam ${reward.coin_cost - (child.kidcoins || 0)}` : confirming ? `Confirmar ${reward.coin_cost} KidCoins` : "Resgatar"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {section === "achievements" && (
        <div className="ru-managed-child__section">
          <header className="ru-managed-child__heading">
            <div><span>Progresso</span><h3>Conquistas</h3></div>
            <strong>Nível {level.level}</strong>
          </header>
          <section className="ru-managed-child__next-level" aria-labelledby="ru-managed-next-level-title">
            <div><span>Próximo nível</span><h4 id="ru-managed-next-level-title">{level === nextLevel ? `${level.emoji} Jornada completa` : `${nextLevel.emoji} ${nextLevel.name}`}</h4></div>
            <strong>{level === nextLevel ? `${child.xp || 0} XP` : `${Math.max(0, nextLevel.xpNeeded - (child.xp || 0))} XP restantes`}</strong>
            <div role="progressbar" aria-label="Progresso para o próximo nível" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(xpProgress * 100)}><span style={{ width: `${xpProgress * 100}%` }} /></div>
          </section>
          <div className="ru-managed-child__level-grid">
            {LEVELS.map(item => {
              const reached = (child.xp || 0) >= item.xpNeeded;
              const current = item.level === level.level;
              return (
                <article key={item.level} data-reached={reached} data-current={current}>
                  <span aria-hidden="true">{item.emoji}</span>
                  <div><small>Nível {item.level}</small><h4>{item.name}</h4><p>{item.xpNeeded} XP</p></div>
                  <strong>{current ? "Atual" : reached ? "Conquistado" : "Bloqueado"}</strong>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {section === "profile" && (
        <div className="ru-managed-child__section">
          <header className="ru-managed-child__heading"><div><span>Resumo</span><h3>Perfil</h3></div></header>
          <div className="ru-managed-child__profile">
            <section className="ru-managed-child__profile-main" aria-labelledby="ru-managed-profile-title">
              <AvatarImg value={child.avatar_emoji} size={84} radius={42} style={{ background: "var(--ru-parent-surface-muted)" }} />
              <div><span>Perfil gerenciado</span><h4 id="ru-managed-profile-title">{child.display_name}</h4><p>{age ? `${age} anos · ` : ""}{level.emoji} {level.name}</p></div>
              <button type="button" onClick={onEdit}>Editar perfil</button>
            </section>
            <dl className="ru-managed-child__profile-stats">
              <div><dt>KidCoins</dt><dd>{child.kidcoins || 0}</dd></div>
              <div><dt>XP total</dt><dd>{child.xp || 0}</dd></div>
              <div><dt>Nível</dt><dd>{level.level}</dd></div>
              <div><dt>Sequência</dt><dd>{child.streak || 0}</dd></div>
            </dl>
            <button type="button" className="ru-managed-child__statement" onClick={onStatement}><span aria-hidden="true">📋</span><span><strong>Extrato de KidCoins</strong><small>Entradas, resgates e tropeços</small></span><b aria-hidden="true">›</b></button>
          </div>
        </div>
      )}
    </div>
  );
};

// Resgatar recompensa em nome do filho — responsável escolhe e resgata pro filho
const RedeemForChildModal = ({ child, rewards, redeemingFor, onRedeem, onClose }) => {
  const dialogRef = useModalDialog(onClose);
  const [balance, setBalance] = useState(child.kidcoins || 0);
  const active = (rewards || []).filter(r => r.is_active !== false);
  const handle = async (r) => {
    if (balance < r.coin_cost || redeemingFor) return;
    const ok = await onRedeem(r);
    if (ok) setBalance(b => b - r.coin_cost);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 9300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Resgatar recompensa para ${child.display_name}`} tabIndex={-1} onClick={e => e.stopPropagation()} style={{ position: "relative", background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, maxHeight: "88vh", overflowY: "auto", animation: "slideDown 0.3s ease" }}>
        <button onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.08)", color: T.textMuted, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <AvatarImg value={child.avatar_emoji} size={44} radius={14} />
          <div>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 17 }}>🎁 Resgatar para {child.display_name}</div>
            <div style={{ color: T.secondary, fontSize: 12, fontWeight: 800 }}>Saldo: 🪙 {balance}</div>
          </div>
        </div>
        {active.length === 0 ? (
          <div style={{ background: T.darker, borderRadius: 16, padding: 24, textAlign: "center", color: T.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎁</div>Nenhuma recompensa cadastrada.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {active.map(r => {
              const can = balance >= r.coin_cost;
              const busy = redeemingFor === r.id;
              return (
                <div key={r.id} style={{ background: T.darker, borderRadius: 18, padding: 14, textAlign: "center", border: `1px solid ${can ? T.accent + "33" : "rgba(255,255,255,0.06)"}`, opacity: can ? 1 : 0.55 }}>
                  <div style={{ fontSize: 34, marginBottom: 6 }}>{r.emoji}</div>
                  <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ color: T.secondary, fontWeight: 900, fontSize: 13 }}>🪙 {r.coin_cost}</div>
                  {r.duration_minutes > 0 && <div style={{ marginTop: 4, display: "inline-block", fontSize: 10, color: T.blue, background: `${T.blue}22`, borderRadius: 6, padding: "1px 8px", fontWeight: 800 }}>⏱️ {r.duration_minutes}min</div>}
                  <button onClick={() => handle(r)} disabled={!can || busy}
                    style={{ width: "100%", marginTop: 10, padding: "8px 0", borderRadius: 12, border: "none", background: can ? `linear-gradient(135deg, ${T.accent}, ${T.blue})` : "rgba(255,255,255,0.06)", color: can ? "#fff" : T.textMuted, fontWeight: 800, fontSize: 12, cursor: can && !busy ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif" }}>
                    {busy ? "..." : can ? "Resgatar" : "Sem saldo"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ color: T.textMuted, fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
          O resgate entra na fila "🎁 Aguardando entrega" pra você confirmar quando entregar.
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// PARENT DASHBOARD
// ═══════════════════════════════════════════════════════════
const ParentDash = ({ profile, onSignOut, onRefresh }) => {
  const isDesktop = useIsDesktop();
  const [viewOpenedAt] = useState(() => Date.now());
  const [tab, setTab]             = useState("home");
  const [parentTheme, setParentTheme] = useState(getStoredParentTheme);
  const [children, setChildren]   = useState([]);
  const [missions, setMissions]   = useState([]);
  const [pending, setPending]     = useState([]);
  const [rewards, setRewards]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [notif, setNotif]         = useState(null);
  const [notifType, setNotifType] = useState("success");
  const [showMission, setShowMission]   = useState(false);
  const [creatingMission, setCreatingMission] = useState(false);
  const [creatingReward, setCreatingReward] = useState(false);
  const [dragMissionId, setDragMissionId] = useState(null);
  const [localMissions, setLocalMissions] = useState([]);
  const [orderingMissions, setOrderingMissions] = useState(false);
  const [reorderStatus, setReorderStatus] = useState("");
  const [showReward, setShowReward]     = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newM, setNewM] = useState({ title:"", emoji:"⭐", coins_reward:20, xp_reward:15, frequency:"daily", duration_minutes:0 });
  const [newR, setNewR] = useState({ title:"", emoji:"🎁", coin_cost:50, duration_minutes:0 });
  const [aiLoading, setAiLoading] = useState(null); // "missions" | "report" | null
  const [aiMissions, setAiMissions] = useState([]);
  const [aiReport, setAiReport] = useState(null);
  const [aiError, setAiError]   = useState(null);
  const [addingAIMission, setAddingAIMission] = useState(null);
  const aiResultsRef = useRef(null);
  const [inviteCode, setInviteCode]       = useState(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [codeCopied, setCodeCopied]       = useState(false);
  const [editingChild, setEditingChild]   = useState(null);
  const [editingName, setEditingName]     = useState(false);
  const [newName, setNewName]             = useState("");
  const [savingName, setSavingName]       = useState(false);
  const [editingMission, setEditingMission] = useState(null);
  const [editingReward, setEditingReward]   = useState(null);
  const [familyPlan, setFamilyPlan]         = useState("free");
  const [showUpgrade, setShowUpgrade]       = useState(false);
  const [myEmail, setMyEmail]               = useState("");
  const [loadError, setLoadError]           = useState(null);
  const [childLogs, setChildLogs]           = useState([]);
  const [checkingMission, setCheckingMission] = useState(null); // "childId-missionId"
  const [reviewingLog, setReviewingLog]       = useState(null);
  const [redemptions, setRedemptions]         = useState([]);
  const [activeTimers, setActiveTimers]       = useState([]);
  const [timerBusy, setTimerBusy]             = useState(null);
  const [confirmingRed, setConfirmingRed]     = useState(null);
  const [cancellingRed, setCancellingRed]     = useState(null);
  const [confirmCancelRed, setConfirmCancelRed] = useState(null);
  const [demeritTarget, setDemeritTarget]     = useState(null); // child object
  const [extratoTarget, setExtratoTarget]     = useState(null); // child object
  const [redeemTarget, setRedeemTarget]       = useState(null); // child object (resgatar em nome do filho)
  const [redeemingFor, setRedeemingFor]       = useState(null); // reward id em resgate
  const [coParents, setCoParents]             = useState([]);
  const [removingCoParent, setRemovingCoParent] = useState(null);
  const [confirmRemoveCoParent, setConfirmRemoveCoParent] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [inactiveMissions, setInactiveMissions] = useState([]);
  const [showArchivedMissions, setShowArchivedMissions] = useState(false);
  const [showArchivedRewards, setShowArchivedRewards]   = useState(false);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [managedChildId, setManagedChildId]   = useState(null);
  const [managedChildSection, setManagedChildSection] = useState("routine");
  const [reactivating, setReactivating]       = useState(null);
  const pendingRef = useRef(null);
  const contentRef = useRef(null);
  const loadIdRef = useRef(0);
  const redemptionActionsRef = useRef(new Set());

  useEffect(() => {
    try {
      window.localStorage.setItem(PARENT_THEME_STORAGE_KEY, parentTheme);
    } catch {
      // Mantem a preferencia somente durante a sessao quando o storage falha.
    }
  }, [parentTheme]);

  useEffect(() => {
    if (isDesktop) contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
    else window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [isDesktop, tab, managedChildId]);

  const notify = (msg, type="success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };
  const tryAddChild = () => { if (familyPlan === "free" && children.length >= PLAN_LIMITS.free.children) { setShowUpgrade(true); } else { setShowAddChild(true); } };

  const loadInviteCode = async () => {
    const { data } = await supabase.rpc("get_invite_code");
    if (data && typeof data === "object" && data.code) {
      setInviteCode(data.code);
      setInviteExpiresAt(data.expires_at || null);
    } else {
      // Sem código — gera automaticamente na primeira abertura
      const { data: newCode } = await supabase.rpc("generate_invite_code");
      if (newCode) {
        setInviteCode(newCode);
        setInviteExpiresAt(new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString());
      }
    }
  };

  const loadFamilyPlan = async (prevPlan) => {
    const { data } = await supabase.rpc("get_family_plan");
    const plan = data || "free";
    setFamilyPlan(plan);
    if (prevPlan === "free" && plan === "premium") {
      notify("🎉 Bem-vindo ao Premium! Seus benefícios já estão ativos.", "success");
    }
  };

  const generateCode = async () => {
    setInviteLoading(true);
    const { data, error } = await supabase.rpc("generate_invite_code");
    setInviteLoading(false);
    if (error) return notify("Erro ao gerar código: " + error.message, "error");
    setInviteCode(data);
    const exp = new Date(Date.now() + 72 * 60 * 60 * 1000);
    setInviteExpiresAt(exp.toISOString());
    notify("✅ Código gerado! Válido por 72 horas.");
  };

  const fmtExpiry = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const hrs = Math.round((d - now) / 36e5);
    if (hrs <= 0) return "expirado";
    if (hrs < 24) return `expira em ${hrs}h`;
    return `expira em ${Math.round(hrs/24)}d`;
  };

  const copyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCodeCopied(true);
      notify("✅ Código copiado!");
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const saveParentName = async () => {
    if (!newName.trim()) return;
    setSavingName(true);
    const { error } = await supabase.rpc("update_display_name", { p_display_name: newName.trim() });
    setSavingName(false);
    if (error) {
      captureActionError(error, "parent_account", "update_name", "parent_settings");
      return notify("Erro ao salvar nome: " + error.message, "error");
    }
    setEditingName(false);
    notify("✅ Nome atualizado!");
    if (onRefresh) onRefresh();
  };

  const loadCoParents = async () => {
    if (!profile.family_id) return;
    const { data } = await supabase.from("profiles")
      .select("id, display_name, role")
      .eq("family_id", profile.family_id)
      .in("role", ["parent", "admin"])
      .neq("id", profile.id);
    setCoParents(data || []);
  };

  const removeCoParent = async (targetId) => {
    if (removingCoParent) return;
    setRemovingCoParent(targetId);
    const { error } = await supabase.rpc("remove_co_parent", { p_target_id: targetId });
    setRemovingCoParent(null);
    if (error) {
      captureActionError(error, "parent_account", "remove_co_parent", "parent_settings");
      return notify(error.message, "error");
    }
    setConfirmRemoveCoParent(null);
    notify("✅ Co-responsável removido");
    loadCoParents();
  };

  const deleteAccount = async () => {
    if (deletingAccount || deleteConfirmationText !== "EXCLUIR") return;
    setDeletingAccount(true);
    // Edge function: apaga dados do app + remove do Auth (LGPD)
    const { data, error } = await supabase.functions.invoke("delete-account");
    if (error || data?.error) {
      const failure = await readFunctionFailure(data, error, "Erro ao excluir conta");
      captureActionError(new Error(failure), "parent_account", "delete", "parent_settings");
      setDeletingAccount(false);
      return notify(failure, "error");
    }
    await supabase.auth.signOut();
    setDeletingAccount(false);
    onSignOut();
  };

  // Reconciliação de pagamento: ativa Premium se houver compra no Hotmart com o e-mail da conta.
  const claimPremium = async (silent) => {
    const { data, error } = await supabase.rpc("claim_premium_by_email");
    if (error) {
      captureActionError(error, "premium", "claim_by_email", "upgrade");
      if (!silent) notify("Nao foi possivel verificar sua assinatura agora.", "error");
      return false;
    }
    if (data?.plan) await loadFamilyPlan(familyPlan);
    if (data?.ok) { if (!silent) notify("👑 Premium ativado! Aproveite."); load(); return true; }
    if (!silent) notify("Nenhuma assinatura encontrada nesse e-mail. Confira se pagou com o e-mail da conta.", "error");
    return false;
  };
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyEmail(data?.user?.email || ""));
    const timer = window.setTimeout(() => claimPremium(true), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reactivateMission = async (missionId) => {
    if (reactivating) return;
    if (familyPlan !== "premium" && missions.length >= PLAN_LIMITS.free.activeMissions) {
      setShowUpgrade(true);
      return;
    }
    setReactivating(missionId);
    const { error } = await supabase.rpc("reactivate_mission", { p_mission_id: missionId });
    setReactivating(null);
    if (error) return notify(error.message, "error");
    notify("✅ Missão reativada!");
    load();
  };

  const reactivateReward = async (rewardId) => {
    if (reactivating) return;
    const activeRewardCount = rewards.filter(reward => reward.is_active !== false).length;
    if (familyPlan !== "premium" && activeRewardCount >= PLAN_LIMITS.free.activeRewards) {
      setShowUpgrade(true);
      return;
    }
    setReactivating(rewardId);
    const { error } = await supabase.rpc("reactivate_reward", { p_reward_id: rewardId });
    setReactivating(null);
    if (error) {
      captureActionError(error, "reward", "reactivate", "parent_rewards");
      return notify(error.message, "error");
    }
    notify("✅ Recompensa reativada!");
    load();
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      load();
      loadInviteCode();
      loadFamilyPlan();
      loadCoParents();
    }, 0);
    // Realtime — nova missão pendente
    const channel = supabase
      .channel(`parent-${profile.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "mission_logs",
        filter: `family_id=eq.${profile.family_id}`,
      }, () => {
        notify("⏳ Nova missão aguardando sua aprovação!");
        load();
      })
      .subscribe();
    return () => {
      window.clearTimeout(initialLoad);
      supabase.removeChannel(channel);
    };
    // The realtime subscription is keyed only by the stable family/user identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.family_id, profile.id]);

  async function load() {
    const myId = ++loadIdRef.current;
    setLoading(true);
    try {
      const last30 = Array.from({length: 30}, (_, i) => localDateStr(i));
      const results = await Promise.all([
        supabase.from("profiles").select("*").eq("family_id", profile.family_id).eq("role","child"),
        supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active",true),
        supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active",false),
        supabase.from("pending_approvals").select("*"),
        supabase.from("rewards").select("*").eq("family_id", profile.family_id),
        supabase.from("mission_logs").select("mission_id, child_id, status, due_date").eq("family_id", profile.family_id).in("due_date", last30).in("status",["pending","approved"]),
        supabase.from("redemption_logs").select("*").eq("family_id", profile.family_id).in("status",["requested","approved"]).order("created_at", { ascending: false }),
        supabase.from("redemption_logs").select("id,reward_title,reward_emoji,child_id,child_name,duration_minutes,timer_state,timer_ends_at,timer_remaining_seconds").eq("family_id", profile.family_id).eq("status","delivered").in("timer_state",["idle","running","paused"]).order("created_at", { ascending: false }),
      ]);
      const failedQuery = results.find((result) => result.error)?.error;
      if (failedQuery) throw failedQuery;
      const [{ data: ch }, { data: m }, { data: mi }, { data: p }, { data: r }, { data: cl }, { data: rd }, { data: td }] = results;
      if (myId !== loadIdRef.current) return; // load mais recente já está em andamento
      const orderedMissions = [...(m || [])].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
      setChildren(ch||[]); setMissions(orderedMissions); setLocalMissions(orderedMissions); setInactiveMissions(mi||[]); setPending(p||[]); setRewards(r||[]); setChildLogs(cl||[]); setRedemptions(rd||[]); setActiveTimers(td||[]);
      setLoadError(null);
    } catch (error) {
      void reportAppError({ error, source: "parent_dashboard", action: "load", screen: "parent" });
      if (myId === loadIdRef.current) setLoadError("Não foi possível carregar seus dados. Tente novamente.");
    } finally {
      if (myId === loadIdRef.current) setLoading(false);
    }
  }

  const handleDragOver = (event, overId) => {
    event.preventDefault();
    if (!dragMissionId || overId === dragMissionId) return;
    setLocalMissions(previous => {
      const reordered = [...previous];
      const from = reordered.findIndex(mission => mission.id === dragMissionId);
      const to = reordered.findIndex(mission => mission.id === overId);
      if (from < 0 || to < 0) return previous;
      reordered.splice(to, 0, reordered.splice(from, 1)[0]);
      return reordered;
    });
  };

  const saveMissionOrder = async (orderedMissions = localMissions) => {
    if (orderingMissions) return;
    setDragMissionId(null);
    setOrderingMissions(true);
    setReorderStatus("");
    const withOrder = orderedMissions.map((mission, index) => ({ ...mission, sort_order: index }));
    const { error } = await supabase.rpc("reorder_missions", {
      p_orders: withOrder.map(mission => ({ id: mission.id, sort_order: mission.sort_order })),
    });
    setOrderingMissions(false);
    if (error) {
      captureActionError(error, "mission_order", "reorder", "parent_missions");
      notify("Não foi possível salvar a nova ordem. A lista será restaurada.", "error");
      setReorderStatus("A nova ordem não foi salva.");
      load();
      return;
    }
    setLocalMissions(withOrder);
    setMissions(withOrder);
    setReorderStatus("Ordem das missões atualizada.");
  };

  const moveMission = (missionId, direction) => {
    if (orderingMissions) return;
    const from = localMissions.findIndex(mission => mission.id === missionId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= localMissions.length) return;
    const reordered = [...localMissions];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    setLocalMissions(reordered);
    void saveMissionOrder(reordered);
  };

  const getChildLog = (childId, missionId, frequency = "daily") => {
    const cutoffDays = { daily: 0, weekly: 6, biweekly: 13, monthly: 29 }[frequency] ?? 0;
    const cutoffStr = localDateStr(cutoffDays);
    return childLogs.find(l => l.child_id === childId && l.mission_id === missionId && l.due_date >= cutoffStr);
  };

  const countChildLogsInPeriod = (childId, missionId, frequency = "daily") => {
    const cutoffDays = { daily: 0, weekly: 6, biweekly: 13, monthly: 29 }[frequency] ?? 0;
    const cutoffStr = localDateStr(cutoffDays);
    return childLogs.filter(l => l.child_id === childId && l.mission_id === missionId && l.due_date >= cutoffStr && l.status !== "rejected").length;
  };

  const pushNotify = (userIds, title, body) => {
    void invokePushNotification(
      { user_ids: userIds, title, body },
      "push_notification",
      "parent_dashboard",
    );
  };

  const parentCheck = async (childId, missionId) => {
    const key = `${childId}-${missionId}`;
    setCheckingMission(key);
    const { error } = await supabase.rpc("parent_check_mission", { p_child_id: childId, p_mission_id: missionId });
    setCheckingMission(null);
    if (error) {
      captureActionError(error, "mission", "parent_check", "managed_child");
      notify(error.message || "Erro ao marcar missão", "error");
      return false;
    }
    notify("✅ Missão marcada como concluída!"); load();
    const child = children.find(c => c.id === childId);
    pushNotify([childId], "Missão concluída! 🎉", `Parabéns${child ? `, ${child.display_name}` : ""}! Continue assim! 🚀`);
    return true;
  };

  // Resgatar recompensa EM NOME DO FILHO (criança sem celular)
  const redeemForChild = async (reward, childOverride = null) => {
    const targetChild = childOverride || redeemTarget;
    if (!targetChild) return false;
    setRedeemingFor(reward.id);
    const { error } = await supabase.rpc("redeem_for_child", { p_child_id: targetChild.id, p_reward_id: reward.id, p_quantity: 1 });
    setRedeemingFor(null);
    if (error) { captureActionError(error, "redemption", "redeem_for_child", "parent_rewards"); notify(error.message || "Erro ao resgatar", "error"); return false; }
    notify(`🎁 ${reward.title} resgatado para ${targetChild.display_name}! Veja em "Aguardando entrega".`);
    load();
    return true;
  };

  // Cronômetro de recompensa (responsável pode iniciar/pausar pelo filho)
  const startTimer = async (id) => { setTimerBusy(id); const { error } = await supabase.rpc("start_reward_timer", { p_log_id: id }); setTimerBusy(null); if (error) { captureActionError(error, "reward_timer", "start", "parent_rewards"); return notify(error.message || "Erro no cronômetro", "error"); } load(); };
  const pauseTimer = async (id) => { setTimerBusy(id); const { error } = await supabase.rpc("pause_reward_timer", { p_log_id: id }); setTimerBusy(null); if (error) { captureActionError(error, "reward_timer", "pause", "parent_rewards"); return notify(error.message || "Erro no cronômetro", "error"); } load(); };
  const finishTimer = async (id) => { setTimerBusy(id); const { error } = await supabase.rpc("finish_reward_timer", { p_log_id: id }); setTimerBusy(null); if (error) { captureActionError(error, "reward_timer", "finish", "parent_rewards"); return notify(error.message || "Erro ao concluir", "error"); } notify("✅ Recompensa concluída!"); load(); };

  const confirmDelivery = async (redemptionId) => {
    if (redemptionActionsRef.current.has(redemptionId)) return;
    redemptionActionsRef.current.add(redemptionId);
    setConfirmingRed(redemptionId);
    const red = redemptions.find(r => r.id === redemptionId);
    try {
      const { error } = await supabase.rpc("confirm_redemption", { p_log_id: redemptionId });
      if (error) { captureActionError(error, "redemption", "confirm_delivery", "parent_rewards"); notify(error.message || "Erro ao confirmar entrega", "error"); load(); return; }
      notify("✅ Entrega confirmada!"); load();
      if (red?.child_id) pushNotify([red.child_id], "Recompensa entregue! 🎁", `${red.reward_emoji || "🎁"} ${red.reward_title} foi entregue!`);
    } finally {
      redemptionActionsRef.current.delete(redemptionId);
      setConfirmingRed(null);
    }
  };

  const cancelRedemption = async (redemptionId) => {
    if (redemptionActionsRef.current.has(redemptionId)) return;
    redemptionActionsRef.current.add(redemptionId);
    setCancellingRed(redemptionId);
    try {
      const { error } = await supabase.rpc("cancel_redemption", { p_log_id: redemptionId });
      if (error) { captureActionError(error, "redemption", "cancel", "parent_rewards"); notify(error.message || "Erro ao cancelar", "error"); load(); return; }
      setConfirmCancelRed(null);
      notify("🔄 Resgate cancelado. Coins devolvidos."); load();
    } finally {
      redemptionActionsRef.current.delete(redemptionId);
      setCancellingRed(null);
    }
  };

  const approveRedemption = async (redemptionId) => {
    if (redemptionActionsRef.current.has(redemptionId)) return;
    redemptionActionsRef.current.add(redemptionId);
    setConfirmingRed(redemptionId);
    const red = redemptions.find(r => r.id === redemptionId);
    try {
      const { error } = await supabase.rpc("approve_redemption", { p_log_id: redemptionId });
      if (error) { captureActionError(error, "redemption", "approve", "parent_rewards"); notify(error.message || "Erro ao aprovar", "error"); load(); return; }
      setConfirmCancelRed(null);
      notify("✅ Resgate aprovado! Aguardando entrega."); load();
      if (red?.child_id) pushNotify([red.child_id], "Resgate aprovado! ✅", `${red.reward_emoji || "🎁"} ${red.reward_title} foi aprovado! Em breve você recebe.`);
    } finally {
      redemptionActionsRef.current.delete(redemptionId);
      setConfirmingRed(null);
    }
  };

  const applyDemerit = async ({ childId, title, emoji, coins }) => {
    const { error } = await supabase.rpc("apply_demerit", {
      p_child_id: childId,
      p_title:    title,
      p_emoji:    emoji,
      p_coins:    coins,
    });
    if (error) { notify(error.message || "Erro ao registrar tropeço", "error"); return; }
    setDemeritTarget(null);
    notify(`⚠️ Tropeço registrado${coins > 0 ? ` — -🪙${coins} de ${children.find(c=>c.id===childId)?.display_name}` : ""}!`);
    load();
  };

  const review = async (logId, approve) => {
    if (reviewingLog) return;
    setReviewingLog(logId);
    const log = pending.find(p => p.log_id === logId);
    const { error } = await supabase.rpc("review_mission", { p_log_id: logId, p_approve: approve, p_note: approve ? "Ótimo trabalho! 🎉" : "Tente novamente!" });
    setReviewingLog(null);
    if (error) {
      // Ex.: "Log já foi revisado" (outra aba/co-responsável já aprovou) — recarrega
      // a fila pra remover o item obsoleto em vez de deixar reclicar.
      const msg = /já foi revisad/i.test(error.message || "")
        ? "Esta missão já foi revisada. Atualizando a lista…"
        : (error.message || "Erro ao revisar");
      notify(msg, "error");
      load();
      return;
    }
    notify(approve ? "✅ Aprovado! KidCoins liberados!" : "❌ Missão rejeitada");
    load();
    if (approve && log?.child_id) {
      pushNotify([log.child_id], "Missão aprovada! ⭐", `${log.mission_emoji || "✅"} ${log.mission_title} foi aprovada! Você ganhou KidCoins!`);
    }
  };

  const isLimitError = (msg = "") => {
    const normalized = msg.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return normalized.includes("limite") || normalized.includes("upgrade") || normalized.includes("ilimitad");
  };

  const createMission = async () => {
    if (creatingMission) return;
    const title = newM.title.trim();
    if (title.length < 2) return notify("Digite um nome com pelo menos 2 caracteres.", "error");
    setCreatingMission(true);
    try {
      const { data, error } = await supabase.rpc("create_mission", {
        p_title: title, p_emoji: newM.emoji,
        p_coins_reward: newM.coins_reward, p_xp_reward: newM.xp_reward, p_frequency: newM.frequency,
      });
      if (error) {
        if (isLimitError(error.message)) { setShowMission(false); setShowUpgrade(true); return; }
        captureActionError(error, "mission", "create", "parent_missions");
        notify("Erro ao criar missão: " + error.message, "error");
        return;
      }
      if (data?.success === false) {
        if (isLimitError(data.error || "")) { setShowMission(false); setShowUpgrade(true); return; }
        notify(data.error || "Erro ao criar missão", "error");
        return;
      }

      const newMissionId = typeof data === "string" ? data : data?.id;
      let durationWarning = "";
      if (newM.duration_minutes > 0) {
        if (!newMissionId) {
          durationWarning = "Missão criada, mas a duração não pôde ser associada.";
          captureActionError(new Error(durationWarning), "mission", "set_duration", "parent_missions");
        } else {
          const { error: durationError } = await supabase.rpc("set_mission_duration", {
            p_mission_id: newMissionId,
            p_minutes: newM.duration_minutes,
          });
          if (durationError) {
            durationWarning = "Missão criada, mas a duração não foi salva. Edite e tente novamente.";
            captureActionError(durationError, "mission", "set_duration", "parent_missions");
          }
        }
      }

      setShowMission(false);
      setNewM({ title:"", emoji:"⭐", coins_reward:20, xp_reward:15, frequency:"daily", duration_minutes:0 });
      load();
      notify(durationWarning || "🎯 Missão criada!", durationWarning ? "error" : "success");
    } finally {
      setCreatingMission(false);
    }
  };

  const createReward = async () => {
    if (creatingReward) return;
    const title = newR.title.trim();
    if (title.length < 2) return notify("Digite um nome com pelo menos 2 caracteres.", "error");
    setCreatingReward(true);
    try {
      const { data, error } = await supabase.rpc("create_reward", {
        p_title: title, p_emoji: newR.emoji, p_coin_cost: newR.coin_cost,
      });
      if (error) {
        if (isLimitError(error.message)) { setShowReward(false); setShowUpgrade(true); return; }
        captureActionError(error, "reward", "create", "parent_rewards");
        notify("Erro ao criar recompensa: " + error.message, "error");
        return;
      }
      if (data?.success === false) {
        if (isLimitError(data.error || "")) { setShowReward(false); setShowUpgrade(true); return; }
        notify(data.error || "Erro ao criar recompensa", "error");
        return;
      }

      const newRewardId = typeof data === "string" ? data : data?.id;
      let durationWarning = "";
      if (newR.duration_minutes > 0) {
        if (!newRewardId) {
          durationWarning = "Recompensa criada, mas a duração não pôde ser associada.";
          captureActionError(new Error(durationWarning), "reward", "set_duration", "parent_rewards");
        } else {
          const { error: durationError } = await supabase.rpc("set_reward_duration", { p_reward_id: newRewardId, p_minutes: newR.duration_minutes });
          if (durationError) {
            durationWarning = "Recompensa criada, mas a duração não foi salva. Edite e tente novamente.";
            captureActionError(durationError, "reward", "set_duration", "parent_rewards");
          }
        }
      }

      setShowReward(false);
      setNewR({ title:"", emoji:"🎁", coin_cost:50, duration_minutes:0 });
      load();
      notify(durationWarning || "🎁 Recompensa criada!", durationWarning ? "error" : "success");
    } finally {
      setCreatingReward(false);
    }
  };

  const suggestMissions = async () => {
    if (children.length === 0) return notify("Adicione um filho primeiro!", "error");
    setAiLoading("missions"); setAiReport(null); setAiError(null);
    try {
      const raw = await callAI("suggest_missions", {
        children: children.map(c => ({ name: c.display_name, age: c.age, xp: c.xp })),
        existingMissions: missions.map(m => ({ title: m.title })),
      });
      if (!raw) throw new Error("IA não retornou resultados");
      const parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("IA retornou lista vazia, tente novamente");
      setAiMissions(parsed);
      setTimeout(() => aiResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
    } catch (e) {
      const msg = e.message || "";
      const isQuota = msg.includes("quota") || msg.includes("429");
      const isOverload = msg.includes("503") || msg.includes("overload") || msg.includes("UNAVAILABLE");
      if (!isQuota && !isOverload) captureActionError(e, "ai", "suggest_missions", "parent_stats");
      setAiError(isQuota ? "Limite da IA atingido. Tente novamente mais tarde ⏳" : isOverload ? "IA sobrecarregada no momento. Tente em alguns segundos ⏳" : "Erro ao gerar sugestões. Tente novamente.");
    }
    setAiLoading(null);
  };

  const generateReport = async () => {
    if (familyPlan === "free") { setShowUpgrade(true); return; }
    if (children.length === 0) return notify("Adicione um filho primeiro!", "error");
    setAiLoading("report"); setAiMissions([]); setAiError(null);
    try {
      const rawReport = await callAI("weekly_report", {
        familyName: profile.display_name,
        children: children.map(c => ({
          name: c.display_name, age: c.age, xp: c.xp, kidcoins: c.kidcoins, streak: c.streak,
        })),
      });
      const report = (rawReport || "")
        .replace(/^#{1,3}\s*/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/^-\s+/gm, "• ");
      setAiReport(report);
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("premium_required")) { setShowUpgrade(true); setAiLoading(null); return; }
      const isQuota = msg.includes("quota") || msg.includes("429");
      const isOverload = msg.includes("503") || msg.includes("overload") || msg.includes("UNAVAILABLE");
      if (!isQuota && !isOverload) captureActionError(e, "ai", "weekly_report", "parent_stats");
      setAiError(isQuota ? "Limite da IA atingido. Tente novamente mais tarde ⏳" : isOverload ? "IA sobrecarregada no momento. Tente em alguns segundos ⏳" : "Erro ao gerar relatório. Tente novamente.");
    }
    setAiLoading(null);
  };

  const addAIMission = async (m) => {
    if (addingAIMission) return;
    setAddingAIMission(m.title);
    try {
      const { data, error } = await supabase.rpc("create_mission", {
        p_title: m.title, p_emoji: m.emoji,
        p_coins_reward: m.coins_reward, p_xp_reward: m.xp_reward, p_frequency: m.frequency || "daily",
      });
      if (error) {
        if (isLimitError(error.message)) { setShowUpgrade(true); return; }
        captureActionError(error, "ai", "create_suggested_mission", "parent_stats");
        notify("Erro ao criar missão: " + error.message, "error");
        return;
      }
      if (data?.success === false) {
        if (isLimitError(data.error || "")) { setShowUpgrade(true); return; }
        notify(data.error || "Erro ao criar missão", "error");
        return;
      }
      notify(`✅ "${m.title}" adicionada!`);
      setAiMissions(prev => prev.filter(x => x.title !== m.title));
      load();
    } finally {
      setAddingAIMission(null);
    }
  };

  const navTabs = [
    { key: "home", icon: "🏠", label: "Início" },
    { key: "missions", icon: "🎯", label: "Missões" },
    { key: "rewards", icon: "🎁", label: "Recompensas", mobileLabel: "Prêmios" },
    { key: "stats", icon: "📊", label: "Estatísticas", mobileLabel: "Progresso" },
    { key: "settings", icon: "⚙️", label: "Conta" },
  ];
  const activeTab = navTabs.find(item => item.key === tab) || navTabs[0];
  const managedChild = children.find(child => child.id === managedChildId) || null;
  const selectParentTab = (nextTab) => {
    setManagedChildId(null);
    setTab(nextTab);
  };
  const requestedRedemptions = redemptions.filter(redemption => redemption.status === "requested");
  const deliveryRedemptions = redemptions.filter(redemption => redemption.status === "approved");
  const activeRewards = rewards.filter(reward => reward.is_active !== false);
  const inactiveRewards = rewards.filter(reward => reward.is_active === false);
  const familyMissionTotal = children.length * missions.length;
  const familyMissionsDone = children.reduce((sum, child) => (
    sum + missions.filter(mission => getChildLog(child.id, mission.id, mission.frequency)?.status === "approved").length
  ), 0);
  const familyProgress = familyMissionTotal ? familyMissionsDone / familyMissionTotal : 0;
  const familyProgressPercent = Math.round(familyProgress * 100);
  const familyCoins = children.reduce((sum, child) => sum + (child.kidcoins || 0), 0);
  const familyLeader = [...children].sort((left, right) => (right.streak || 0) - (left.streak || 0))[0];
  const childInsights = children.map(child => {
    const completed = missions.filter(mission => getChildLog(child.id, mission.id, mission.frequency)?.status === "approved").length;
    const total = missions.length;
    return {
      child,
      completed,
      total,
      progress: total ? Math.round((completed / total) * 100) : 0,
    };
  });
  const attentionCount = pending.length + requestedRedemptions.length + deliveryRedemptions.length;
  const missionLimitReached = familyPlan !== "premium" && missions.length >= PLAN_LIMITS.free.activeMissions;
  const rewardLimitReached = familyPlan !== "premium" && activeRewards.length >= PLAN_LIMITS.free.activeRewards;
  const redemptionAge = (redemption) => {
    const days = Math.floor((viewOpenedAt - new Date(redemption.created_at).getTime()) / 86400000);
    return days <= 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
  };
  const redemptionChildName = (redemption) => redemption.child_name || children.find(child => child.id === redemption.child_id)?.display_name || "";
  const summaryItems = [
    pending.length > 0 && { icon: "⏳", text: `${pending.length} p/ aprovar`, tone: "attention" },
    requestedRedemptions.length > 0 && { icon: "🙋", text: `${requestedRedemptions.length} resgate${requestedRedemptions.length > 1 ? "s" : ""}`, tone: "request" },
    activeTimers.length > 0 && { icon: "⏱️", text: `${activeTimers.length} em andamento`, tone: "timer" },
    { icon: "👶", text: `${children.length} filho${children.length !== 1 ? "s" : ""}`, tone: "family" },
  ].filter(Boolean);
  const jumpToPending = () => {
    setManagedChildId(null);
    setTab("home");
    window.setTimeout(() => pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <div className="ru-parent-shell" data-theme={parentTheme} data-managed-child={Boolean(managedChild)}>
      <a className="ru-parent-skip-link" href="#ru-parent-content">Pular para o conteúdo</a>
      <Notif msg={notif} type={notifType} />

      {showReportIssue && <ReportIssueModal theme={parentTheme} onClose={() => setShowReportIssue(false)} />}

      {/* Modal upgrade */}
      {showUpgrade && <UpgradeModal theme={parentTheme} onClose={() => setShowUpgrade(false)} userEmail={myEmail} onClaim={() => claimPremium(false)} />}

      {/* Modal adicionar filho */}
      {showAddChild && (
        <AddChildModal
          onAdd={() => { setShowAddChild(false); load(); notify("👶 Filho(a) adicionado com sucesso!"); }}
          onClose={() => setShowAddChild(false)}
        />
      )}

      {/* Modal editar filho */}
      {editingChild && (
        <EditChildModal
          child={editingChild}
          onSave={() => { setEditingChild(null); load(); notify("✅ Dados salvos!"); }}
          onDelete={() => { setEditingChild(null); load(); notify("🗑️ Criança removida."); }}
          onClose={() => setEditingChild(null)}
        />
      )}

      {/* Modal extrato */}
      {extratoTarget && (
        <ExtratoModal
          child={extratoTarget}
          onClose={() => setExtratoTarget(null)}
        />
      )}

      {/* Modal tropeço */}
      {demeritTarget && (
        <DemeritModal
          child={demeritTarget}
          onApply={applyDemerit}
          onClose={() => setDemeritTarget(null)}
        />
      )}

      {/* Modal resgatar em nome do filho */}
      {redeemTarget && (
        <RedeemForChildModal
          child={redeemTarget}
          rewards={rewards}
          redeemingFor={redeemingFor}
          onRedeem={redeemForChild}
          onClose={() => setRedeemTarget(null)}
        />
      )}

      {/* Modal editar missão */}
      {editingMission && (() => {
        const m = editingMission;
        const MISSION_EMOJI_CATS = {
          "⭐ Destaque":   ["⭐","🌟","💪","🔥","🏆","🥇","🎯","✅","💫","🆙","🎖️","🚀"],
          "🏠 Casa":       ["🧹","🍽️","🛁","🛏️","🧺","🗑️","🧽","🪣","🫧","🚿","🪴","🔧","🪟","🧴","🫙","🥘","🍳","🫕"],
          "📚 Escola":     ["📚","✏️","📖","🔬","🎒","📝","🖊️","📐","📏","💻","🔭","🧮","📓","🗂️","🖋️","📌"],
          "⚽ Esportes":   ["⚽","🏀","🎾","🏊","🚴","🤸","🥊","🏋️","🏃","🥋","🛹","🎽","🤾","🏄","⛹️","🧗","🏇","🎿","🏸","🥅"],
          "🐾 Animais":    ["🐕","🐈","🐠","🐇","🐢","🦜","🐾","🐱","🐶","🦁","🐯","🦊","🐻","🐼","🐨","🦋","🐸","🦮","🐹","🐰","🐧","🦅","🦔","🐬","🦈"],
          "🥗 Saúde":      ["🥗","🥤","💊","🦷","😴","🧘","🌻","💧","🥦","🍎","🥕","🌿","🫀","🏃‍♂️","🧴","🛌","🫁"],
          "🎨 Arte":       ["🎨","🎵","🎸","🖌️","🎭","🎬","🎤","✂️","🧩","🎻","🥁","🎹","📸","🎼","🖍️","🎪"],
        };
        return (
          <MissionModal
            mission={m}
            emojiCategories={MISSION_EMOJI_CATS}
            onSave={async (data) => {
              const { data: updatedMission, error } = await supabase.rpc("update_mission", {
                p_mission_id: m.id, p_title: data.title, p_emoji: data.emoji,
                p_coins_reward: data.coins_reward, p_xp_reward: data.xp_reward, p_frequency: data.frequency,
              });
              if (error) {
                captureActionError(error, "mission", "update", "parent_missions");
                notify("Erro ao atualizar: " + error.message, "error");
                return false;
              }
              if (updatedMission?.success === false) {
                notify(updatedMission.error || "Não foi possível atualizar a missão.", "error");
                return false;
              }
              const { error: durationError } = await supabase.rpc("set_mission_duration", {
                p_mission_id: m.id,
                p_minutes: data.duration_minutes,
              });
              if (durationError) {
                captureActionError(durationError, "mission", "set_duration", "parent_missions");
                notify("Dados atualizados, mas a duração não foi salva. Tente novamente.", "error");
                return false;
              }
              setEditingMission(null); load(); notify("✅ Missão atualizada!");
              return true;
            }}
            onDeactivate={async () => {
              const { error } = await supabase.rpc("deactivate_mission", { p_mission_id: m.id });
              if (error) { notify("Erro ao remover: " + error.message, "error"); return false; }
              setEditingMission(null); load(); notify("🗑️ Missão removida.");
              return true;
            }}
            onClose={() => setEditingMission(null)}
          />
        );
      })()}

      {/* Modal editar recompensa */}
      {editingReward && (() => {
        const r = editingReward;
        const REWARD_EMOJI_CATS = {
          "🎁 Geral":      ["🎁","🏆","🥇","🌟","✨","🎊","🎉","👑","💎","🎀","🎖️","🌈"],
          "🍕 Comida":     ["🍕","🍦","🍫","🧁","🍿","🥤","🍔","🍟","🌮","🍰","🎂","🍩","🍪","🥐","🍜","🍣","🧇","🥞","🍉","🍓"],
          "🎮 Diversão":   ["🎮","🎬","🎡","🎠","🎪","🎢","🎲","🃏","🧸","🎳","🎯","🕹️","🎭","🎟️","🎈","🎆"],
          "⚽ Esportes":   ["⚽","🏀","🎾","🏊","🚴","⛸️","🎽","🏖️","🧗","🤿","🥋","🎿","🏸","🛹","🤸","🏄"],
          "🛍️ Compras":    ["🛍️","👟","👕","🎒","📱","⌚","🎧","📚","🖊️","🎨","🧢","👗","🕶️","🎠","💄","🧣"],
          "🌟 Especial":   ["🚀","✈️","🏕️","🎤","🎸","🎻","🧳","🗺️","🎆","🎇","🌅","🎠","🛳️","🏰","🎡","🌃"],
        };
        return (
          <RewardModal
            reward={r}
            emojiCategories={REWARD_EMOJI_CATS}
            onSave={async (data) => {
              const { data: updatedReward, error } = await supabase.rpc("update_reward", {
                p_reward_id: r.id, p_title: data.title, p_emoji: data.emoji, p_coin_cost: data.coin_cost,
              });
              if (error) {
                captureActionError(error, "reward", "update", "parent_rewards");
                notify("Erro ao atualizar: " + error.message, "error");
                return false;
              }
              if (updatedReward?.success === false) {
                notify(updatedReward.error || "Não foi possível atualizar a recompensa.", "error");
                return false;
              }
              const { error: durationError } = await supabase.rpc("set_reward_duration", {
                p_reward_id: r.id,
                p_minutes: data.duration_minutes,
              });
              if (durationError) {
                captureActionError(durationError, "reward", "set_duration", "parent_rewards");
                notify("Dados atualizados, mas a duração não foi salva. Tente novamente.", "error");
                return false;
              }
              setEditingReward(null); load(); notify("✅ Recompensa atualizada!");
              return true;
            }}
            onDeactivate={async () => {
              const { error } = await supabase.rpc("deactivate_reward", { p_reward_id: r.id });
              if (error) {
                captureActionError(error, "reward", "deactivate", "parent_rewards");
                notify("Erro ao remover: " + error.message, "error");
                return false;
              }
              setEditingReward(null); load(); notify("🗑️ Recompensa removida.");
              return true;
            }}
            onClose={() => setEditingReward(null)}
          />
        );
      })()}

      {/* Navegação desktop; os fluxos internos continuam isolados na área de trabalho. */}
      {isDesktop && (
        <aside className="ru-parent-sidebar" aria-label="Navegação principal">
          <div className="ru-parent-brand" aria-label="RotinUp">
            <span className="ru-parent-brand__mark" aria-hidden="true">🚀</span>
            <span className="ru-parent-brand__name">rotin<strong>up</strong></span>
          </div>
          <span className="ru-parent-sidebar__label">Painel da família</span>
          <nav className="ru-parent-nav">
            {navTabs.map(item => (
              <button
                key={item.key}
                type="button"
                className="ru-parent-nav__item"
                aria-current={!managedChild && tab === item.key ? "page" : undefined}
                onClick={() => selectParentTab(item.key)}
              >
                <span className="ru-parent-nav__icon" aria-hidden="true">{item.icon}</span>
                <span className="ru-parent-nav__text">{item.label}</span>
              </button>
            ))}
          </nav>
          {pending.length > 0 && (
            <button type="button" className="ru-parent-pending-link" onClick={jumpToPending}>
              ⏳ {pending.length} pendente{pending.length > 1 ? "s" : ""}
            </button>
          )}
          <div className="ru-parent-sidebar__footer">
            <span className="ru-parent-plan-label">Plano atual</span>
            <span className="ru-parent-plan-value" data-plan={familyPlan}>
              {familyPlan === "premium" ? "Premium" : "Gratuito"}
            </span>
          </div>
        </aside>
      )}

      <div className="ru-parent-main">

      <header className="ru-parent-topbar">
        <div className="ru-parent-topbar__inner">
          <div className="ru-parent-topbar__primary">
            <div className="ru-parent-title">
              <span className="ru-parent-title__eyebrow">{managedChild ? "Modo acompanhado" : `${getSaudacao()}, ${profile.display_name}`}</span>
              <h1>{managedChild ? `Rotina de ${managedChild.display_name}` : activeTab.label}</h1>
            </div>
            <div className="ru-parent-family-status" aria-label={`${children.length} filho${children.length !== 1 ? "s" : ""} no plano ${familyPlan === "premium" ? "Premium" : "Gratuito"}`}>
              {children.length > 0 && (
                <div className="ru-parent-family-status__avatars" aria-hidden="true">
                  {children.slice(0, 3).map(child => (
                    <AvatarImg key={child.id} value={child.avatar_emoji} size={34} radius={8} style={{ background: "#ffffff" }} />
                  ))}
                </div>
              )}
              <div className="ru-parent-family-status__copy">
                <strong>{children.length} filho{children.length !== 1 ? "s" : ""}</strong>
                <span>Plano {familyPlan === "premium" ? "Premium" : "Gratuito"}</span>
              </div>
            </div>
          </div>
          <div className="ru-parent-topbar__secondary">
            <div className="ru-parent-summary" aria-label="Resumo da família">
              {summaryItems.map(item => (
                <span key={`${item.tone}-${item.text}`} className="ru-parent-summary__item" data-tone={item.tone}>
                  <span aria-hidden="true">{item.icon}</span>{item.text}
                </span>
              ))}
            </div>
            <div className="ru-parent-topbar__actions">
              <button
                type="button"
                className="ru-parent-theme-toggle"
                onClick={() => setParentTheme(theme => theme === "dark" ? "light" : "dark")}
                aria-pressed={parentTheme === "dark"}
                aria-label={parentTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
                title={parentTheme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              >
                <span aria-hidden="true">{parentTheme === "dark" ? "☀" : "☾"}</span>
                <span className="ru-parent-theme-toggle__label">{parentTheme === "dark" ? "Claro" : "Escuro"}</span>
              </button>
              {pending.length > 0 && (
                <button type="button" className="ru-parent-action ru-parent-action--pending" onClick={jumpToPending}>
                  ⏳ <span className="ru-parent-action__long-label">Ver </span>{pending.length}
                </button>
              )}
              {familyPlan === "free" && children.length >= 1 && (
                <button type="button" className="ru-parent-action ru-parent-action--upgrade" onClick={() => setShowUpgrade(true)}>
                  👑 <span className="ru-parent-action__long-label">Conhecer </span>Premium
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="ru-parent-content" ref={contentRef} className="ru-parent-workspace" data-tab={managedChild ? "child" : tab} tabIndex={-1}>
        <div className="ru-parent-workspace__inner">
        {loading ? <div className="ru-parent-loading" role="status">Carregando... ⏳</div> : loadError ? <LoadErrorBlock onRetry={load} tone={parentTheme} /> : managedChild ? (
          <ManagedChildView
            key={managedChild.id}
            child={managedChild}
            missions={missions}
            rewards={rewards}
            redemptions={redemptions}
            activeTimers={activeTimers}
            checkingMission={checkingMission}
            redeemingFor={redeemingFor}
            timerBusy={timerBusy}
            theme={parentTheme}
            getLog={getChildLog}
            countLogs={countChildLogsInPeriod}
            onComplete={parentCheck}
            onRedeem={redeemForChild}
            onStartTimer={startTimer}
            onPauseTimer={pauseTimer}
            onFinishTimer={finishTimer}
            onEdit={() => setEditingChild(managedChild)}
            onStatement={() => setExtratoTarget(managedChild)}
            onBack={() => setManagedChildId(null)}
            section={managedChildSection}
            onSectionChange={setManagedChildSection}
          />
        ) : <>

          {/* HOME */}
          {tab === "home" && (
            <div className="ru-parent-home">
              <section className="ru-home-overview" aria-labelledby="ru-home-overview-title">
                <div className="ru-home-overview__progress">
                  <span className="ru-home-kicker">Hoje na família</span>
                  <h2 id="ru-home-overview-title">Rotina de hoje</h2>
                  <p>{children.length > 0 ? "Acompanhe o que já foi concluído e o que ainda precisa de atenção." : "Cadastre a primeira criança para começar a organizar a rotina."}</p>
                  <div className="ru-home-overview__score">
                    <strong>{familyMissionsDone}<span>/{familyMissionTotal}</span></strong>
                    <span>missões concluídas</span>
                  </div>
                  <div
                    className="ru-home-progress"
                    role="progressbar"
                    aria-label="Progresso das missões da família hoje"
                    aria-valuemin={0}
                    aria-valuemax={familyMissionTotal || 1}
                    aria-valuenow={familyMissionsDone}
                  >
                    <span style={{ width: `${familyProgress * 100}%` }} />
                  </div>
                  {children.length === 0 && (
                    <button type="button" className="ru-home-button ru-home-button--primary" onClick={tryAddChild}>Adicionar primeira criança</button>
                  )}
                </div>
                <dl className="ru-home-overview__stats">
                  <div><dt>KidCoins</dt><dd>🪙 {familyCoins}</dd></div>
                  <div><dt>Precisam de atenção</dt><dd>{attentionCount}</dd></div>
                  <div><dt>Em andamento</dt><dd>{activeTimers.length}</dd></div>
                  <div><dt>Maior sequência</dt><dd>{familyLeader && (familyLeader.streak || 0) > 0 ? `🔥 ${familyLeader.streak}d` : "—"}</dd></div>
                </dl>
              </section>

              {activeTimers.length > 0 && (
                <section className="ru-home-section" aria-labelledby="ru-home-timers-title">
                  <header className="ru-home-section__header">
                    <div>
                      <span className="ru-home-kicker">Recompensas de tempo</span>
                      <h2 id="ru-home-timers-title">Cronômetros em andamento</h2>
                    </div>
                    <span className="ru-home-count">{activeTimers.length}</span>
                  </header>
                  <div className="ru-home-timer-list">
                    {activeTimers.map(timer => (
                      <article key={timer.id} className="ru-home-timer-card">
                        <span className="ru-home-item-icon" aria-hidden="true">{timer.reward_emoji || "🎮"}</span>
                        <div className="ru-home-item-copy">
                          <strong>{timer.reward_title}</strong>
                          <span>{timer.child_name || children.find(child => child.id === timer.child_id)?.display_name || "Criança"}</span>
                        </div>
                        <TimerControl t={timer} onStart={startTimer} onPause={pauseTimer} onFinish={finishTimer} busy={timerBusy === timer.id} tone={parentTheme} />
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section ref={pendingRef} className="ru-home-section ru-home-attention" aria-labelledby="ru-home-attention-title">
                <header className="ru-home-section__header">
                  <div>
                    <span className="ru-home-kicker">Central de ações</span>
                    <h2 id="ru-home-attention-title">Precisam da sua atenção</h2>
                  </div>
                  <span className="ru-home-count" data-empty={attentionCount === 0}>{attentionCount}</span>
                </header>

                {attentionCount === 0 ? (
                  <div className="ru-home-empty">
                    <span aria-hidden="true">✓</span>
                    <div><strong>Tudo em dia</strong><p>Não há missões ou resgates aguardando uma ação sua.</p></div>
                  </div>
                ) : (
                  <div className="ru-home-queue-grid">
                    {requestedRedemptions.map(redemption => {
                      const busy = confirmingRed === redemption.id || cancellingRed === redemption.id;
                      const childName = redemptionChildName(redemption);
                      return (
                        <article key={redemption.id} className="ru-home-queue-card" data-kind="request">
                          <div className="ru-home-queue-card__body">
                            <span className="ru-home-item-icon" aria-hidden="true">{redemption.reward_emoji || "🎁"}</span>
                            <div className="ru-home-item-copy">
                              <span className="ru-home-item-label">Resgate solicitado</span>
                              <strong>{redemption.reward_title}</strong>
                              <span>{childName ? `${childName} · ` : ""}{redemptionAge(redemption)} · 🪙 {redemption.coin_cost}</span>
                            </div>
                          </div>
                          <div className="ru-home-card-actions">
                            <button type="button" className="ru-home-button ru-home-button--approve" onClick={() => approveRedemption(redemption.id)} disabled={busy} aria-busy={confirmingRed === redemption.id}>{confirmingRed === redemption.id ? "Aprovando..." : "✓ Aprovar"}</button>
                            <button type="button" className="ru-home-button ru-home-button--reject" data-confirming={confirmCancelRed === redemption.id} onClick={() => confirmCancelRed === redemption.id ? cancelRedemption(redemption.id) : setConfirmCancelRed(redemption.id)} disabled={busy} aria-busy={cancellingRed === redemption.id}>{cancellingRed === redemption.id ? "Recusando..." : confirmCancelRed === redemption.id ? "Confirmar recusa" : "Recusar"}</button>
                          </div>
                        </article>
                      );
                    })}

                    {deliveryRedemptions.map(redemption => {
                      const busy = confirmingRed === redemption.id || cancellingRed === redemption.id;
                      const childName = redemptionChildName(redemption);
                      return (
                        <article key={redemption.id} className="ru-home-queue-card" data-kind="delivery">
                          <div className="ru-home-queue-card__body">
                            <span className="ru-home-item-icon" aria-hidden="true">{redemption.reward_emoji || "🎁"}</span>
                            <div className="ru-home-item-copy">
                              <span className="ru-home-item-label">Aguardando entrega</span>
                              <strong>{redemption.reward_title}</strong>
                              <span>{childName ? `${childName} · ` : ""}{redemptionAge(redemption)} · 🪙 {redemption.coin_cost}</span>
                            </div>
                          </div>
                          <div className="ru-home-card-actions">
                            <button type="button" className="ru-home-button ru-home-button--approve" onClick={() => confirmDelivery(redemption.id)} disabled={busy} aria-busy={confirmingRed === redemption.id}>{confirmingRed === redemption.id ? "Confirmando..." : "✓ Marcar entregue"}</button>
                            <button type="button" className="ru-home-button ru-home-button--reject" data-confirming={confirmCancelRed === redemption.id} onClick={() => confirmCancelRed === redemption.id ? cancelRedemption(redemption.id) : setConfirmCancelRed(redemption.id)} disabled={busy} aria-busy={cancellingRed === redemption.id}>{cancellingRed === redemption.id ? "Cancelando..." : confirmCancelRed === redemption.id ? "Confirmar cancelamento" : "Cancelar"}</button>
                          </div>
                        </article>
                      );
                    })}

                    {pending.map(item => {
                      const reviewing = reviewingLog === item.log_id;
                      const busy = Boolean(reviewingLog);
                      return (
                        <article key={item.log_id} className="ru-home-queue-card" data-kind="mission">
                          <div className="ru-home-queue-card__body">
                            <span className="ru-home-item-icon" aria-hidden="true">{item.mission_emoji}</span>
                            <div className="ru-home-item-copy">
                              <span className="ru-home-item-label">Missão para revisar</span>
                              <strong>{item.mission_title}</strong>
                              <span className="ru-home-child-line"><AvatarImg value={item.child_avatar} size={20} radius={6} />{item.child_name} · 🪙 {item.coins_reward}</span>
                              {item.occurrence > 1 && <span className="ru-home-occurrence">↻ {item.occurrence}ª vez {item.mission_frequency === "daily" ? "hoje" : item.mission_frequency === "weekly" ? "na semana" : "no período"}</span>}
                            </div>
                          </div>
                          <div className="ru-home-card-actions">
                            <button type="button" className="ru-home-button ru-home-button--approve" onClick={() => review(item.log_id, true)} disabled={busy} aria-busy={reviewing} aria-label={`Aprovar ${item.mission_title}`}>{reviewing ? "Processando..." : "✓ Aprovar"}</button>
                            <button type="button" className="ru-home-button ru-home-button--reject" onClick={() => review(item.log_id, false)} disabled={busy} aria-busy={reviewing} aria-label={`Rejeitar ${item.mission_title}`}>{reviewing ? "Processando..." : "Rejeitar"}</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="ru-home-section" aria-labelledby="ru-home-children-title">
                <header className="ru-home-section__header">
                  <div>
                    <span className="ru-home-kicker">Acompanhamento</span>
                    <h2 id="ru-home-children-title">Meus filhos</h2>
                  </div>
                  <div className="ru-home-section__tools">
                    {familyPlan === "premium" && <span className="ru-home-plan-badge">Premium</span>}
                    <button type="button" className="ru-home-button ru-home-button--secondary" onClick={tryAddChild}>+ Adicionar</button>
                  </div>
                </header>

                {children.length === 0 ? (
                  <div className="ru-home-empty">
                    <span aria-hidden="true">👶</span>
                    <div><strong>Nenhuma criança cadastrada</strong><p>Use o botão acima para criar o primeiro perfil gerenciado.</p></div>
                  </div>
                ) : (
                  <div className="ru-home-children-grid">
                    {children.map(child => {
                      const level = getLvl(child.xp || 0);
                      const nextLevel = getNext(child.xp || 0);
                      const age = child.birth_date ? calcAge(child.birth_date) : child.age;
                      const doneToday = missions.filter(mission => getChildLog(child.id, mission.id, mission.frequency)?.status === "approved").length;
                      const totalToday = missions.length;
                      const progress = totalToday ? doneToday / totalToday : 0;
                      const allDone = totalToday > 0 && doneToday === totalToday;
                      return (
                        <article key={child.id} className="ru-home-child-card">
                          <header className="ru-home-child-card__header">
                            <XPRing size={62} stroke={4} pct={(nextLevel.xpNeeded - level.xpNeeded) ? ((child.xp || 0) - level.xpNeeded) / (nextLevel.xpNeeded - level.xpNeeded) : 0} color={level.color} trackColor="#DCE3ED">
                              <AvatarImg value={child.avatar_emoji} size={48} radius={24} style={{ background: "#F0F3F8" }} />
                            </XPRing>
                            <div className="ru-home-child-card__identity">
                              <div><h3>{child.display_name}</h3>{(child.streak || 0) > 0 && <span className="ru-home-streak">🔥 {child.streak}</span>}</div>
                              <p>{level.name} · 🪙 {child.kidcoins || 0}{age ? ` · ${age} anos` : ""}</p>
                            </div>
                            <button type="button" className="ru-home-child-edit" onClick={() => setEditingChild(child)} aria-label={`Editar perfil de ${child.display_name}`}>
                              <span aria-hidden="true">✏️</span>
                              Editar
                            </button>
                          </header>

                          {missions.length > 0 && (
                            <div className="ru-home-child-progress">
                              <div><span>Hoje</span><strong>{doneToday}/{totalToday}{allDone ? " ✓" : ""}</strong></div>
                              <div className="ru-home-progress" role="progressbar" aria-label={`Progresso de ${child.display_name} hoje`} aria-valuemin={0} aria-valuemax={totalToday} aria-valuenow={doneToday}><span style={{ width: `${progress * 100}%` }} /></div>
                            </div>
                          )}

                          <div className="ru-home-child-actions">
                            <div className="ru-home-child-actions__primary" role="group" aria-label={`Ações de acompanhamento de ${child.display_name}`}>
                              <button type="button" className="ru-home-child-action ru-home-child-action--routine" onClick={() => { setManagedChildSection("routine"); setManagedChildId(child.id); }}>
                                <span aria-hidden="true">🚀</span>
                                Abrir rotina
                              </button>
                              <button type="button" className="ru-home-child-action ru-home-child-action--statement" onClick={() => setExtratoTarget(child)}>
                                <span aria-hidden="true">📋</span>
                                Extrato
                              </button>
                              <button type="button" className="ru-home-child-action ru-home-child-action--reward" onClick={() => setRedeemTarget(child)}>
                                <span aria-hidden="true">🎁</span>
                                Resgatar
                              </button>
                            </div>
                            <div className="ru-home-child-actions__correction" role="group" aria-label={`Ações de correção de ${child.display_name}`}>
                              <button type="button" className="ru-home-child-action ru-home-child-action--demerit" onClick={() => setDemeritTarget(child)}>
                                <span aria-hidden="true">⚠️</span>
                                Registrar tropeço
                              </button>
                            </div>
                          </div>

                          {missions.length > 0 && (
                            <div className="ru-home-mission-list">
                              <h4>Marcar missões</h4>
                              {missions.map(mission => {
                                const log = getChildLog(child.id, mission.id, mission.frequency);
                                const done = log?.status === "approved";
                                const waiting = log?.status === "pending";
                                const key = `${child.id}-${mission.id}`;
                                const timesInPeriod = countChildLogsInPeriod(child.id, mission.id, mission.frequency);
                                return (
                                  <div key={mission.id} className="ru-home-mission-row" data-complete={done} data-waiting={waiting}>
                                    <span className="ru-home-mission-row__icon" aria-hidden="true">{done ? "✓" : mission.emoji}</span>
                                    <div><strong>{mission.title}</strong>{timesInPeriod > 1 && <span>↻ {timesInPeriod}ª vez {mission.frequency === "daily" ? "hoje" : "no período"}</span>}</div>
                                    {waiting ? (
                                      <span className="ru-home-waiting">Aguardando</span>
                                    ) : (
                                      <button type="button" onClick={() => parentCheck(child.id, mission.id)} disabled={checkingMission === key} aria-busy={checkingMission === key}>{checkingMission === key ? "..." : done ? "↻ De novo" : "✓ Marcar"}</button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="ru-home-invite" aria-labelledby="ru-home-invite-title">
                <header>
                  <span className="ru-home-item-icon" aria-hidden="true">🔗</span>
                  <div><h2 id="ru-home-invite-title">Convidar co-responsável</h2><p>Compartilhe um código temporário com outro adulto responsável.</p></div>
                  {familyPlan === "premium" && <span className="ru-home-plan-badge">Premium</span>}
                </header>
                {familyPlan === "free" ? (
                  <button type="button" className="ru-home-invite__locked" onClick={() => setShowUpgrade(true)}>🔒 Disponível no Premium · até {PLAN_LIMITS.premium.coParents} responsáveis</button>
                ) : inviteCode ? (
                  <div className="ru-home-invite__controls">
                    <code>{inviteCode}</code>
                    <button type="button" className="ru-home-button ru-home-button--secondary" onClick={copyCode}>{codeCopied ? "✓ Copiado" : "📋 Copiar"}</button>
                    <span data-expiring={Boolean(inviteExpiresAt && new Date(inviteExpiresAt).getTime() < viewOpenedAt + 3600000)}>⏱ {fmtExpiry(inviteExpiresAt) || "validade desconhecida"}</span>
                    <button type="button" className="ru-home-text-button" onClick={generateCode} disabled={inviteLoading}>{inviteLoading ? "Gerando..." : "↻ Novo código"}</button>
                  </div>
                ) : (
                  <button type="button" className="ru-home-button ru-home-button--secondary" onClick={generateCode} disabled={inviteLoading}>{inviteLoading ? "Gerando..." : "Gerar código de convite"}</button>
                )}
              </section>
            </div>
          )}

          {/* MISSIONS */}
          {tab === "missions" && (
            <div className="ru-missions-page">
              <section className="ru-missions-heading" aria-labelledby="ru-missions-title">
                <div>
                  <span className="ru-missions-kicker">Organização da rotina</span>
                  <h2 id="ru-missions-title">Missões da família</h2>
                  <p>{missions.length} ativa{missions.length !== 1 ? "s" : ""} · {inactiveMissions.length} arquivada{inactiveMissions.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="ru-missions-heading__actions">
                  {familyPlan === "free" && (
                    <button type="button" className="ru-missions-limit" data-limit-reached={missionLimitReached} onClick={() => setShowUpgrade(true)} aria-label={`${missions.length} de ${PLAN_LIMITS.free.activeMissions} missões ativas no plano gratuito`}>
                      {missions.length}/{PLAN_LIMITS.free.activeMissions} no Free{missionLimitReached ? " · limite" : ""}
                    </button>
                  )}
                  <button type="button" className="ru-missions-button ru-missions-button--primary" onClick={() => { if (missionLimitReached) { setShowUpgrade(true); return; } setShowMission(value => !value); }} aria-expanded={showMission} aria-controls="ru-new-mission-form">
                    {showMission ? "Fechar" : "+ Nova missão"}
                  </button>
                </div>
              </section>

              {showMission && (
                <form id="ru-new-mission-form" className="ru-mission-composer" onSubmit={event => { event.preventDefault(); void createMission(); }} aria-busy={creatingMission}>
                  <header><span className="ru-missions-kicker">Nova missão</span><h3>Defina a atividade</h3></header>

                  <fieldset className="ru-mission-emoji-picker">
                    <legend>Ícone</legend>
                    <div>
                      {["⭐","🎯","📚","🏃","🧹","🛁","🍽️","🐕","🌱","🎨","📖","💪","🎵","✏️","🦷","🛏️","🧺","🌍","🏊","🎤"].map(e => (
                        <button type="button" key={e} onClick={() => setNewM(previous => ({...previous, emoji:e}))} aria-label={`Usar ${e}`} aria-pressed={newM.emoji === e}>{e}</button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="ru-mission-field">
                    <label htmlFor="new-mission-title">Nome da missão</label>
                    <label className="ru-mission-title-input" htmlFor="new-mission-title"><span aria-hidden="true">{newM.emoji}</span><span className="sr-only">Nome da missão</span><input id="new-mission-title" value={newM.title} onChange={event => setNewM(previous => ({...previous, title:event.target.value}))} maxLength={60} required autoFocus /></label>
                  </div>

                  <fieldset className="ru-mission-frequency">
                    <legend>Frequência</legend>
                    <div>
                      {FREQ_OPTS.map(o => (
                        <button type="button" key={o.key} onClick={() => setNewM(previous => ({...previous, frequency:o.key}))} aria-pressed={newM.frequency === o.key}>
                          <span aria-hidden="true">{o.emoji}</span>{o.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="ru-mission-value-grid">
                    <div className="ru-mission-field"><label htmlFor="new-mission-coins">KidCoins</label><input id="new-mission-coins" type="number" value={newM.coins_reward === 0 ? "" : newM.coins_reward} placeholder="0" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setNewM(previous => ({...previous, coins_reward: event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0)}))} /></div>
                    <div className="ru-mission-field"><label htmlFor="new-mission-xp">XP</label><input id="new-mission-xp" type="number" value={newM.xp_reward === 0 ? "" : newM.xp_reward} placeholder="0" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setNewM(previous => ({...previous, xp_reward: event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0)}))} /></div>
                    <div className="ru-mission-field"><label htmlFor="new-mission-duration">Duração (min)</label><input id="new-mission-duration" type="number" value={newM.duration_minutes === 0 ? "" : newM.duration_minutes} placeholder="Sem timer" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setNewM(previous => ({...previous, duration_minutes: event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0)}))} /></div>
                  </div>

                  <div className="ru-mission-composer__actions">
                    <button type="submit" className="ru-missions-button ru-missions-button--primary" disabled={creatingMission || newM.title.trim().length < 2} aria-busy={creatingMission}>{creatingMission ? "Criando..." : "Criar missão"}</button>
                    <button type="button" className="ru-missions-button ru-missions-button--secondary" onClick={() => setShowMission(false)} disabled={creatingMission}>Cancelar</button>
                  </div>
                </form>
              )}

              <section className="ru-missions-active" aria-labelledby="ru-active-missions-title">
                <header><h3 id="ru-active-missions-title">Ativas</h3><span>{localMissions.length}</span></header>
                <span className="sr-only" aria-live="polite">{reorderStatus}</span>
                {localMissions.length === 0 ? (
                  <div className="ru-missions-empty"><span aria-hidden="true">🎯</span><strong>Nenhuma missão ativa</strong></div>
                ) : (
                  <ol className="ru-missions-list" aria-busy={orderingMissions}>
                    {localMissions.map((mission, index) => (
                      <li key={mission.id} className="ru-mission-card" data-mission-id={mission.id} data-dragging={dragMissionId === mission.id}
                        draggable={isDesktop && !orderingMissions}
                        onDragStart={event => { setDragMissionId(mission.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={event => handleDragOver(event, mission.id)}
                        onDragEnd={() => { void saveMissionOrder(localMissions); }}>
                        <span className="ru-mission-card__drag" aria-hidden="true">⠿</span>
                        <span className="ru-mission-card__emoji" aria-hidden="true">{mission.emoji}</span>
                        <div className="ru-mission-card__content">
                          <h4>{mission.title}</h4>
                          <div className="ru-mission-card__meta">
                            <span data-kind="frequency">{freqLabel(mission.frequency)}</span>
                            <span data-kind="coins">🪙 {mission.coins_reward}</span>
                            <span data-kind="xp">⚡ {mission.xp_reward} XP</span>
                            {mission.duration_minutes > 0 && <span data-kind="duration">⏱ {mission.duration_minutes} min</span>}
                          </div>
                        </div>
                        <div className="ru-mission-card__actions">
                          <div role="group" aria-label={`Alterar posição de ${mission.title}`}>
                            <button type="button" className="ru-mission-icon-button" onClick={() => moveMission(mission.id, -1)} disabled={orderingMissions || index === 0} aria-label={`Mover ${mission.title} para cima`}>↑</button>
                            <button type="button" className="ru-mission-icon-button" onClick={() => moveMission(mission.id, 1)} disabled={orderingMissions || index === localMissions.length - 1} aria-label={`Mover ${mission.title} para baixo`}>↓</button>
                          </div>
                          <button type="button" className="ru-missions-button ru-missions-button--edit" onClick={() => setEditingMission(mission)} disabled={orderingMissions} aria-label={`Editar ${mission.title}`}>✏️ <span>Editar</span></button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {inactiveMissions.length > 0 && (
                <section className="ru-missions-archive" aria-labelledby="ru-archived-missions-title">
                  <button type="button" className="ru-missions-archive__toggle" onClick={() => setShowArchivedMissions(value => !value)} aria-expanded={showArchivedMissions} aria-controls="ru-archived-missions-list">
                    <span><strong id="ru-archived-missions-title">Arquivadas</strong><small>{inactiveMissions.length === 1 ? "1 missão" : `${inactiveMissions.length} missões`}</small></span>
                    <span aria-hidden="true">{showArchivedMissions ? "−" : "+"}</span>
                  </button>
                  {showArchivedMissions && (
                    <div id="ru-archived-missions-list" className="ru-missions-archive__list">
                      {inactiveMissions.map(mission => (
                        <article key={mission.id} className="ru-mission-archived-card">
                          <span aria-hidden="true">{mission.emoji}</span>
                          <div><h4>{mission.title}</h4><p>{freqLabel(mission.frequency)} · 🪙 {mission.coins_reward} · ⚡ {mission.xp_reward} XP</p></div>
                          <button type="button" className="ru-missions-button ru-missions-button--secondary" onClick={() => reactivateMission(mission.id)} disabled={Boolean(reactivating)} aria-busy={reactivating === mission.id}>
                            {reactivating === mission.id ? "Reativando..." : missionLimitReached ? "Ver Premium" : "Reativar"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* REWARDS */}
          {tab === "rewards" && (
            <div className="ru-rewards-page">
              <section className="ru-rewards-heading" aria-labelledby="ru-rewards-title">
                <div><span className="ru-rewards-kicker">Catálogo e entregas</span><h2 id="ru-rewards-title">Recompensas da família</h2><p>{activeRewards.length} ativa{activeRewards.length !== 1 ? "s" : ""} · {inactiveRewards.length} arquivada{inactiveRewards.length !== 1 ? "s" : ""} · {requestedRedemptions.length + deliveryRedemptions.length} em andamento</p></div>
                <div className="ru-rewards-heading__actions">
                  {familyPlan !== "premium" && (
                    <button type="button" className="ru-rewards-limit" data-limit-reached={rewardLimitReached} onClick={() => setShowUpgrade(true)} aria-label={`${activeRewards.length} de ${PLAN_LIMITS.free.activeRewards} recompensas ativas no plano gratuito`}>
                      {activeRewards.length}/{PLAN_LIMITS.free.activeRewards} no Free{rewardLimitReached ? " · limite" : ""}
                    </button>
                  )}
                  <button type="button" className="ru-rewards-button ru-rewards-button--primary" onClick={() => { if (rewardLimitReached) { setShowUpgrade(true); return; } setShowReward(value => !value); }} aria-expanded={showReward} aria-controls="ru-new-reward-form">+ Nova recompensa</button>
                </div>
              </section>

              <section className="ru-redemptions" aria-labelledby="ru-redemptions-title">
                <header><div><span className="ru-rewards-kicker">Fluxo em três etapas</span><h3 id="ru-redemptions-title">Resgates em andamento</h3></div><span>{requestedRedemptions.length + deliveryRedemptions.length}</span></header>
                {requestedRedemptions.length + deliveryRedemptions.length === 0 ? (
                  <div className="ru-rewards-empty ru-rewards-empty--compact"><span aria-hidden="true">✓</span><strong>Nenhum resgate pendente</strong><p>Novos pedidos aparecerão aqui para aprovação e entrega.</p></div>
                ) : (
                  <div className="ru-redemptions-grid">
                    {requestedRedemptions.map(redemption => {
                      const busy = confirmingRed === redemption.id || cancellingRed === redemption.id;
                      const confirmingCancel = confirmCancelRed === redemption.id;
                      return (
                        <article key={redemption.id} className="ru-redemption-card" data-stage="requested">
                          <span className="ru-redemption-card__icon" aria-hidden="true">{redemption.reward_emoji || "🎁"}</span>
                          <div className="ru-redemption-card__content"><span className="ru-redemption-stage">Aguardando aprovação</span><h4>{redemption.reward_title}</h4><p>{redemptionChildName(redemption) || "Criança"} · {redemptionAge(redemption)} · 🪙 {redemption.coin_cost}</p></div>
                          <div className="ru-redemption-card__actions">
                            <button type="button" className="ru-rewards-button ru-rewards-button--approve" onClick={() => approveRedemption(redemption.id)} disabled={busy} aria-busy={confirmingRed === redemption.id}>{confirmingRed === redemption.id ? "Aprovando..." : "Aprovar"}</button>
                            <button type="button" className="ru-rewards-button ru-rewards-button--danger" data-confirming={confirmingCancel} onClick={() => confirmingCancel ? cancelRedemption(redemption.id) : setConfirmCancelRed(redemption.id)} disabled={busy} aria-busy={cancellingRed === redemption.id}>{cancellingRed === redemption.id ? "Recusando..." : confirmingCancel ? "Confirmar recusa" : "Recusar"}</button>
                          </div>
                        </article>
                      );
                    })}
                    {deliveryRedemptions.map(redemption => {
                      const busy = confirmingRed === redemption.id || cancellingRed === redemption.id;
                      const confirmingCancel = confirmCancelRed === redemption.id;
                      return (
                        <article key={redemption.id} className="ru-redemption-card" data-stage="approved">
                          <span className="ru-redemption-card__icon" aria-hidden="true">{redemption.reward_emoji || "🎁"}</span>
                          <div className="ru-redemption-card__content"><span className="ru-redemption-stage">Aguardando entrega</span><h4>{redemption.reward_title}</h4><p>{redemptionChildName(redemption) || "Criança"} · {redemptionAge(redemption)} · 🪙 {redemption.coin_cost}</p></div>
                          <div className="ru-redemption-card__actions">
                            <button type="button" className="ru-rewards-button ru-rewards-button--approve" onClick={() => confirmDelivery(redemption.id)} disabled={busy} aria-busy={confirmingRed === redemption.id}>{confirmingRed === redemption.id ? "Confirmando..." : "Marcar entregue"}</button>
                            <button type="button" className="ru-rewards-button ru-rewards-button--danger" data-confirming={confirmingCancel} onClick={() => confirmingCancel ? cancelRedemption(redemption.id) : setConfirmCancelRed(redemption.id)} disabled={busy} aria-busy={cancellingRed === redemption.id}>{cancellingRed === redemption.id ? "Cancelando..." : confirmingCancel ? "Confirmar cancelamento" : "Cancelar"}</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {showReward && (
                <form id="ru-new-reward-form" className="ru-reward-composer" onSubmit={event => { event.preventDefault(); void createReward(); }} aria-busy={creatingReward}>
                  <header><span className="ru-rewards-kicker">Novo item</span><h3>Criar recompensa</h3></header>
                  <fieldset className="ru-reward-emoji-picker"><legend>Ícone</legend><div>
                    {REWARD_EMOJIS.map(option => (
                      <button type="button" key={option} onClick={() => setNewR(previous => ({...previous, emoji:option}))} aria-pressed={newR.emoji === option} aria-label={`Usar ${option}`}>{option}</button>
                    ))}
                  </div></fieldset>
                  <label className="ru-reward-title-input" htmlFor="new-reward-title"><span aria-hidden="true">{newR.emoji}</span><span className="sr-only">Nome da recompensa</span><input id="new-reward-title" value={newR.title} onChange={event => setNewR(previous => ({...previous, title:event.target.value}))} maxLength={60} required autoFocus /></label>
                  <div className="ru-reward-value-grid">
                    <div className="ru-reward-field"><label htmlFor="new-reward-cost">Custo em KidCoins</label><input id="new-reward-cost" type="number" value={newR.coin_cost === 0 ? "" : newR.coin_cost} placeholder="0" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setNewR(previous => ({...previous, coin_cost: event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0)}))} /></div>
                    <div className="ru-reward-field"><label htmlFor="new-reward-duration">Duração (min)</label><input id="new-reward-duration" type="number" value={newR.duration_minutes === 0 ? "" : newR.duration_minutes} placeholder="Sem timer" min="0" inputMode="numeric" onFocus={event => event.target.select()} onChange={event => setNewR(previous => ({...previous, duration_minutes: event.target.value === "" ? 0 : Math.max(0, parseInt(event.target.value, 10) || 0)}))} /></div>
                  </div>
                  <div className="ru-reward-composer__actions">
                    <button type="submit" className="ru-rewards-button ru-rewards-button--primary" disabled={creatingReward || newR.title.trim().length < 2} aria-busy={creatingReward}>{creatingReward ? "Criando..." : "Criar recompensa"}</button>
                    <button type="button" className="ru-rewards-button ru-rewards-button--secondary" onClick={() => setShowReward(false)} disabled={creatingReward}>Cancelar</button>
                  </div>
                </form>
              )}

              <section className="ru-rewards-catalog" aria-labelledby="ru-active-rewards-title">
                <header><h3 id="ru-active-rewards-title">Catálogo ativo</h3><span>{activeRewards.length}</span></header>
                {activeRewards.length === 0 ? (
                  <div className="ru-rewards-empty"><span aria-hidden="true">🎁</span><strong>Nenhuma recompensa ativa</strong><p>Crie opções que façam sentido para a rotina da família.</p></div>
                ) : (
                  <div className="ru-rewards-grid">
                    {activeRewards.map(reward => (
                      <article key={reward.id} className="ru-reward-card">
                        <span className="ru-reward-card__emoji" aria-hidden="true">{reward.emoji}</span>
                        <div className="ru-reward-card__content"><h4>{reward.title}</h4><div><span data-kind="cost">🪙 {reward.coin_cost}</span>{reward.duration_minutes > 0 && <span data-kind="duration">⏱ {reward.duration_minutes} min</span>}</div></div>
                        <button type="button" className="ru-rewards-button ru-rewards-button--edit" onClick={() => setEditingReward(reward)} aria-label={`Editar ${reward.title}`}>✏️ <span>Editar</span></button>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {inactiveRewards.length > 0 && (
                <section className="ru-rewards-archive" aria-labelledby="ru-archived-rewards-title">
                  <button type="button" className="ru-rewards-archive__toggle" onClick={() => setShowArchivedRewards(value => !value)} aria-expanded={showArchivedRewards} aria-controls="ru-archived-rewards-list">
                    <span><strong id="ru-archived-rewards-title">Arquivadas</strong><small>{inactiveRewards.length === 1 ? "1 recompensa" : `${inactiveRewards.length} recompensas`}</small></span><span aria-hidden="true">{showArchivedRewards ? "−" : "+"}</span>
                  </button>
                  {showArchivedRewards && (
                    <div id="ru-archived-rewards-list" className="ru-rewards-archive__list">
                      {inactiveRewards.map(reward => (
                        <article key={reward.id} className="ru-reward-archived-card">
                          <span aria-hidden="true">{reward.emoji}</span><div><h4>{reward.title}</h4><p>🪙 {reward.coin_cost}{reward.duration_minutes > 0 ? ` · ⏱ ${reward.duration_minutes} min` : ""}</p></div>
                          <button type="button" className="ru-rewards-button ru-rewards-button--secondary" onClick={() => reactivateReward(reward.id)} disabled={Boolean(reactivating)} aria-busy={reactivating === reward.id}>{reactivating === reward.id ? "Reativando..." : rewardLimitReached ? "Ver Premium" : "Reativar"}</button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* STATS */}
          {tab === "stats" && (
            <div className="ru-insights-page">
              <header className="ru-account-heading">
                <div>
                  <span className="ru-account-kicker">Visão da família</span>
                  <h2>Estatísticas</h2>
                  <p>Acompanhe o ritmo de hoje e use os dados para ajustar a rotina.</p>
                </div>
                <span className="ru-account-heading__plan" data-plan={familyPlan}>{familyPlan === "premium" ? "Premium" : "Gratuito"}</span>
              </header>

              <dl className="ru-insights-metrics" aria-label="Resumo da família">
                <div data-tone="progress"><dt>Progresso de hoje</dt><dd>{familyProgressPercent}%</dd><span aria-hidden="true">✓</span></div>
                <div data-tone="coins"><dt>KidCoins disponíveis</dt><dd>{familyCoins}</dd><span aria-hidden="true">●</span></div>
                <div data-tone="attention"><dt>Ações pendentes</dt><dd>{attentionCount}</dd><span aria-hidden="true">!</span></div>
                <div data-tone="missions"><dt>Missões ativas</dt><dd>{missions.length}</dd><span aria-hidden="true">★</span></div>
              </dl>

              <section className="ru-insights-family" aria-labelledby="ru-family-progress-title">
                <div className="ru-insights-family__progress">
                  <span className="ru-account-kicker">Hoje</span>
                  <h3 id="ru-family-progress-title">Ritmo da família</h3>
                  <p>{familyMissionTotal > 0 ? `${familyMissionsDone} de ${familyMissionTotal} missões concluídas.` : "Cadastre missões para começar a medir o progresso."}</p>
                  <div className="ru-insights-progress" role="progressbar" aria-label="Progresso das missões da família" aria-valuemin={0} aria-valuemax={100} aria-valuenow={familyProgressPercent}>
                    <span style={{ width: `${familyProgressPercent}%` }} />
                  </div>
                </div>
                <div className="ru-insights-family__leader">
                  <span>Maior sequência</span>
                  <strong>{familyLeader && (familyLeader.streak || 0) > 0 ? `${familyLeader.streak} dias` : "Sem sequência"}</strong>
                  <small>{familyLeader && (familyLeader.streak || 0) > 0 ? familyLeader.display_name : "A primeira começa hoje"}</small>
                </div>
              </section>

              <section className="ru-insights-children" aria-labelledby="ru-child-progress-title">
                <header><div><span className="ru-account-kicker">Por criança</span><h3 id="ru-child-progress-title">Progresso individual</h3></div><span>{children.length}</span></header>
                {childInsights.length === 0 ? (
                  <div className="ru-account-empty"><strong>Nenhuma criança cadastrada</strong><p>Adicione a primeira criança para acompanhar o progresso individual.</p></div>
                ) : (
                  <div className="ru-insights-children__list">
                    {childInsights.map(({ child, completed, total, progress }) => (
                      <article key={child.id} className="ru-child-insight">
                        <AvatarImg value={child.avatar_emoji} size={44} radius={12} />
                        <div className="ru-child-insight__main">
                          <div><strong>{child.display_name}</strong><span>{completed}/{total || 0} hoje</span></div>
                          <div className="ru-insights-progress" role="progressbar" aria-label={`Progresso de ${child.display_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
                        </div>
                        <dl><div><dt>KidCoins</dt><dd>{child.kidcoins || 0}</dd></div><div><dt>Sequência</dt><dd>{child.streak || 0}d</dd></div></dl>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="ru-insights-ai" aria-labelledby="ru-ai-title" aria-busy={Boolean(aiLoading)}>
                <header>
                  <div className="ru-insights-ai__icon" aria-hidden="true">✦</div>
                  <div><span className="ru-account-kicker">Apoio inteligente</span><h3 id="ru-ai-title">Assistente de rotina</h3><p>{familyPlan === "premium" ? "Até 200 solicitações de IA por dia." : "Até 40 solicitações de IA por dia; relatório semanal no Premium."}</p></div>
                </header>
                <div className="ru-insights-ai__actions">
                  <button type="button" className="ru-account-button ru-account-button--secondary" onClick={suggestMissions} disabled={Boolean(aiLoading)} aria-busy={aiLoading === "missions"}>{aiLoading === "missions" ? "Gerando sugestões..." : "Sugerir missões"}</button>
                  <button type="button" className="ru-account-button ru-account-button--info" onClick={generateReport} disabled={Boolean(aiLoading)} aria-busy={aiLoading === "report"}>{aiLoading === "report" ? "Gerando relatório..." : familyPlan === "premium" ? "Gerar relatório semanal" : "Relatório semanal · Premium"}</button>
                </div>

                {aiError && <div className="ru-insights-ai__error" role="alert"><span>{aiError}</span><button type="button" onClick={() => setAiError(null)} aria-label="Fechar erro">×</button></div>}

                {aiMissions.length > 0 && (
                  <div ref={aiResultsRef} className="ru-ai-results" aria-live="polite">
                    <header><h4>Sugestões prontas</h4><span>Revise antes de adicionar</span></header>
                    {aiMissions.map((mission, index) => (
                      <article key={`${mission.title}-${index}`} className="ru-ai-mission">
                        <span className="ru-ai-mission__emoji" aria-hidden="true">{mission.emoji}</span>
                        <div><strong>{mission.title}</strong><p>🪙 {mission.coins_reward} · +{mission.xp_reward} XP</p></div>
                        <button type="button" className="ru-account-button ru-account-button--success" onClick={() => addAIMission(mission)} disabled={Boolean(addingAIMission)} aria-busy={addingAIMission === mission.title}>{addingAIMission === mission.title ? "Adicionando..." : "Adicionar"}</button>
                      </article>
                    ))}
                  </div>
                )}

                {aiReport && (
                  <article className="ru-ai-report" aria-live="polite">
                    <header><h4>Relatório semanal</h4><button type="button" onClick={() => setAiReport(null)} aria-label="Fechar relatório">×</button></header>
                    <div>{aiReport}</div>
                  </article>
                )}
              </section>
            </div>
          )}

          {/* CONTA / CONFIGURAÇÕES */}
          {tab === "settings" && (
            <div className="ru-settings-page">
              <header className="ru-account-heading">
                <div><span className="ru-account-kicker">Preferências e privacidade</span><h2>Conta</h2><p>Gerencie seu perfil, plano, acessos e dados da família.</p></div>
                <span className="ru-account-heading__plan" data-plan={familyPlan}>{familyPlan === "premium" ? "Premium" : "Gratuito"}</span>
              </header>

              <div className="ru-settings-grid">
              <section className="ru-account-section" aria-labelledby="ru-profile-title">
                <header><div><span className="ru-account-kicker">Identidade</span><h3 id="ru-profile-title">Seu perfil</h3></div><span className="ru-account-section__icon" aria-hidden="true">👤</span></header>
                {editingName ? (
                  <form className="ru-account-form" onSubmit={event => { event.preventDefault(); saveParentName(); }} aria-busy={savingName}>
                    <label htmlFor="parent-display-name">Nome do responsável</label>
                    <input id="parent-display-name" value={newName} onChange={event => setNewName(event.target.value)} maxLength={80} autoComplete="name" autoFocus />
                    <div className="ru-account-form__actions">
                      <button type="submit" className="ru-account-button ru-account-button--primary" disabled={savingName || !newName.trim()}>{savingName ? "Salvando..." : "Salvar nome"}</button>
                      <button type="button" className="ru-account-button ru-account-button--quiet" onClick={() => setEditingName(false)} disabled={savingName}>Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <div className="ru-account-profile">
                    <div><strong>{profile.display_name}</strong><span>{myEmail || "Responsável da família"}</span></div>
                    <button type="button" className="ru-account-button ru-account-button--secondary" onClick={() => { setNewName(profile.display_name); setEditingName(true); }}>Editar nome</button>
                  </div>
                )}
              </section>

              <section className="ru-account-section ru-account-plan" aria-labelledby="ru-plan-title" data-plan={familyPlan}>
                <header><div><span className="ru-account-kicker">Assinatura</span><h3 id="ru-plan-title">Plano {familyPlan === "premium" ? "Premium" : "Gratuito"}</h3></div><span className="ru-account-section__icon" aria-hidden="true">{familyPlan === "premium" ? "👑" : "✓"}</span></header>
                <p>{familyPlan === "premium" ? `Sua família pode cadastrar até ${PLAN_LIMITS.premium.children} crianças e ${PLAN_LIMITS.premium.coParents} responsáveis.` : `${PLAN_LIMITS.free.children} criança, ${PLAN_LIMITS.free.activeMissions} missões e ${PLAN_LIMITS.free.activeRewards} recompensas ativas.`}</p>
                {familyPlan === "free" ? <button type="button" className="ru-account-button ru-account-button--premium" onClick={() => setShowUpgrade(true)}>Conhecer o Premium</button> : <span className="ru-account-plan__active">Assinatura ativa</span>}
              </section>

              <section className="ru-account-section" aria-labelledby="ru-notifications-title">
                <header><div><span className="ru-account-kicker">Lembretes</span><h3 id="ru-notifications-title">Notificações</h3></div><span className="ru-account-section__icon" aria-hidden="true">🔔</span></header>
                <NotifyToggle userId={profile.id} />
              </section>

              <section className="ru-account-section" aria-labelledby="ru-support-title">
                <header><div><span className="ru-account-kicker">Ajuda e acesso</span><h3 id="ru-support-title">Suporte</h3></div><span className="ru-account-section__icon" aria-hidden="true">?</span></header>
                <div className="ru-account-action-list">
                  <button type="button" onClick={() => setShowReportIssue(true)}><span><strong>Reportar um problema</strong><small>Envie um relato com referência para acompanhamento</small></span><b aria-hidden="true">›</b></button>
                  {profile.role === "admin" && <button type="button" onClick={() => { window.history.pushState({}, "", "/admin"); window.location.reload(); }}><span><strong>Painel administrativo</strong><small>Famílias, planos e fila operacional</small></span><b aria-hidden="true">›</b></button>}
                  <button type="button" onClick={onSignOut}><span><strong>Sair da conta</strong><small>Encerra a sessão neste dispositivo</small></span><b aria-hidden="true">›</b></button>
                </div>
              </section>

              <section className="ru-account-section ru-account-section--wide" aria-labelledby="ru-coparents-title">
                <header><div><span className="ru-account-kicker">Família</span><h3 id="ru-coparents-title">Co-responsáveis</h3></div><span className="ru-account-section__count">{coParents.length}</span></header>
                {coParents.length === 0 ? <div className="ru-account-empty"><strong>Nenhum co-responsável</strong><p>Compartilhe o código de convite pela tela inicial quando precisar dividir a gestão.</p></div> : (
                  <div className="ru-coparent-list">
                  {coParents.map(cp => (
                    <article key={cp.id} className="ru-coparent-row" data-confirming={confirmRemoveCoParent === cp.id}>
                      <div className="ru-coparent-row__avatar" aria-hidden="true">{(cp.display_name || "R").slice(0, 1).toUpperCase()}</div>
                      <div><strong>{cp.display_name}</strong><span>{cp.role === "admin" ? "Administrador da plataforma" : "Responsável"}</span></div>
                      {cp.role !== "admin" && (
                        <button type="button" className="ru-account-button ru-account-button--danger" onClick={() => confirmRemoveCoParent === cp.id ? removeCoParent(cp.id) : setConfirmRemoveCoParent(cp.id)} disabled={Boolean(removingCoParent)} aria-busy={removingCoParent === cp.id}>
                          {removingCoParent === cp.id ? "Removendo..." : confirmRemoveCoParent === cp.id ? "Confirmar remoção" : "Remover"}
                        </button>
                      )}
                    </article>
                  ))}
                  </div>
                )}
              </section>

              <section className="ru-account-section ru-account-section--wide ru-account-privacy" aria-labelledby="ru-privacy-title">
                <header><div><span className="ru-account-kicker">LGPD e segurança</span><h3 id="ru-privacy-title">Privacidade e exclusão</h3></div><span className="ru-account-section__icon" aria-hidden="true">🔒</span></header>
                <div className="ru-account-consent"><div><strong>Consentimento registrado</strong><span>Termos {profile.terms_version || TERMS_VERSION}{profile.terms_accepted_at ? ` · ${new Date(profile.terms_accepted_at).toLocaleDateString("pt-BR")}` : ""}</span></div><span aria-hidden="true">✓</span></div>
                {!confirmDeleteAccount ? (
                  <button type="button" className="ru-account-delete-trigger" onClick={() => { setDeleteConfirmationText(""); setConfirmDeleteAccount(true); }}>
                    Excluir minha conta e meus dados
                  </button>
                ) : (
                  <div className="ru-account-delete" role="alert">
                    <strong>Esta ação é permanente</strong>
                    <p>Seu login e seus dados pessoais serão removidos. Se você for o único responsável, os dados da família também serão excluídos; com outro responsável, a gestão da família será transferida.</p>
                    <label htmlFor="delete-account-confirmation">Digite <b>EXCLUIR</b> para confirmar</label>
                    <input id="delete-account-confirmation" value={deleteConfirmationText} onChange={event => setDeleteConfirmationText(event.target.value.toUpperCase().slice(0, 7))} autoComplete="off" spellCheck={false} />
                    <div className="ru-account-delete__actions">
                      <button type="button" className="ru-account-button ru-account-button--danger-solid" onClick={deleteAccount} disabled={deletingAccount || deleteConfirmationText !== "EXCLUIR"} aria-busy={deletingAccount}>{deletingAccount ? "Excluindo conta..." : "Excluir permanentemente"}</button>
                      <button type="button" className="ru-account-button ru-account-button--quiet" onClick={() => { setConfirmDeleteAccount(false); setDeleteConfirmationText(""); }} disabled={deletingAccount}>Cancelar</button>
                    </div>
                  </div>
                )}
              </section>
              </div>
            </div>
          )}
        </>}
        </div>
      </main>
      </div>{/* fecha área principal (header + conteúdo) */}

      {!isDesktop && !managedChild && (
        <nav className="ru-parent-bottom-nav" aria-label="Navegação principal">
          {navTabs.map(item => (
            <button
              key={item.key}
              type="button"
              className="ru-parent-bottom-nav__item"
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => selectParentTab(item.key)}
            >
              <span className="ru-parent-bottom-nav__icon" aria-hidden="true">{item.icon}</span>
              <span className="ru-parent-bottom-nav__label">{item.mobileLabel || item.label}</span>
              {item.key === "home" && pending.length > 0 && (
                <span className="ru-parent-bottom-nav__badge" aria-label={`${pending.length} pendente${pending.length > 1 ? "s" : ""}`}>
                  {pending.length > 9 ? "9+" : pending.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════
const AdminPanel = ({ onBack }) => {
  const [adminView, setAdminView] = useState("overview");
  const [adminTheme, setAdminTheme] = useState(getStoredParentTheme);
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [pendingPlanChange, setPendingPlanChange] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [reportsByStatus, setReportsByStatus] = useState({ open: [], resolved: [], ignored: [] });
  const [errorStatus, setErrorStatus] = useState("open");
  const [errorSearch, setErrorSearch] = useState("");
  const [errorKind, setErrorKind] = useState("all");
  const [errorsLoading, setErrorsLoading] = useState(null);
  const [errorsLoadError, setErrorsLoadError] = useState(null);
  const [updatingReport, setUpdatingReport] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notif, setNotif] = useState(null);
  const notifTimerRef = useRef(null);

  const notify = useCallback((message, type = "success", persistent = false) => {
    if (notifTimerRef.current) window.clearTimeout(notifTimerRef.current);
    setNotif({ message, type });
    if (!persistent) {
      notifTimerRef.current = window.setTimeout(() => setNotif(null), 5000);
    }
  }, []);

  useEffect(() => () => {
    if (notifTimerRef.current) window.clearTimeout(notifTimerRef.current);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PARENT_THEME_STORAGE_KEY, adminTheme);
    } catch {
      // O tema continua funcional mesmo quando o storage do navegador esta bloqueado.
    }
  }, [adminTheme]);

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc("admin_get_families");
    setLoading(false);
    if (error) {
      console.error("[Admin] admin_get_families error:", error);
      if (error.message?.includes("Acesso negado")) {
        setDenied(true);
        return false;
      }
      void reportAppError({ error, source: "admin", action: "load_families", screen: "admin" });
      setLoadError(error.message || "Erro desconhecido");
      return false;
    }
    setDenied(false);
    setFamilies((data || []).map((family) => ({
      ...family,
      child_count: getAdminChildCount(family),
    })));
    setLastUpdated(new Date());
    return true;
  }, []);

  const loadErrorReports = useCallback(async (status) => {
    setErrorsLoading(status);
    setErrorsLoadError(null);
    const { data, error } = await supabase.rpc("platform_get_error_reports", {
      p_status: status,
      p_limit: 100,
    });
    setErrorsLoading(null);
    if (error) {
      if (error.message?.includes("Acesso negado")) {
        setDenied(true);
        return false;
      }
      void reportAppError({ error, source: "admin", action: "load_error_reports", screen: "admin_errors" });
      setErrorsLoadError(error.message || "Erro ao carregar reportes");
      return false;
    }
    setReportsByStatus((current) => ({ ...current, [status]: data || [] }));
    setLastUpdated(new Date());
    return true;
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(async () => {
      const canContinue = await loadFamilies();
      if (canContinue) await loadErrorReports("open");
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadErrorReports, loadFamilies]);

  useEffect(() => {
    if (adminView !== "errors") return undefined;
    const nextLoad = window.setTimeout(() => loadErrorReports(errorStatus), 0);
    return () => window.clearTimeout(nextLoad);
  }, [adminView, errorStatus, loadErrorReports]);

  const refreshCurrentView = async () => {
    if (adminView === "errors") await loadErrorReports(errorStatus);
    else {
      const canContinue = await loadFamilies();
      if (adminView === "overview" && canContinue) await loadErrorReports("open");
    }
  };

  const openPlanConfirmation = (familyId) => {
    setConfirmingDelete(null);
    setDeleteConfirmationText("");
    setPendingPlanChange((current) => current === familyId ? null : familyId);
  };

  const applyPlanChange = async (familyId, currentPlan) => {
    const newPlan = currentPlan === "premium" ? "free" : "premium";
    setToggling(familyId);
    const { error } = await supabase.rpc("admin_set_plan", { p_family_id: familyId, p_plan: newPlan });
    setToggling(null);
    if (error) {
      captureActionError(error, "admin", "set_plan", "admin_families");
      notify(`Não foi possível alterar o plano: ${error.message}`, "error", true);
      return;
    }
    setPendingPlanChange(null);
    setFamilies((current) => current.map((family) => (
      family.family_id === familyId ? { ...family, plan: newPlan } : family
    )));
    notify(newPlan === "premium" ? "Plano Premium ativado." : "Plano alterado para Free.", "success", true);
  };

  const openDeleteConfirmation = (familyId) => {
    setPendingPlanChange(null);
    setConfirmingDelete((current) => current === familyId ? null : familyId);
    setDeleteConfirmationText("");
  };

  const deleteFamily = async (familyId) => {
    if (deleteConfirmationText.trim().toUpperCase() !== "REMOVER") return;
    setDeleting(familyId);
    const { error } = await supabase.rpc("admin_delete_family", { p_family_id: familyId });
    setDeleting(null);
    if (error) {
      captureActionError(error, "admin", "delete_family", "admin_families");
      notify(`Não foi possível remover a família: ${error.message}`, "error", true);
      return;
    }
    setConfirmingDelete(null);
    setDeleteConfirmationText("");
    setFamilies((current) => current.filter((family) => family.family_id !== familyId));
    notify("Família removida. A operação foi concluída no servidor.", "success", true);
  };

  const updateErrorReport = async (reportId, status) => {
    const currentReport = reportsByStatus[errorStatus].find((report) => report.report_id === reportId);
    setUpdatingReport(reportId);
    const { error } = await supabase.rpc("platform_update_error_report", {
      p_report_id: reportId,
      p_status: status,
    });
    setUpdatingReport(null);
    if (error) {
      void reportAppError({ error, source: "admin", action: "update_error_report", screen: "admin_errors" });
      notify("Não foi possível atualizar o reporte.", "error", true);
      return;
    }
    setReportsByStatus((current) => {
      const next = {
        ...current,
        [errorStatus]: current[errorStatus].filter((report) => report.report_id !== reportId),
      };
      if (currentReport && status !== errorStatus) {
        next[status] = [{ ...currentReport, report_status: status }, ...current[status]];
      }
      return next;
    });
    notify(status === "resolved" ? "Reporte marcado como resolvido." : status === "ignored" ? "Reporte ignorado." : "Reporte reaberto.");
  };

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredFamilies = families.filter((family) => {
    const matchesPlan = planFilter === "all" || family.plan === planFilter;
    const matchesSearch = !normalizedSearch || [family.family_name, family.parent_email, family.parent_name]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    return matchesPlan && matchesSearch;
  });

  const visibleReports = reportsByStatus[errorStatus] || [];
  const normalizedErrorSearch = errorSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredReports = visibleReports.filter((report) => {
    const matchesKind = errorKind === "all" || report.report_kind === errorKind;
    const matchesSearch = !normalizedErrorSearch || [report.reference, report.message, report.source, report.action, report.screen, report.error_name]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(normalizedErrorSearch));
    return matchesKind && matchesSearch;
  });

  const premiumCount = families.filter((family) => family.plan === "premium").length;
  const freeCount = families.length - premiumCount;
  const childrenCount = families.reduce((total, family) => total + Number(family.child_count || 0), 0);
  const memberCount = families.reduce((total, family) => {
    const fallbackCount = Array.isArray(family.children) ? family.children.length : Number(family.child_count || 0) + 1;
    return total + Number(family.member_count ?? fallbackCount);
  }, 0);
  const premiumShare = families.length ? Math.round((premiumCount / families.length) * 100) : 0;
  const openReports = reportsByStatus.open;
  const recurringOpenReports = openReports.filter((report) => Number(report.occurrences || 0) >= 3).length;
  const recentFamilies = [...families]
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
    .slice(0, 5);

  const formatDate = (value, withTime = false) => {
    if (!value) return "Não informado";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data inválida";
    return new Intl.DateTimeFormat("pt-BR", withTime ? {
      dateStyle: "short",
      timeStyle: "short",
    } : { dateStyle: "short" }).format(date);
  };

  const shortId = (value) => value ? `${String(value).slice(0, 8)}…` : "Não vinculado";

  const navItems = [
    { key: "overview", icon: "⌂", label: "Visão geral" },
    { key: "families", icon: "◎", label: "Famílias" },
    { key: "errors", icon: "!", label: "Reportes", count: openReports.length },
  ];

  if (denied) {
    return (
      <div className="ru-parent-shell ru-admin-shell ru-admin-denied" data-theme={adminTheme}>
        <section className="ru-admin-denied__panel" role="alert">
          <span className="ru-admin-denied__icon" aria-hidden="true">×</span>
          <p className="ru-admin-kicker">Área restrita</p>
          <h1>Acesso não autorizado</h1>
          <p>O servidor não reconheceu esta conta como administradora da plataforma.</p>
          <button type="button" className="ru-admin-button ru-admin-button--primary" onClick={onBack}>← Voltar ao aplicativo</button>
        </section>
      </div>
    );
  }

  return (
    <div className="ru-parent-shell ru-admin-shell" data-theme={adminTheme}>
      {notif && (
        <div className="ru-admin-notification" data-type={notif.type} role={notif.type === "error" ? "alert" : "status"} aria-live={notif.type === "error" ? "assertive" : "polite"}>
          <span>{notif.message}</span>
          <button type="button" onClick={() => setNotif(null)} aria-label="Fechar aviso" title="Fechar aviso">×</button>
        </div>
      )}

      <aside className="ru-admin-sidebar">
        <div className="ru-admin-brand">
          <span className="ru-admin-brand__mark" aria-hidden="true">R</span>
          <div>
            <strong>Rotin<span>Up</span></strong>
            <small>Administração</small>
          </div>
        </div>

        <nav className="ru-admin-nav" aria-label="Navegação administrativa">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={adminView === item.key ? "page" : undefined}
              onClick={() => setAdminView(item.key)}
            >
              <span className="ru-admin-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.count > 0 && <span className="ru-admin-nav__count" aria-label={`${item.count} reporte${item.count === 1 ? "" : "s"} aberto${item.count === 1 ? "" : "s"}`}>{item.count > 99 ? "99+" : item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="ru-admin-sidebar__footer">
          <div className="ru-admin-access-status">
            <span aria-hidden="true" />
            <div><strong>Acesso restrito</strong><small>Gate validado pelo servidor</small></div>
          </div>
          <button type="button" className="ru-admin-back" onClick={onBack}>← Meu aplicativo</button>
        </div>
      </aside>

      <div className="ru-admin-main">
        <header className="ru-admin-topbar">
          <div>
            <p className="ru-admin-kicker">Operação da plataforma</p>
            <h1>{adminView === "overview" ? "Visão geral" : adminView === "families" ? "Famílias e planos" : "Fila de reportes"}</h1>
          </div>
          <div className="ru-admin-topbar__actions">
            {lastUpdated && <span className="ru-admin-last-update">Atualizado {formatDate(lastUpdated, true)}</span>}
            <button type="button" className="ru-admin-icon-button" onClick={refreshCurrentView} disabled={loading || Boolean(errorsLoading)} aria-label="Atualizar dados" title="Atualizar dados">↻</button>
            <button type="button" className="ru-parent-theme-toggle" onClick={() => setAdminTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Ativar tema ${adminTheme === "dark" ? "claro" : "escuro"}`} title={`Ativar tema ${adminTheme === "dark" ? "claro" : "escuro"}`}>
              <span aria-hidden="true">{adminTheme === "dark" ? "☀" : "☾"}</span>
              <span className="ru-parent-theme-toggle__label">{adminTheme === "dark" ? "Claro" : "Escuro"}</span>
            </button>
            <button type="button" className="ru-admin-topbar__back" onClick={onBack}>← Meu aplicativo</button>
          </div>
        </header>

        <main className="ru-admin-workspace">
          {adminView === "overview" && (
            <section className="ru-admin-page" aria-labelledby="admin-overview-heading">
              <header className="ru-admin-page-heading">
                <div>
                  <h2 id="admin-overview-heading">Estado operacional</h2>
                  <p>Indicadores essenciais para acompanhar famílias, planos e incidentes.</p>
                </div>
              </header>

              {loadError && (
                <div className="ru-admin-load-error" role="alert">
                  <div><strong>Não foi possível carregar as famílias.</strong><span>{loadError}</span></div>
                  <button type="button" onClick={loadFamilies}>Tentar novamente</button>
                </div>
              )}

              <dl className="ru-admin-metrics" aria-busy={loading}>
                <div><dt>Famílias</dt><dd>{loading ? "…" : families.length}</dd><small>{freeCount} Free e {premiumCount} Premium</small></div>
                <div><dt>Membros</dt><dd>{loading ? "…" : memberCount}</dd><small>{childrenCount} criança{childrenCount === 1 ? "" : "s"} cadastrada{childrenCount === 1 ? "" : "s"}</small></div>
                <div data-tone="premium"><dt>Premium</dt><dd>{loading ? "…" : `${premiumShare}%`}</dd><small>{premiumCount} família{premiumCount === 1 ? "" : "s"} no plano</small></div>
                <div data-tone={openReports.length ? "attention" : "stable"}><dt>Reportes abertos</dt><dd>{errorsLoading === "open" ? "…" : openReports.length}</dd><small>{recurringOpenReports} recorrente{recurringOpenReports === 1 ? "" : "s"}</small></div>
              </dl>

              <section className="ru-admin-conversion" aria-label="Conversão para o plano Premium">
                <div><strong>Conversão Premium</strong><span>{premiumShare}%</span></div>
                <div className="ru-admin-progress" role="progressbar" aria-label="Famílias Premium" aria-valuemin="0" aria-valuemax="100" aria-valuenow={premiumShare}>
                  <span style={{ width: `${premiumShare}%` }} />
                </div>
              </section>

              <div className="ru-admin-overview-grid">
                <section className="ru-admin-section" aria-labelledby="admin-priorities-heading">
                  <header><div><p className="ru-admin-kicker">Suporte</p><h2 id="admin-priorities-heading">Prioridades abertas</h2></div><button type="button" onClick={() => setAdminView("errors")}>Ver fila →</button></header>
                  {errorsLoading === "open" ? (
                    <div className="ru-admin-empty" aria-live="polite">Carregando reportes…</div>
                  ) : errorsLoadError ? (
                    <div className="ru-admin-inline-error" role="alert"><span>Falha ao consultar reportes.</span><button type="button" onClick={() => loadErrorReports("open")}>Repetir</button></div>
                  ) : openReports.length === 0 ? (
                    <div className="ru-admin-empty" data-tone="success"><strong>Fila em dia</strong><span>Nenhum reporte aberto no momento.</span></div>
                  ) : (
                    <div className="ru-admin-priority-list">
                      {openReports.slice(0, 4).map((report) => (
                        <button key={report.report_id} type="button" onClick={() => { setErrorStatus("open"); setAdminView("errors"); }}>
                          <span className="ru-admin-report-kind" data-kind={report.report_kind}>{report.report_kind === "user" ? "Usuário" : "Automático"}</span>
                          <strong>{report.error_name || report.action || "Erro reportado"}</strong>
                          <small>#{report.reference} · {report.occurrences || 1} ocorrência{Number(report.occurrences || 1) === 1 ? "" : "s"} · {formatDate(report.last_seen_at, true)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="ru-admin-section" aria-labelledby="admin-recent-heading">
                  <header><div><p className="ru-admin-kicker">Base</p><h2 id="admin-recent-heading">Famílias recentes</h2></div><button type="button" onClick={() => setAdminView("families")}>Ver todas →</button></header>
                  {loading ? (
                    <div className="ru-admin-empty" aria-live="polite">Carregando famílias…</div>
                  ) : recentFamilies.length === 0 ? (
                    <div className="ru-admin-empty"><strong>Nenhuma família</strong><span>Novos cadastros aparecerão aqui.</span></div>
                  ) : (
                    <div className="ru-admin-recent-list">
                      {recentFamilies.map((family) => (
                        <button key={family.family_id} type="button" onClick={() => { setSearch(family.family_name || ""); setAdminView("families"); }}>
                          <span className="ru-admin-family-symbol" data-plan={family.plan} aria-hidden="true">{family.plan === "premium" ? "P" : "F"}</span>
                          <span><strong>{family.family_name || "Família sem nome"}</strong><small>{family.child_count} filho{family.child_count === 1 ? "" : "s"} · desde {formatDate(family.created_at)}</small></span>
                          <span className="ru-admin-plan-badge" data-plan={family.plan}>{family.plan === "premium" ? "Premium" : "Free"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </section>
          )}

          {adminView === "families" && (
            <section className="ru-admin-page" aria-labelledby="admin-families-heading">
              <header className="ru-admin-page-heading">
                <div><h2 id="admin-families-heading">Famílias cadastradas</h2><p>Consulte responsáveis e altere o plano somente quando houver solicitação validada.</p></div>
                <span className="ru-admin-result-count">{filteredFamilies.length} de {families.length}</span>
              </header>

              <div className="ru-admin-toolbar">
                <label className="ru-admin-search">
                  <span>Buscar</span>
                  <span aria-hidden="true">⌕</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Família, responsável ou email" />
                </label>
                <div className="ru-admin-segmented" role="group" aria-label="Filtrar por plano">
                  {[{ key: "all", label: "Todos" }, { key: "free", label: "Free" }, { key: "premium", label: "Premium" }].map((item) => (
                    <button key={item.key} type="button" aria-pressed={planFilter === item.key} onClick={() => setPlanFilter(item.key)}>{item.label}</button>
                  ))}
                </div>
              </div>

              <p className="ru-admin-privacy-note"><span aria-hidden="true">i</span> Dados de contato aparecem somente nesta área restrita e apenas para suporte operacional.</p>

              {loadError && (
                <div className="ru-admin-load-error" role="alert"><div><strong>Não foi possível carregar as famílias.</strong><span>{loadError}</span></div><button type="button" onClick={loadFamilies}>Tentar novamente</button></div>
              )}

              {loading ? (
                <div className="ru-admin-empty ru-admin-empty--large" aria-live="polite">Carregando famílias…</div>
              ) : !loadError && filteredFamilies.length === 0 ? (
                <div className="ru-admin-empty ru-admin-empty--large"><strong>Nenhum resultado</strong><span>Revise a busca ou o filtro de plano.</span></div>
              ) : (
                <div className="ru-admin-family-list">
                  <div className="ru-admin-family-list__header" aria-hidden="true"><span>Família</span><span>Responsável</span><span>Uso</span><span>Plano e ações</span></div>
                  {filteredFamilies.map((family) => {
                    const isConfirmingPlan = pendingPlanChange === family.family_id;
                    const isConfirmingDelete = confirmingDelete === family.family_id;
                    const nextPlan = family.plan === "premium" ? "Free" : "Premium";
                    const busy = toggling === family.family_id || deleting === family.family_id;
                    return (
                      <article key={family.family_id} className="ru-admin-family-row" data-expanded={isConfirmingPlan || isConfirmingDelete ? "true" : "false"}>
                        <div className="ru-admin-family-row__main">
                          <div className="ru-admin-family-identity">
                            <span className="ru-admin-family-symbol" data-plan={family.plan} aria-hidden="true">{family.plan === "premium" ? "P" : "F"}</span>
                            <div><strong>{family.family_name || "Família sem nome"}</strong><small>Criada em {formatDate(family.created_at)}</small></div>
                          </div>
                          <div className="ru-admin-family-contact"><span>Responsável</span><strong>{family.parent_name || "Não informado"}</strong><small>{family.parent_email || "Email não informado"}</small></div>
                          <div className="ru-admin-family-usage"><span>Uso</span><strong>{family.child_count} filho{family.child_count === 1 ? "" : "s"}</strong><small>{Number(family.member_count ?? family.child_count + 1)} membro{Number(family.member_count ?? family.child_count + 1) === 1 ? "" : "s"}</small></div>
                          <div className="ru-admin-family-actions">
                            <span className="ru-admin-plan-badge" data-plan={family.plan}>{family.plan === "premium" ? "Premium" : "Free"}</span>
                            <button type="button" className="ru-admin-button ru-admin-button--secondary" disabled={busy} onClick={() => openPlanConfirmation(family.family_id)}>Alterar plano</button>
                            <button type="button" className="ru-admin-icon-button ru-admin-icon-button--danger" disabled={busy} onClick={() => openDeleteConfirmation(family.family_id)} aria-label={`Remover ${family.family_name || "família"}`} title="Remover família">×</button>
                          </div>
                        </div>

                        {isConfirmingPlan && (
                          <div className="ru-admin-confirmation" data-tone={family.plan === "premium" ? "warning" : "premium"}>
                            <div><strong>Alterar para {nextPlan}?</strong><span>{family.plan === "premium" ? "O downgrade passa a aplicar os limites do plano gratuito imediatamente." : "O upgrade libera os limites Premium para esta família."}</span></div>
                            <div className="ru-admin-confirmation__actions">
                              <button type="button" className="ru-admin-button ru-admin-button--primary" disabled={busy} onClick={() => applyPlanChange(family.family_id, family.plan)}>{toggling === family.family_id ? "Salvando…" : `Confirmar ${nextPlan}`}</button>
                              <button type="button" className="ru-admin-button ru-admin-button--ghost" disabled={busy} onClick={() => setPendingPlanChange(null)}>Cancelar</button>
                            </div>
                          </div>
                        )}

                        {isConfirmingDelete && (
                          <div className="ru-admin-confirmation" data-tone="danger">
                            <div><strong>Remoção irreversível</strong><span>Esta ação apaga a família e todos os dados dependentes. Digite REMOVER para liberar o botão.</span></div>
                            <div className="ru-admin-delete-controls">
                              <label><span>Confirmação</span><input value={deleteConfirmationText} onChange={(event) => setDeleteConfirmationText(event.target.value)} placeholder="REMOVER" autoComplete="off" /></label>
                              <button type="button" className="ru-admin-button ru-admin-button--danger" disabled={busy || deleteConfirmationText.trim().toUpperCase() !== "REMOVER"} onClick={() => deleteFamily(family.family_id)}>{deleting === family.family_id ? "Removendo…" : "Remover definitivamente"}</button>
                              <button type="button" className="ru-admin-button ru-admin-button--ghost" disabled={busy} onClick={() => { setConfirmingDelete(null); setDeleteConfirmationText(""); }}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {adminView === "errors" && (
            <section className="ru-admin-page" aria-labelledby="admin-errors-heading">
              <header className="ru-admin-page-heading">
                <div><h2 id="admin-errors-heading">Reportes de uso</h2><p>Triagem de falhas automáticas e relatos enviados por usuários.</p></div>
                <span className="ru-admin-result-count">{filteredReports.length} resultado{filteredReports.length === 1 ? "" : "s"}</span>
              </header>

              <div className="ru-admin-status-tabs" role="tablist" aria-label="Status dos reportes">
                {[{ key: "open", label: "Abertos" }, { key: "resolved", label: "Resolvidos" }, { key: "ignored", label: "Ignorados" }].map((item) => (
                  <button key={item.key} type="button" role="tab" aria-selected={errorStatus === item.key} onClick={() => setErrorStatus(item.key)}>{item.label}<span>{reportsByStatus[item.key].length}</span></button>
                ))}
              </div>

              <div className="ru-admin-toolbar">
                <label className="ru-admin-search"><span>Buscar</span><span aria-hidden="true">⌕</span><input value={errorSearch} onChange={(event) => setErrorSearch(event.target.value)} placeholder="Referência, mensagem, ação ou tela" /></label>
                <div className="ru-admin-segmented" role="group" aria-label="Filtrar origem do reporte">
                  {[{ key: "all", label: "Todos" }, { key: "user", label: "Usuário" }, { key: "automatic", label: "Automático" }].map((item) => (
                    <button key={item.key} type="button" aria-pressed={errorKind === item.key} onClick={() => setErrorKind(item.key)}>{item.label}</button>
                  ))}
                </div>
              </div>

              {errorsLoadError && (
                <div className="ru-admin-load-error" role="alert"><div><strong>Não foi possível carregar os reportes.</strong><span>{errorsLoadError}</span></div><button type="button" onClick={() => loadErrorReports(errorStatus)}>Tentar novamente</button></div>
              )}

              {errorsLoading === errorStatus ? (
                <div className="ru-admin-empty ru-admin-empty--large" aria-live="polite">Carregando reportes…</div>
              ) : !errorsLoadError && filteredReports.length === 0 ? (
                <div className="ru-admin-empty ru-admin-empty--large" data-tone={errorStatus === "open" ? "success" : undefined}><strong>{errorStatus === "open" ? "Fila em dia" : "Nenhum reporte"}</strong><span>{visibleReports.length ? "Revise a busca ou o filtro de origem." : "Não há itens neste status."}</span></div>
              ) : (
                <div className="ru-admin-report-list">
                  {filteredReports.map((report) => {
                    const isUpdating = updatingReport === report.report_id;
                    const occurrenceCount = Number(report.occurrences || 1);
                    return (
                      <article key={report.report_id} className="ru-admin-report-card" data-kind={report.report_kind}>
                        <header>
                          <div><span className="ru-admin-report-kind" data-kind={report.report_kind}>{report.report_kind === "user" ? "Usuário" : "Automático"}</span><code>#{report.reference}</code>{occurrenceCount >= 3 && <span className="ru-admin-recurring">Recorrente</span>}</div>
                          <span className="ru-admin-occurrences">{occurrenceCount}x</span>
                        </header>
                        <h3>{report.report_kind === "user" ? report.action || "Relato do usuário" : report.error_name || report.action || "Erro automático"}</h3>
                        <p>{report.message || "Sem mensagem registrada."}</p>
                        <dl className="ru-admin-report-meta">
                          <div><dt>Origem</dt><dd>{report.source || "Não informada"}</dd></div>
                          <div><dt>Ação</dt><dd>{report.action || "Não informada"}</dd></div>
                          <div><dt>Tela</dt><dd>{report.screen || "Não informada"}</dd></div>
                          <div><dt>Último registro</dt><dd>{formatDate(report.last_seen_at, true)}</dd></div>
                        </dl>
                        <details className="ru-admin-report-trace">
                          <summary>Dados de rastreio</summary>
                          <dl><div><dt>Primeiro registro</dt><dd>{formatDate(report.first_seen_at, true)}</dd></div><div><dt>Versão</dt><dd>{report.app_version || "Não informada"}</dd></div><div><dt>Família</dt><dd>{shortId(report.family_id)}</dd></div><div><dt>Hash técnico</dt><dd>{shortId(report.stack_hash)}</dd></div></dl>
                        </details>
                        <footer>
                          {errorStatus === "open" ? (
                            <><button type="button" className="ru-admin-button ru-admin-button--success" disabled={isUpdating} onClick={() => updateErrorReport(report.report_id, "resolved")}>{isUpdating ? "Atualizando…" : "Marcar resolvido"}</button><button type="button" className="ru-admin-button ru-admin-button--ghost" disabled={isUpdating} onClick={() => updateErrorReport(report.report_id, "ignored")}>Ignorar</button></>
                          ) : (
                            <button type="button" className="ru-admin-button ru-admin-button--secondary" disabled={isUpdating} onClick={() => updateErrorReport(report.report_id, "open")}>{isUpdating ? "Atualizando…" : "Reabrir reporte"}</button>
                          )}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

// Detecta viewport desktop (para o enquadramento "card" no PC, sem mexer no mobile)
function useIsDesktop(bp = 768) {
  const [isDesktop, setIsDesktop] = useState(typeof window !== "undefined" && window.innerWidth >= bp);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return isDesktop;
}

// ═══════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════
export default function App() {
  const isDesktop = useIsDesktop();
  const [screen, setScreen]   = useState("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState(null);
  const [authMode, setAuthMode]           = useState("login");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall]     = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [screen]);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setShowInstall(false);
    setInstallPrompt(null);
  };

  const loadProfile = useCallback(async (uid) => {
    setLoading(true);
    setProfileLoadError(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setProfile(null);
        setProfileLoadError("Seu login existe, mas o perfil do aplicativo ainda não está disponível.");
        setScreen("profile_error");
        return;
      }

      const nextProfile = { ...data };
      if (!nextProfile.role) {
        const { error: roleError } = await supabase
          .from("profiles")
          .update({ role: "parent" })
          .eq("id", uid);
        if (roleError) throw roleError;
        nextProfile.role = "parent";
      }

      setProfile(nextProfile);
      const isAdminPath = window.location.pathname === "/admin";
      const isParentRole = nextProfile.role === "parent" || nextProfile.role === "admin";
      if (isParentRole && nextProfile.terms_version !== TERMS_VERSION) {
        setScreen("terms");
      } else {
        setScreen(
          isAdminPath ? "admin"
          : !nextProfile.family_id && isParentRole ? "onboarding"
          : !nextProfile.family_id && nextProfile.role === "child" ? "child_join"
          : isParentRole ? "parent" : "child"
        );
      }
    } catch (error) {
      console.error("[App] Falha ao carregar perfil:", error);
      void reportAppError({ error, source: "app", action: "load_profile", screen: "bootstrap" });
      setProfileLoadError("Não foi possível consultar seu perfil. Sua sessão foi preservada para você tentar novamente.");
      setScreen("profile_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("[App] Falha ao restaurar sessão:", error);
        void reportAppError({ error, source: "auth", action: "restore_session", screen: "bootstrap" });
        setProfileLoadError("Não foi possível restaurar sua sessão.");
        setScreen("profile_error");
        setLoading(false);
        return;
      }
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else { setUser(null); setProfile(null); setScreen("landing"); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = async () => { await supabase.auth.signOut(); };

  let activeScreen = screen;
  if (screen === "splash" && splashDone && !loading) {
    if (!user || !profile) activeScreen = "landing";
    else if (!profile.family_id && (profile.role === "parent" || profile.role === "admin")) activeScreen = "onboarding";
    else if (!profile.family_id && profile.role === "child") activeScreen = "child_join";
    else activeScreen = profile.role === "parent" || profile.role === "admin" ? "parent" : "child";
  }
  const isRefreshScreen = ["landing", "auth", "terms", "onboarding"].includes(activeScreen);
  const isParentRefreshScreen = activeScreen === "parent";
  const isAdminRefreshScreen = activeScreen === "admin";
  const isWideScreen = isRefreshScreen || isParentRefreshScreen || isAdminRefreshScreen;

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", justifyContent: "center", minHeight: "100vh", background: isRefreshScreen ? "#F7F9FC" : isParentRefreshScreen || isAdminRefreshScreen ? "#101526" : "radial-gradient(circle at 18% 16%, rgba(155,93,229,0.18), transparent 42%), radial-gradient(circle at 84% 26%, rgba(76,201,240,0.14), transparent 42%), radial-gradient(circle at 50% 94%, rgba(247,37,133,0.11), transparent 46%), #080810" }}>
        <div style={{ width: "100%", maxWidth: isWideScreen ? "none" : 430, overflow: "hidden", minHeight: "100vh", background: isRefreshScreen ? "#F7F9FC" : isParentRefreshScreen || isAdminRefreshScreen ? "#101526" : T.darker, boxShadow: isWideScreen ? "none" : isDesktop ? "0 0 0 1px rgba(255,255,255,0.06), 0 24px 70px rgba(0,0,0,0.55)" : "none" }}>
          {activeScreen === "admin" && (
            <AdminPanel onBack={() => {
              window.history.pushState({}, "", "/");
              setScreen((profile?.role === "parent" || profile?.role === "admin") ? "parent" : "child");
            }} />
          )}
          {activeScreen !== "admin" && <>
          {activeScreen === "splash" && <Splash onDone={finishSplash} />}
          {activeScreen === "landing"    && <LandingPage onSignup={() => { setAuthMode("signup"); setScreen("auth"); }} onLogin={() => { setAuthMode("login"); setScreen("auth"); }} />}
          {activeScreen === "auth"       && <AuthScreen initialMode={authMode} onTermsAccepted={loadProfile} onBack={() => setScreen("landing")} />}
          {activeScreen === "profile_error" && <LoadErrorBlock
            title="Não foi possível abrir sua conta"
            message={profileLoadError || "Tente novamente em alguns instantes."}
            onRetry={() => user ? loadProfile(user.id) : window.location.reload()}
            onSignOut={user ? signOut : undefined}
          />}
          {activeScreen === "terms"      && user && <TermsGate onAccept={() => loadProfile(user.id)} onSignOut={signOut} />}
          {activeScreen === "onboarding" && user && <Onboarding onDone={() => loadProfile(user.id)} />}
          {activeScreen === "child_join" && <ChildJoin onDone={() => loadProfile(user.id)} />}
          {activeScreen === "parent"     && profile && <ParentDash profile={profile} onSignOut={signOut} onRefresh={() => loadProfile(user.id)} />}
          {activeScreen === "child"      && profile && <ChildDash  profile={profile} onSignOut={signOut} onRefresh={() => loadProfile(user.id)} />}
          </>}
          {loading && activeScreen !== "splash" && (
            <div style={{ position: "fixed", inset: 0, background: T.darker, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 48, animation: "pulse 1s infinite" }}>🚀</div>
              <div style={{ color: T.textMuted, fontSize: 14 }}>Carregando...</div>
            </div>
          )}

          {/* Banner instalar PWA */}
          {showInstall && (
            <div style={{ position: "fixed", bottom: 90, left: 12, right: 12, zIndex: 8500, background: T.card, borderRadius: 20, padding: "14px 16px", border: `1px solid ${T.primary}55`, display: "flex", alignItems: "center", gap: 14, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${T.primary}22`, animation: "slideDown 0.3s ease" }}>
              <div style={{ fontSize: 36 }}>📲</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>Instalar RotinUp</div>
                <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>Acesse direto da tela inicial!</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={installApp} style={{ padding: "9px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Instalar</button>
                <button onClick={() => setShowInstall(false)} style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✕</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { font-family: 'Nunito', sans-serif; background: #080810; }
  @keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes coinFloat { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(360deg); opacity: 0; } }
  @keyframes levelUpPop { 0% { transform: scale(0.5) translateY(20px); opacity: 0; } 70% { transform: scale(1.08) translateY(-4px); } 100% { transform: scale(1) translateY(0); opacity: 1; } }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
`;
