import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON
);

const sanitizeStr = (v, maxLen = 120) =>
  String(v ?? "").replace(/[\x00-\x1F\x7F]/g, " ").replace(/[<>"'`]/g, "").trim().slice(0, maxLen);

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
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data?.result;
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
const XPBar = ({ current, max, color = T.accent }) => (
  <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, height: 8, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (current / max) * 100)}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}CC)`, borderRadius: 999, transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)", boxShadow: `0 0 8px ${color}88` }} />
  </div>
);

const Notif = ({ msg, type }) => msg ? (
  <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", width: "min(calc(100vw - 32px), 398px)", zIndex: 9999, background: T.card, borderRadius: 16, padding: "14px 20px", border: `1px solid ${type === "error" ? T.pink : T.accent}44`, color: T.text, fontWeight: 700, fontSize: 14, textAlign: "center", animation: "slideDown 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{msg}</div>
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
  { key: "adventurer",  label: "Aventureiro" },
  { key: "fun-emoji",   label: "Emoji Fun"   },
  { key: "pixel-art",   label: "Pixel Art"   },
  { key: "croodles",    label: "Doodle"      },
  { key: "lorelei",     label: "Aquarela"    },
  { key: "miniavs",     label: "Mini"        },
];
const DB_SEEDS = [
  "Luna","Bento","Sofia","Pedro","Leo","Ana","Gabi","Rafa","Nina","Theo",
  "Mia","Duda","Luca","Bia","Gui","Lara","Mel","Kaio","Isis","Teo",
  "Turbo","Flash","Foguete","Ninja","Dragao","Estrela","Cometa","Neon",
  "Pixel","Spark","Bolt","Nova","Sora","Kira","Zara","Ace","Max","Rex",
];
const avatarUrl = (seed, style = "adventurer") =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,transparent`;

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

const DiceBearPicker = ({ value, onChange }) => {
  const [dbStyle, setDbStyle] = useState(
    DB_STYLES.find(s => value?.includes(`/${s.key}/`))?.key || "adventurer"
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {DB_STYLES.map(s => (
          <button key={s.key} onClick={() => setDbStyle(s.key)}
            style={{ padding: "5px 10px", borderRadius: 10, border: `2px solid ${dbStyle === s.key ? T.purple : "rgba(255,255,255,0.12)"}`, background: dbStyle === s.key ? `${T.purple}22` : "rgba(255,255,255,0.04)", color: dbStyle === s.key ? T.purple : T.textMuted, fontWeight: 800, fontSize: 10, cursor: "pointer", fontFamily: "'Nunito', sans-serif", lineHeight: 1.5 }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, maxHeight: 210, overflowY: "auto" }}>
        {DB_SEEDS.map(seed => {
          const url = avatarUrl(seed, dbStyle);
          const sel = value === url;
          return (
            <div key={seed} onClick={() => onChange(url)}
              style={{ cursor: "pointer", borderRadius: 14, padding: 3, border: `2.5px solid ${sel ? T.purple : "transparent"}`, background: sel ? `${T.purple}22` : "transparent", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={url} alt={seed} width={46} height={46} style={{ borderRadius: 10, display: "block" }} loading="lazy" />
            </div>
          );
        })}
      </div>
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
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await supabase.from("push_subscriptions").upsert({ user_id: userId, subscription: existing }, { onConflict: "user_id" });
      return existing;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await supabase.from("push_subscriptions").upsert({ user_id: userId, subscription: sub }, { onConflict: "user_id" });
    return sub;
  } catch { return null; }
}

function NotifyToggle({ userId }) {
  const [status, setStatus] = useState(Notification.permission);
  const [loading, setLoading] = useState(false);

  if (!("Notification" in window) || !VAPID_PUBLIC_KEY) return null;

  const handleEnable = async () => {
    setLoading(true);
    const perm = await Notification.requestPermission();
    setStatus(perm);
    if (perm === "granted") await subscribePush(userId);
    setLoading(false);
  };

  if (status === "granted") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: `${T.accent}11`, borderRadius: 14, border: `1px solid ${T.accent}33`, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.accent, fontWeight: 800, fontSize: 13 }}>Notificações ativadas</div>
          <div style={{ color: T.textMuted, fontSize: 11 }}>Você receberá lembretes de missões</div>
        </div>
        <span style={{ fontSize: 18 }}>✅</span>
      </div>
    );
  }

  return (
    <button onClick={handleEnable} disabled={loading || status === "denied"}
      style={{ width: "100%", padding: "13px 16px", borderRadius: 14, border: `1px solid ${T.purple}44`, background: `${T.purple}11`, color: status === "denied" ? T.textMuted : T.purple, fontWeight: 800, fontSize: 13, cursor: status === "denied" ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", gap: 10, marginBottom: 12, justifyContent: "center" }}>
      <span style={{ fontSize: 20 }}>🔔</span>
      {loading ? "Ativando..." : status === "denied" ? "Notificações bloqueadas — ative no navegador" : "Ativar notificações de missões"}
    </button>
  );
}

// ─── Add Child Modal ───────────────────────────────────────
const AddChildModal = ({ onAdd, onClose }) => {
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
    const { data: childId, error } = await supabase.rpc("add_child", {
      p_display_name: name,
      p_avatar_emoji: avatar,
      p_age: age,
    });
    if (error) { setLoading(false); setErr(error.message || "Erro ao adicionar filho. Tente novamente."); return; }
    if (childId && birthDate) {
      await supabase.from("profiles").update({ birth_date: birthDate }).eq("id", childId);
    }
    setLoading(false);
    onAdd();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease" }}>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
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
    } catch (e) {
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
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ animation: "bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1)", textAlign: "center" }}>
        <img src="/icon.png" alt="RotinUp" style={{ width: 110, height: 110, marginBottom: 20, borderRadius: 28, filter: `drop-shadow(0 0 24px #9B5DE566)` }} />
        <div style={{ fontSize: 38, fontWeight: 900, color: T.text, letterSpacing: -2, fontFamily: "'Nunito', sans-serif" }}>rotin<span style={{ color: T.primary }}>up</span></div>
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
const PLANS = {
  monthly: { price: "14,90", period: "/mês", label: "Mensal", total: null,    savings: null,         badge: "🚀 Lançamento" },
  annual:  { price: "149,90", period: "/ano", label: "Anual",  total: "12,49/mês", savings: "R$ 28,90", badge: "⭐ Melhor valor" },
};
const HOTMART_MONTHLY = "https://pay.hotmart.com/E105936971D?off=992z9nyu";
const HOTMART_ANNUAL  = "https://pay.hotmart.com/E105936971D?off=tjv79dzd";

const PREM_ITEMS = ["Até 10 filhos", "Até 10 responsáveis", "Missões e recompensas ilimitadas", "IA: sugestão de missões ilimitada", "IA: relatório semanal automático", "IA: missão surpresa personalizada", "Histórico completo por filho", "Suporte prioritário WhatsApp"];

// ─── Card Premium para Landing Page ──────────────────────
const LandingPremiumCard = ({ onSignup }) => {
  const [billing, setBilling] = useState("annual");
  const plan = PLANS[billing];

  return (
    <div style={{ background: `linear-gradient(145deg, #1E1040, #2A1060)`, borderRadius: 20, padding: 20, border: `2px solid ${T.purple}55`, position: "relative", overflow: "hidden" }}>
      {/* glow */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: `radial-gradient(circle, ${T.purple}33, transparent)`, pointerEvents: "none" }} />

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ color: T.text, fontWeight: 900, fontSize: 18 }}>👑 Premium</div>
          <div style={{ color: T.textMuted, fontSize: 12 }}>Desbloqueie tudo</div>
        </div>
        <span style={{ background: `${T.purple}33`, color: T.purple, fontSize: 10, fontWeight: 900, borderRadius: 8, padding: "4px 9px" }}>{plan.badge}</span>
      </div>

      {/* toggle */}
      <div style={{ display: "flex", background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: 3, marginBottom: 16 }}>
        {["monthly","annual"].map(b => (
          <button key={b} onClick={() => setBilling(b)} style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s", background: billing === b ? T.purple : "transparent", color: billing === b ? "#fff" : T.textMuted }}>
            {b === "monthly" ? "Mensal" : "Anual"}
          </button>
        ))}
      </div>

      {/* price */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4 }}>
          <span style={{ color: T.textMuted, fontSize: 13, marginBottom: 4 }}>R$</span>
          <span style={{ color: T.text, fontWeight: 900, fontSize: 36 }}>{plan.price}</span>
          <span style={{ color: T.textMuted, fontSize: 13, marginBottom: 6 }}>{plan.period}</span>
        </div>
        {billing === "annual" && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <span style={{ color: T.accent, fontSize: 12, fontWeight: 800 }}>≈ R$ {plan.total}</span>
            <span style={{ background: `${T.accent}22`, color: T.accent, fontSize: 11, fontWeight: 900, borderRadius: 8, padding: "2px 8px" }}>Economize {plan.savings}</span>
          </div>
        )}
      </div>

      {/* features */}
      {PREM_ITEMS.map(item => (
        <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ color: T.purple, fontWeight: 900, fontSize: 14 }}>✓</span>
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{item}</span>
        </div>
      ))}

      {/* CTA */}
      <a href={billing === "annual" ? HOTMART_ANNUAL : HOTMART_MONTHLY} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 16, textDecoration: "none" }}>
        <button style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${T.purple}, #7B2FBE)`, color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "'Nunito', sans-serif", boxShadow: `0 6px 20px ${T.purple}44` }}>
          👑 Assinar {plan.label} — R$ {plan.price}{plan.period}
        </button>
      </a>
      <div style={{ textAlign: "center", marginTop: 10, color: T.textMuted, fontSize: 11 }}>Pagamento 100% seguro via Hotmart</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════
const LandingPage = ({ onSignup, onLogin }) => {
  const features = [
    { emoji: "🎯", title: "Missões Diárias", desc: "Transforme tarefas em aventuras épicas que as crianças adoram completar" },
    { emoji: "🪙", title: "KidCoins & Recompensas", desc: "Ganhe moedas e troque por recompensas escolhidas pela família" },
    { emoji: "🤖", title: "IA Personalizada", desc: "Sugestões inteligentes de missões e relatórios semanais automáticos" },
    { emoji: "👨‍👩‍👧", title: "Toda a Família", desc: "Responsáveis aprovam, crianças evoluem, todos acompanham juntos" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.darker, overflowY: "auto" }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(160deg, ${T.darker} 0%, #1A0A2E 100%)`, padding: "60px 28px 50px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${T.primary}22, transparent)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: -40, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${T.purple}22, transparent)`, pointerEvents: "none" }} />
        <img src="/icon.png" alt="RotinUp" style={{ width: 100, height: 100, marginBottom: 16, borderRadius: 24, animation: "bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1)", filter: "drop-shadow(0 0 28px #9B5DE555)" }} />
        <div style={{ fontSize: 36, fontWeight: 900, color: T.text, letterSpacing: -2, marginBottom: 6, fontFamily: "'Nunito', sans-serif" }}>rotin<span style={{ color: T.primary }}>up</span></div>
        <div style={{ color: T.textMuted, fontSize: 16, marginBottom: 10, letterSpacing: 1 }}>TRANSFORME A ROTINA EM AVENTURA</div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 1.6, maxWidth: 320, margin: "0 auto 36px" }}>
          O app de gamificação que faz as crianças amarem sua rotina — e os pais amarem a paz em casa.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320, margin: "0 auto" }}>
          <button onClick={onSignup} style={{ padding: "17px 28px", borderRadius: 18, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", boxShadow: `0 8px 24px ${T.primary}44` }}>
            ✨ Criar conta grátis
          </button>
          <button onClick={onLogin} style={{ padding: "15px 28px", borderRadius: 18, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: T.text, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            Já tenho conta
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ background: T.card, padding: "20px 28px", display: "flex", justifyContent: "space-around", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {[{ n: "100%", label: "gratuito para começar" }, { n: "6", label: "níveis de evolução" }, { n: "16", label: "conquistas para ganhar" }].map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ color: T.primary, fontWeight: 900, fontSize: 22 }}>{s.n}</div>
            <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ padding: "36px 24px" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 20, textAlign: "center", marginBottom: 28 }}>Tudo que você precisa</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: T.card, borderRadius: 20, padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${T.primary}22, ${T.purple}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>{f.emoji}</div>
              <div>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{f.title}</div>
                <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: "0 24px 40px" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 20, textAlign: "center", marginBottom: 28 }}>Como funciona</div>
        {[
          { step: "1", emoji: "👨‍👩‍👧", title: "Crie a família", desc: "Responsável cadastra a família e adiciona os filhos" },
          { step: "2", emoji: "🎯", title: "Crie missões", desc: "Defina tarefas do dia a dia como missões com recompensas" },
          { step: "3", emoji: "⭐", title: "Crianças completam", desc: "Elas fazem a tarefa e marcam como concluída no app" },
          { step: "4", emoji: "✅", title: "Você aprova", desc: "Revise e aprove — KidCoins são creditados automaticamente" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: 14, background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 16, flexShrink: 0 }}>{item.step}</div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ color: T.text, fontWeight: 800, fontSize: 15 }}>{item.emoji} {item.title}</div>
              <div style={{ color: T.textMuted, fontSize: 13, marginTop: 3, lineHeight: 1.4 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Níveis de evolução */}
      <div style={{ padding: "0 24px 40px" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 20, textAlign: "center", marginBottom: 8 }}>6 Níveis de Evolução</div>
        <div style={{ color: T.textMuted, fontSize: 13, textAlign: "center", marginBottom: 24 }}>Cada missão ganha XP — a criança sobe de nível e desbloqueia conquistas</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEVELS.map((lv, i) => (
            <div key={lv.level} style={{ background: T.card, borderRadius: 16, padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, border: `1px solid ${lv.color}33` }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: `${lv.color}22`, border: `2px solid ${lv.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{lv.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: lv.color, fontWeight: 900, fontSize: 14 }}>Nível {lv.level} — {lv.name}</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{lv.xpNeeded === 0 ? "Início da jornada" : `A partir de ${lv.xpNeeded} XP`}</div>
              </div>
              {i === LEVELS.length - 1 && <span style={{ fontSize: 10, fontWeight: 800, color: lv.color, background: `${lv.color}22`, borderRadius: 8, padding: "3px 8px" }}>TOPO</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Planos FREE vs PREMIUM */}
      <div style={{ padding: "0 24px 48px" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 20, textAlign: "center", marginBottom: 8 }}>Escolha seu plano</div>
        <div style={{ color: T.textMuted, fontSize: 13, textAlign: "center", marginBottom: 24 }}>Comece grátis. Faça upgrade quando quiser crescer.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* FREE */}
          <div style={{ background: T.card, borderRadius: 20, padding: 20, border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 18 }}>Gratuito</div>
                <div style={{ color: T.textMuted, fontSize: 12 }}>Para sempre, sem cartão</div>
              </div>
              <div style={{ color: T.accent, fontWeight: 900, fontSize: 22 }}>R$ 0</div>
            </div>
            {["1 filho","1 responsável","Até 5 missões ativas","Até 3 recompensas ativas","KidCoins & gamificação completa","IA: sugestão de missões (limitado)"].map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ color: T.accent, fontWeight: 900, fontSize: 14 }}>✓</span>
                <span style={{ color: T.textMuted, fontSize: 13 }}>{item}</span>
              </div>
            ))}
            <button onClick={onSignup} style={{ width: "100%", marginTop: 8, padding: "13px", borderRadius: 14, border: `1px solid ${T.accent}55`, background: `${T.accent}14`, color: T.accent, fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
              Criar conta grátis
            </button>
          </div>

          {/* PREMIUM com toggle Mensal/Anual */}
          <LandingPremiumCard onSignup={onSignup} />
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ background: `linear-gradient(135deg, ${T.primary}18, ${T.purple}18)`, padding: "36px 28px 60px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Pronto para começar?</div>
        <div style={{ color: T.textMuted, fontSize: 14, marginBottom: 28 }}>Gratuito para sempre. Sem cartão de crédito.</div>
        <button onClick={onSignup} style={{ width: "100%", maxWidth: 320, padding: "17px 28px", borderRadius: 18, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", boxShadow: `0 8px 24px ${T.primary}44` }}>
          ✨ Começar grátis agora
        </button>
      </div>
    </div>
  );
};

// ─── Terms & Privacy Modal ────────────────────────────────
const TermsModal = ({ onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999, overflowY: "auto" }}>
    <div style={{ maxWidth: 430, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 18 }}>📄 Termos e Privacidade</div>
      </div>

      {[
        { title: "1. Sobre o RotinUp", body: "O RotinUp é um aplicativo de gamificação de rotinas infantis desenvolvido por JV Digital (CNPJ em processo de abertura). Ao usar o app, você concorda com estes Termos de Uso e Política de Privacidade." },
        { title: "2. Uso do Serviço", body: "O RotinUp destina-se a responsáveis legais e suas crianças para organização e acompanhamento de rotinas diárias. É proibido usar o serviço para fins ilegais, compartilhar credenciais ou tentar burlar os controles do sistema." },
        { title: "3. Planos e Pagamento", body: "O plano gratuito permite 1 filho e acesso às funcionalidades básicas. O plano Premium é cobrado mensalmente via Hotmart e pode ser cancelado a qualquer momento. Valores sujeitos a alteração com aviso prévio de 30 dias." },
        { title: "4. Dados coletados (LGPD — Lei 13.709/18)", body: "Coletamos: e-mail e nome do responsável; nome, idade e avatar dos filhos cadastrados; registros de missões, recompensas e tropeços; dados de uso e autenticação.\n\nNão coletamos fotos, localização ou documentos de identificação." },
        { title: "5. Finalidade do tratamento", body: "Os dados são usados exclusivamente para: operar as funcionalidades do app; personalizar a experiência; processar pagamentos (via Hotmart); enviar notificações do serviço." },
        { title: "6. Compartilhamento de dados", body: "Seus dados podem ser processados por:\n• Supabase (banco de dados e autenticação — EUA)\n• Hotmart (processamento de pagamentos — Brasil)\n• Google (autenticação OAuth opcional — EUA)\n\nNão vendemos dados a terceiros." },
        { title: "7. Dados de menores", body: "Dados de crianças (nome, idade, avatar, progresso no app) são cadastrados pelo responsável legal com consentimento explícito. O responsável pode excluir o perfil da criança a qualquer momento pelo app." },
        { title: "8. Retenção e exclusão", body: "Dados ficam armazenados enquanto a conta estiver ativa. Ao excluir a conta, os dados são removidos em até 30 dias. Para solicitar exclusão antecipada, envie e-mail para privacidade@jvdigital.com.br." },
        { title: "9. Direitos do titular", body: "Você tem direito a: acessar seus dados; corrigir informações incorretas; solicitar exclusão; revogar consentimento; receber seus dados em formato portável.\n\nContato: privacidade@jvdigital.com.br" },
        { title: "10. Segurança", body: "Utilizamos criptografia em trânsito (HTTPS/TLS) e em repouso. Senhas nunca são armazenadas em texto puro. Em caso de incidente de segurança, notificaremos os usuários afetados no prazo legal." },
        { title: "11. Alterações", body: "Podemos atualizar estes termos. Alterações relevantes serão comunicadas por e-mail ou notificação no app com antecedência mínima de 15 dias." },
        { title: "12. Contato", body: "JV Digital\nE-mail: contato@jvdigital.com.br\nPrivacidade/LGPD: privacidade@jvdigital.com.br\nWhatsApp: (44) 99114-1555" },
      ].map((s, i) => (
        <div key={i} style={{ marginBottom: 24 }}>
          <div style={{ color: T.primary, fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{s.title}</div>
          <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-line" }}>{s.body}</div>
        </div>
      ))}

      <div style={{ color: T.textMuted, fontSize: 11, textAlign: "center", marginTop: 8 }}>
        Última atualização: maio de 2026
      </div>
      <button onClick={onClose} style={{ width: "100%", marginTop: 24, padding: "14px", borderRadius: 16, border: "none", background: T.primary, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
        ✅ Entendido
      </button>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const AuthScreen = ({ initialMode = "login" }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [mode, setMode]           = useState(initialMode);
  const [userType, setUserType] = useState("parent");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [notif, setNotif]       = useState(null);
  const [notifType, setNotifType] = useState("success");
  const [inlineErr, setInlineErr] = useState("");

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3500); };

  const authErrPT = (msg = "") => {
    if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) return "Email ou senha incorretos";
    if (msg.includes("Email not confirmed"))       return "Confirme seu email antes de entrar";
    if (msg.includes("User already registered") || msg.includes("user_already_exists") || msg.includes("already registered")) return "Este email já está cadastrado";
    if (msg.includes("Password should be") || msg.includes("weak_password") || msg.includes("password"))  return "A senha deve ter pelo menos 6 caracteres";
    if (msg.includes("Unable to validate email") || msg.includes("invalid email")) return "Email inválido";
    if (msg.includes("rate limit") || msg.includes("too_many_requests")) return "Muitas tentativas. Aguarde alguns minutos";
    if (msg.includes("network") || msg.includes("fetch")) return "Erro de conexão. Verifique sua internet";
    return "Erro ao autenticar. Tente novamente";
  };

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleEmail = async () => {
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
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: name, role: userType } }
        });
        if (error) throw error;
        notify("✅ Conta criada! Verifique seu email.");
        setTimeout(() => setMode("login"), 2500);
      }
    } catch (err) {
      notify(authErrPT(err.message), "error");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) { notify(error.message, "error"); setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", padding: "0 24px" }}>
      <Notif msg={notif} type={notifType} />
      <div style={{ textAlign: "center", paddingTop: 50, marginBottom: 32 }}>
        <img src="/icon.png" alt="RotinUp" style={{ width: 80, height: 80, borderRadius: 22, marginBottom: 12, filter: "drop-shadow(0 0 16px #9B5DE555)" }} />
        <div style={{ fontSize: 26, fontWeight: 900, color: T.text, letterSpacing: -1, fontFamily: "'Nunito', sans-serif" }}>rotin<span style={{ color: T.primary }}>up</span></div>
        <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>{mode === "login" ? "Bem-vindo de volta!" : "Crie sua conta gratuita"}</div>
      </div>

      {mode === "signup" && (
        <div style={{ background: `${T.primary}14`, borderRadius: 16, padding: "14px 16px", marginBottom: 20, border: `1px solid ${T.primary}33`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>👨‍👩‍👧</span>
          <div>
            <div style={{ color: T.text, fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Cadastro para Responsáveis</div>
            <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.5 }}>
              Crianças são adicionadas pelo responsável via <strong style={{ color: T.primary }}>código de convite</strong> — não precisam criar conta por aqui.
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }}>
        {mode === "forgot" ? (
          <>
            <div style={{ color: T.textMuted, fontSize: 13, marginBottom: 16, textAlign: "center", lineHeight: 1.6 }}>
              Informe o email cadastrado e enviaremos um link para redefinir sua senha.
            </div>
            <Inp icon="✉️" placeholder="Email" type="email" value={email} onChange={e => { setEmail(e.target.value); setInlineErr(""); }} />
            {inlineErr && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>⚠️ {inlineErr}</div>}
            <Btn onClick={handleEmail} disabled={loading}>{loading ? "Enviando..." : "📧 Enviar link de recuperação"}</Btn>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span onClick={() => setMode("login")} style={{ color: T.primary, fontWeight: 800, cursor: "pointer", fontSize: 14 }}>← Voltar ao login</span>
            </div>
          </>
        ) : (
          <>
            {mode !== "login" && <Inp icon="👤" placeholder="Seu nome" value={name} onChange={e => { setName(e.target.value); setInlineErr(""); }} />}
            <Inp icon="✉️" placeholder="Email" type="email" value={email} onChange={e => { setEmail(e.target.value); setInlineErr(""); }} />
            <Inp icon="🔒" placeholder="Senha" type="password" value={password} onChange={e => { setPassword(e.target.value); setInlineErr(""); }} />
            {inlineErr && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>⚠️ {inlineErr}</div>}
            {mode === "login" && (
              <div style={{ textAlign: "right", marginBottom: 12, marginTop: -4 }}>
                <span onClick={() => setMode("forgot")} style={{ color: T.textMuted, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Esqueci a senha</span>
              </div>
            )}
            <Btn onClick={handleEmail} disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "🚀 Entrar" : "✨ Criar conta"}</Btn>
          </>
        )}

        {mode === "signup" && (
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
            Ao criar conta você concorda com os{" "}
            <span onClick={() => setShowTerms(true)} style={{ color: T.primary, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
              Termos de Uso e Política de Privacidade
            </span>
          </div>
        )}

        {mode !== "forgot" && <><div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ color: T.textMuted, fontSize: 12 }}>ou continue com</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", padding: "14px 24px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: T.text, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Entrar com Google
        </button></>}
      </div>

      {mode !== "forgot" && <div style={{ textAlign: "center", padding: "24px 0 40px", color: T.textMuted, fontSize: 14 }}>
        {mode === "login"
          ? <> Novo por aqui? <span onClick={() => setMode("signup")} style={{ color: T.primary, fontWeight: 800, cursor: "pointer" }}>Criar conta grátis</span></>
          : <> Já tem conta? <span onClick={() => setMode("login")} style={{ color: T.primary, fontWeight: 800, cursor: "pointer" }}>Fazer login</span></>
        }
      </div>}

      <div style={{ textAlign: "center", paddingBottom: 20 }}>
        <span onClick={() => setShowTerms(true)} style={{ color: T.textMuted, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
          Termos de Uso e Política de Privacidade
        </span>
      </div>

      {showTerms && createPortal(<TermsModal onClose={() => setShowTerms(false)} />, document.body)}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════
const Onboarding = ({ user, onDone }) => {
  // step: "recovering" | "choice" | "create" | "addchild" | "join"
  const [step, setStep]               = useState("recovering");
  const [familyName, setFamilyName]   = useState("");
  const [childName, setChildName]     = useState("");
  const [childBirth, setChildBirth]   = useState("");
  const [avatar, setAvatar]           = useState(avatarUrl("Luna"));
  const [joinCode, setJoinCode]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState("");

  // Tenta reconectar família automaticamente ao entrar no onboarding
  useEffect(() => {
    const tryRecover = async () => {
      const { data, error } = await supabase.rpc("recover_family");
      if (!error && data?.found) {
        onDone(); // reconectado — vai direto pro dashboard
      } else {
        setStep("choice");
      }
    };
    tryRecover();
  }, []);

  const createFamily = async () => {
    if (!familyName) return;
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("create_family", { p_family_name: familyName });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setStep("addchild");
  };

  const addChild = async () => {
    if (!childName || !childBirth) return;
    if (new Date(childBirth) >= new Date()) { setErr("Data de nascimento inválida."); return; }
    setErr(""); setLoading(true);
    const { data: childId, error } = await supabase.rpc("add_child", {
      p_display_name: childName,
      p_avatar_emoji: avatar,
      p_age: calcAge(childBirth),
    });
    if (error) { setLoading(false); setErr(error.message); return; }
    if (childId && childBirth) {
      await supabase.from("profiles").update({ birth_date: childBirth }).eq("id", childId);
    }
    setLoading(false);
    onDone();
  };

  const joinFamily = async () => {
    if (!joinCode.trim()) return;
    setErr(""); setLoading(true);
    const { error } = await supabase.rpc("join_family_by_code", { p_code: joinCode.trim() });
    setLoading(false);
    if (error) { setErr(error.message || "Código inválido ou expirado"); return; }
    onDone();
  };

  const totalSteps = step === "join" ? 1 : 2;
  const currentStep = step === "choice" ? 0 : step === "create" ? 0 : step === "join" ? 0 : 1;

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", padding: "0 24px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>

        {/* RECOVERING */}
        {step === "recovering" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <div style={{ color: T.textMuted, fontSize: 15 }}>Verificando sua conta...</div>
          </div>
        )}

        {/* CHOICE */}
        {step === "choice" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
              <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Bem-vindo!</div>
              <div style={{ color: T.textMuted, fontSize: 15 }}>Como deseja começar?</div>
            </div>
            <button onClick={() => setStep("create")} style={{ width: "100%", padding: "20px 24px", borderRadius: 20, border: `2px solid ${T.primary}55`, background: `${T.primary}14`, color: T.text, cursor: "pointer", fontFamily: "'Nunito', sans-serif", marginBottom: 14, textAlign: "left", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 36 }}>🏠</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: T.primary }}>Criar minha família</div>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>Comece do zero com sua família</div>
              </div>
            </button>
            <button onClick={() => setStep("join")} style={{ width: "100%", padding: "20px 24px", borderRadius: 20, border: `2px solid ${T.accent}55`, background: `${T.accent}0E`, color: T.text, cursor: "pointer", fontFamily: "'Nunito', sans-serif", textAlign: "left", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 36 }}>🔗</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: T.accent }}>Entrar com convite</div>
                <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>Tenho um código de outro responsável</div>
              </div>
            </button>
          </>
        )}

        {/* CREATE FAMILY */}
        {step === "create" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🏠</div>
              <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Criar família</div>
              <div style={{ color: T.textMuted, fontSize: 15 }}>Dê um nome para a sua família</div>
            </div>
            <Inp icon="🏠" placeholder="Ex: Família Silva" value={familyName} onChange={e => setFamilyName(e.target.value)} />
            {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
            <Btn onClick={createFamily} disabled={loading || !familyName}>{loading ? "Criando..." : "Próximo →"}</Btn>
            <button onClick={() => { setStep("choice"); setErr(""); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 13, marginTop: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%", textAlign: "center" }}>← Voltar</button>
          </>
        )}

        {/* ADD CHILD */}
        {step === "addchild" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>👶</div>
              <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Adicionar filho(a)</div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <AvatarImg value={avatar} size={72} radius={22} />
            </div>
            <DiceBearPicker value={avatar} onChange={setAvatar} />
            <div style={{ marginTop: 14 }}>
              <Inp icon="🧒" placeholder="Nome do filho(a)" value={childName} onChange={e => setChildName(e.target.value)} />
              <DateInp value={childBirth} onChange={e => setChildBirth(e.target.value)} />
              {childBirth && <div style={{ color: T.textMuted, fontSize: 12, marginTop: -10, marginBottom: 12, paddingLeft: 4 }}>{calcAge(childBirth)} anos</div>}
              {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
              <Btn onClick={addChild} disabled={loading || !childName || !childBirth} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>{loading ? "Salvando..." : "🚀 Começar a aventura!"}</Btn>
              <button onClick={onDone} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 13, marginTop: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%", textAlign: "center" }}>Pular por agora</button>
            </div>
          </>
        )}

        {/* JOIN WITH CODE */}
        {step === "join" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🔗</div>
              <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Código de convite</div>
              <div style={{ color: T.textMuted, fontSize: 15 }}>Digite o código de convite que o responsável compartilhou</div>
            </div>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Código de convite"
              maxLength={8}
              style={{ width: "100%", padding: "18px 24px", borderRadius: 20, background: "rgba(255,255,255,0.06)", border: `2px solid ${T.accent}55`, color: T.text, fontSize: 28, fontFamily: "'Nunito', sans-serif", fontWeight: 900, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 8, marginBottom: 16 }}
            />
            {err && <div style={{ color: T.pink, fontSize: 13, fontWeight: 700, marginBottom: 12, background: `${T.pink}18`, borderRadius: 12, padding: "10px 14px" }}>⚠️ {err}</div>}
            <Btn onClick={joinFamily} disabled={loading || joinCode.length < 4} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>{loading ? "Verificando..." : "🔗 Entrar na família"}</Btn>
            <button onClick={() => { setStep("choice"); setErr(""); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 13, marginTop: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%", textAlign: "center" }}>← Voltar</button>
          </>
        )}
      </div>

      {step !== "choice" && step !== "recovering" && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingBottom: 40 }}>
          {Array.from({length: totalSteps}).map((_, i) => (
            <div key={i} style={{ width: i === currentStep ? 28 : 8, height: 8, borderRadius: 999, background: i === currentStep ? T.primary : "rgba(255,255,255,0.15)", transition: "all 0.3s" }} />
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// CHILD DASHBOARD
// ═══════════════════════════════════════════════════════════
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
  const [siblings, setSiblings] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [demeritLogs, setDemeritLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [streakDays, setStreakDays] = useState([]); // last 7 days active?
  const [submitting, setSubmitting] = useState(null); // mission id being submitted
  const [quantities, setQuantities] = useState({});   // { [rewardId]: number }
  const [familyPlan, setFamilyPlan] = useState("free");
  const [showUpgrade, setShowUpgrade] = useState(false);

  const qty    = (rid) => quantities[rid] || 1;
  const setQty = (rid, delta, max) =>
    setQuantities(prev => ({ ...prev, [rid]: Math.min(max, Math.max(1, (prev[rid] || 1) + delta)) }));

  const lvl  = getLvl(profile.xp || 0);
  const next = getNext(profile.xp || 0);
  const xpIn  = (profile.xp || 0) - lvl.xpNeeded;
  const xpFor = next.xpNeeded - lvl.xpNeeded;

  // Atualização otimista de coins — não depende do onRefresh() terminar
  const [localCoins, setLocalCoins] = useState(profile.kidcoins || 0);
  useEffect(() => { setLocalCoins(profile.kidcoins || 0); }, [profile.kidcoins]);

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };

  const deleteChildAccount = async () => {
    setDeletingAccount(true);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) { setDeletingAccount(false); return notify(error.message, "error"); }
    await supabase.auth.signOut();
    setDeletingAccount(false);
    onSignOut();
  };

  const missionsRef = useRef([]);

  useEffect(() => {
    load();
    // Realtime — escuta aprovação de missão
    const channel = supabase
      .channel(`approved-${profile.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "mission_logs",
        filter: `child_id=eq.${profile.id}`,
      }, async (payload) => {
        if (payload.new.status === "approved") {
          load();
          if (onRefresh) onRefresh();
          let mission = missionsRef.current.find(m => m.id === payload.new.mission_id);
          // Fallback: ref vazio se load() ainda não completou — busca direto no banco
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
              `Uhuuul! Missão concluída! Você está arrasando! Cada missão te deixa mais forte! 💪⭐`,
              `Que aventureiro incrível! Missão cumprida com sucesso! O Capitão Rotina está orgulhoso! 🎖️`,
            ];
            const msg = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            setCelebration({ msg, coins: coinsEarned, xp: xpGained, levelUp });
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const last7  = Array.from({length: 7},  (_, i) => localDateStr(i));
      const last30 = Array.from({length: 30}, (_, i) => localDateStr(i));
      const [{ data: m }, { data: r }, { data: a }, { data: l }, { data: sd }, { data: planData }] = await Promise.all([
        supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active", true),
        supabase.from("rewards").select("*").eq("family_id", profile.family_id).eq("is_active", true),
        supabase.from("achievements").select("*").order("condition_val"),
        supabase.from("mission_logs").select("*").eq("child_id", profile.id).in("due_date", last30).in("status", ["pending","approved"]),
        supabase.from("mission_logs").select("due_date").eq("child_id", profile.id).eq("status", "approved").in("due_date", last7),
        supabase.rpc("get_family_plan"),
      ]);
      setFamilyPlan(planData || "free");
      missionsRef.current = m || [];
      setMissions(m || []); setRewards(r || []); setLogs(l || []);
      const activeDaysSet = new Set((sd || []).map(x => x.due_date));
      setStreakDays(last7.reverse().map(d => activeDaysSet.has(d)));
      if (a) {
        const { data: earned } = await supabase.from("child_achievements").select("achievement_id").eq("child_id", profile.id);
        const earnedSet = new Set((earned || []).map(e => e.achievement_id));
        setAch(a.map(ach => ({ ...ach, earned: earnedSet.has(ach.id) })));
      }
    } catch {
      // queries failed — don't leave screen stuck in loading
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "profile") loadProfileExtras();
  }, [tab]);

  const loadProfileExtras = async () => {
    setHistoryLoading(true);
    try {
      const [{ data: sibs }, { data: hist }, { data: dem }] = await Promise.all([
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
      setSiblings(sibs || []);
      setHistoryLogs(hist || []);
      setDemeritLogs(dem || []);
    } catch {
      // silent — profile extras are optional
    } finally {
      setHistoryLoading(false);
    }
  };

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

  const submit = async (mid) => {
    setSubmitting(mid);
    const { error } = await supabase.rpc("submit_mission", { p_mission_id: mid, p_due_date: localDateStr(0) });
    setSubmitting(null);
    if (error) return notify("Erro ao enviar missão", "error");
    notify("✅ Missão enviada para aprovação!"); load();
  };

  const redeem = async (rid, cost) => {
    const n     = qty(rid);
    const total = cost * n;
    if (localCoins < total) return notify("KidCoins insuficientes! 😢", "error");
    setLocalCoins(prev => prev - total); // otimista
    const { error } = await supabase.rpc("request_redemption_bulk", { p_reward_id: rid, p_quantity: n });
    if (error) {
      setLocalCoins(profile.kidcoins || 0); // rollback
      return notify(error.message || "Erro ao resgatar", "error");
    }
    setQuantities(prev => ({ ...prev, [rid]: 1 }));
    notify(`🎁 ${n > 1 ? `${n}x ` : ""}Recompensa solicitada! Aguarde a entrega.`);
    load();
    if (onRefresh) onRefresh();
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, overflow: "hidden", background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AvatarImg value={profile.avatar_emoji} size={48} radius={14} />
            </div>
            <div>
              <div style={{ color: T.textMuted, fontSize: 11 }}>{getSaudacao()},</div>
              <div style={{ color: T.text, fontSize: 17, fontWeight: 900 }}>👋 {profile.display_name}!</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.card, borderRadius: 14, padding: "8px 14px", border: `1px solid ${T.secondary}33` }}>
            <span>🪙</span><span style={{ color: T.secondary, fontWeight: 900, fontSize: 16 }}>{localCoins}</span>
          </div>
        </div>

        {/* Level card */}
        <div style={{ background: `linear-gradient(135deg, ${T.card}, ${T.cardLight})`, borderRadius: 20, padding: "16px 20px", border: `1px solid ${lvl.color}33`, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>{lvl.emoji}</span>
              <div>
                <div style={{ color: lvl.color, fontWeight: 900, fontSize: 11, letterSpacing: 1 }}>NÍVEL {lvl.level}</div>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>{lvl.name}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: T.textMuted, fontSize: 10 }}>Streak</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span>🔥</span><span style={{ color: T.warning, fontWeight: 900, fontSize: 18 }}>{profile.streak || 0}</span></div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: T.textMuted }}>XP: {xpIn}/{xpFor}</span>
            <span style={{ fontSize: 11, color: lvl.color }}>→ {next.name}</span>
          </div>
          <XPBar current={xpIn} max={xpFor} color={lvl.color} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 90px" }}>
        {loading ? <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Carregando... ⏳</div> : <>

          {/* HOME */}
          {tab === "home" && (
            <div>
              {/* Missão Surpresa IA */}
              <div style={{ background: `linear-gradient(135deg, ${T.purple}, ${T.pink})`, borderRadius: 22, padding: 20, marginBottom: 20, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -16, top: -16, fontSize: 72, opacity: 0.12, pointerEvents: "none" }}>🎲</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>🎲 Missão Surpresa</div>
                    <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 }}>Gerada por IA só pra você!</div>
                  </div>
                  {!surpriseMission ? (
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

              {/* Streak Calendar — 7 dias */}
              {streakDays.length === 7 && (
                <div style={{ background: T.card, borderRadius: 20, padding: "14px 16px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>ÚLTIMOS 7 DIAS</div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
                    {(() => {
                      const dayLabels = ["D","S","T","Q","Q","S","S"];
                      return streakDays.map((active, i) => {
                        const d = new Date(); d.setDate(d.getDate() - (6 - i));
                        const label = dayLabels[d.getDay()];
                        const isToday = i === 6;
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div style={{ fontSize: 10, color: isToday ? T.primary : T.textMuted, fontWeight: isToday ? 800 : 600 }}>{label}</div>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: active ? `linear-gradient(135deg, ${T.warning}, ${T.primary})` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: isToday && !active ? `2px solid ${T.primary}44` : "none", boxShadow: active ? `0 0 8px ${T.warning}55` : "none" }}>
                              {active ? "🔥" : "⚪"}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🎯 Missões</div>
              {missions.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>Nenhuma missão ainda!</div>
                : missions.map((m, mi) => {
                    const log = getLog(m.id, m.frequency);
                    const done = log?.status === "approved";
                    const pend = log?.status === "pending";
                    return (
                      <div key={m.id} style={{ background: done ? `${T.accent}11` : pend ? `${T.secondary}11` : T.card, borderRadius: 18, padding: 16, marginBottom: 12, border: `1px solid ${done ? T.accent+"44" : pend ? T.secondary+"44" : "rgba(255,255,255,0.06)"}`, opacity: done ? 0.75 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 18, fontSize: 28, background: done ? `${T.accent}22` : iconGrad(mi), border: `1px solid ${done ? T.accent+"44" : iconBorder(mi)}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: done ? "none" : `0 4px 12px rgba(0,0,0,0.2)` }}>{done ? "✅" : m.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: done ? T.textMuted : T.text, fontWeight: 700, fontSize: 15, textDecoration: done ? "line-through" : "none" }}>{m.title}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, color: T.secondary }}>🪙 {m.coins_reward}</span>
                              <span style={{ fontSize: 11, color: T.accent }}>+{m.xp_reward} XP</span>
                              {m.frequency && m.frequency !== "daily" && <span style={{ fontSize: 10, color: T.purple, background: `${T.purple}22`, borderRadius: 6, padding: "1px 6px", fontWeight: 800 }}>{freqLabel(m.frequency)}</span>}
                            </div>
                          </div>
                          {!done && !pend && <button onClick={() => submit(m.id)} disabled={submitting === m.id} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 12, cursor: submitting === m.id ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>{submitting === m.id ? "..." : "Feito!"}</button>}
                          {pend && <span style={{ fontSize: 11, color: T.secondary, fontWeight: 700, flexShrink: 0 }}>⏳ Aguardando</span>}
                        </div>
                      </div>
                    );
                  })
              }
              {/* Badge "Missões Concluídas" */}
              {missions.length > 0 && missions.every(m => getLog(m.id, m.frequency)?.status === "approved") && (
                <div style={{ background: `linear-gradient(135deg, ${T.accent}22, ${T.blue}22)`, borderRadius: 20, padding: "18px 20px", textAlign: "center", border: `2px solid ${T.accent}55`, animation: "bounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
                  <div style={{ fontSize: 44, marginBottom: 8 }}>🌟</div>
                  <div style={{ color: T.accent, fontWeight: 900, fontSize: 17, marginBottom: 4 }}>Missões do Dia Concluídas!</div>
                  <div style={{ color: T.textMuted, fontSize: 13 }}>Você é incrível! Continue assim amanhã 🚀</div>
                </div>
              )}
            </div>
          )}

          {/* STORE */}
          {tab === "store" && (
            <div>
              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🏪 Loja</div>
              <div style={{ color: T.textMuted, fontSize: 13, marginBottom: 20 }}>Saldo: <span style={{ color: T.secondary, fontWeight: 800 }}>🪙 {localCoins}</span></div>
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
              {achievements.map(a => {
                const isStreak = a.condition_key === "streak_days";
                const currentStreak = profile.streak || 0;
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
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 430 }}>
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
                <div onClick={() => setEditingAvatar(true)} style={{ position: "relative", display: "inline-block", cursor: "pointer", marginBottom: 12 }}>
                  <div style={{ width: 100, height: 100, borderRadius: 30, background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <AvatarImg value={avatarEmoji} size={100} radius={28} />
                  </div>
                  <div style={{ position: "absolute", bottom: -4, right: -4, width: 28, height: 28, borderRadius: 10, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: `2px solid ${T.darker}` }}>✏️</div>
                </div>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 22 }}>{profile.display_name}</div>
                <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>{profile.age ? `${profile.age} anos · ` : ""}{lvl.name} {lvl.emoji}</div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {[
                  { label:"KidCoins", value:localCoins, icon:"🪙", color:T.secondary },
                  { label:"XP Total", value:profile.xp||0, icon:"⚡", color:T.accent },
                  { label:"Nível", value:lvl.level, icon:lvl.emoji, color:lvl.color },
                  { label:"Streak", value:`${profile.streak||0}🔥`, icon:"", color:T.warning },
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
const UpgradeModal = ({ onClose }) => {
  const [billing, setBilling] = useState("annual");
  const plan = PLANS[billing];

  const FREE_ITEMS = ["1 filho", "1 responsável (só você)", "Até 5 missões ativas", "Até 3 recompensas ativas", "IA: sugestão de missões (limitado)", "Gamificação completa (XP, níveis, streak, conquistas)"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "28px 28px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: 430, maxHeight: "92vh", overflowY: "auto", animation: "slideDown 0.3s ease" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>👑</div>
          <div style={{ color: T.text, fontWeight: 900, fontSize: 22, marginBottom: 6 }}>RotinUp Premium</div>
          <div style={{ color: T.textMuted, fontSize: 14 }}>Desbloqueie todo o potencial da família</div>
        </div>

        {/* Toggle Mensal / Anual */}
        <div style={{ display: "flex", background: T.darker, borderRadius: 16, padding: 4, marginBottom: 20, border: "1px solid rgba(255,255,255,0.08)" }}>
          {Object.entries(PLANS).map(([key, p]) => (
            <button key={key} onClick={() => setBilling(key)} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: "none", background: billing === key ? `linear-gradient(135deg, ${T.purple}, ${T.pink})` : "transparent", color: billing === key ? "#fff" : T.textMuted, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span>{p.label}</span>
              {billing === key && <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.85 }}>{p.badge}</span>}
            </button>
          ))}
        </div>

        {/* Preço */}
        <div style={{ background: `linear-gradient(135deg, ${T.purple}22, ${T.pink}18)`, borderRadius: 20, padding: "20px 20px", textAlign: "center", border: `2px solid ${T.purple}44`, marginBottom: 20, position: "relative", overflow: "hidden" }}>
          {billing === "annual" && (
            <div style={{ position: "absolute", top: 12, right: 12, background: `linear-gradient(135deg, ${T.accent}, ${T.blue})`, borderRadius: 8, padding: "3px 10px", fontSize: 10, fontWeight: 900, color: "#fff" }}>
              Economize {plan.savings}
            </div>
          )}
          {billing === "monthly" && (
            <div style={{ position: "absolute", top: 12, right: 12, background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, borderRadius: 8, padding: "3px 10px", fontSize: 10, fontWeight: 900, color: "#fff" }}>
              Lançamento
            </div>
          )}
          <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 4 }}>
            {billing === "annual" ? "Cobrança única anual" : "Cobrança mensal recorrente"}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2 }}>
            <span style={{ color: T.textMuted, fontSize: 16, fontWeight: 700 }}>R$</span>
            <span style={{ color: T.purple, fontWeight: 900, fontSize: 40, lineHeight: 1 }}>{plan.price}</span>
            <span style={{ color: T.textMuted, fontSize: 14 }}>{plan.period}</span>
          </div>
          {billing === "annual" && plan.total && (
            <div style={{ color: T.accent, fontSize: 12, fontWeight: 700, marginTop: 6 }}>
              equivale a R$ {plan.total} — acesso por 12 meses
            </div>
          )}
          {billing === "monthly" && (
            <div style={{ color: T.textMuted, fontSize: 11, marginTop: 6 }}>Cancele quando quiser</div>
          )}
        </div>

        {/* Comparativo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: T.darker, borderRadius: 20, padding: "16px 14px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color: T.textMuted, fontWeight: 900, fontSize: 12, letterSpacing: 1, marginBottom: 12 }}>GRÁTIS</div>
            {FREE_ITEMS.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
                <span style={{ color: T.textMuted, fontSize: 12, marginTop: 1, flexShrink: 0 }}>◦</span>
                <span style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: `linear-gradient(160deg, ${T.purple}22, ${T.pink}18)`, borderRadius: 20, padding: "16px 14px", border: `2px solid ${T.purple}55` }}>
            <div style={{ color: T.purple, fontWeight: 900, fontSize: 12, letterSpacing: 1, marginBottom: 12 }}>PREMIUM 👑</div>
            {PREM_ITEMS.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
                <span style={{ color: T.accent, fontSize: 12, marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ color: T.text, fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <a href={billing === "annual" ? HOTMART_ANNUAL : HOTMART_MONTHLY} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", width: "100%", padding: "16px 24px", borderRadius: 18, border: "none", background: `linear-gradient(135deg, ${T.purple}, ${T.pink})`, color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", textDecoration: "none", textAlign: "center", boxShadow: `0 8px 24px ${T.purple}44`, marginBottom: 12 }}>
          👑 Assinar {plan.label} — R$ {plan.price}{plan.period}
        </a>
        <button onClick={onClose} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
          Continuar no plano gratuito
        </button>
      </div>
    </div>
  );
};

// ─── Mission Modal ────────────────────────────────────────
const MissionModal = ({ mission, emojis, onSave, onDeactivate, onClose }) => {
  const [title, setTitle]     = useState(mission.title || "");
  const [emoji, setEmoji]     = useState(mission.emoji || "⭐");
  const [coins, setCoins]     = useState(mission.coins_reward ?? 20);
  const [xp, setXp]           = useState(mission.xp_reward ?? 15);
  const [frequency, setFreq]  = useState(mission.frequency || "daily");
  const [saving, setSaving]   = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), emoji, coins_reward: coins, xp_reward: xp, frequency });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 18, marginBottom: 20, textAlign: "center" }}>✏️ Editar Missão</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
          {emojis.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{ width: 40, height: 40, borderRadius: 10, fontSize: 20, border: `2px solid ${emoji === e ? T.primary : "rgba(255,255,255,0.1)"}`, background: emoji === e ? `${T.primary}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{e}</button>
          ))}
        </div>
        <Inp icon={emoji} placeholder="Nome da missão" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} />
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 8 }}>FREQUÊNCIA</div>
          <div style={{ display: "flex", gap: 6 }}>
            {FREQ_OPTS.map(o => (
              <button key={o.key} onClick={() => setFreq(o.key)}
                style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `2px solid ${frequency === o.key ? T.purple : "rgba(255,255,255,0.1)"}`, background: frequency === o.key ? `${T.purple}22` : "rgba(255,255,255,0.04)", color: frequency === o.key ? T.purple : T.textMuted, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                {o.emoji}<br/>{o.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>KidCoins</div>
            <input type="number" value={coins} onChange={e => setCoins(+e.target.value)} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>XP</div>
            <input type="number" value={xp} onChange={e => setXp(+e.target.value)} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <Btn onClick={handleSave} disabled={saving || !title.trim()} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>
            {saving ? "Salvando..." : "✅ Salvar"}
          </Btn>
          <Btn onClick={onClose} outline small>Cancelar</Btn>
        </div>
        <button onClick={() => { if (!confirm) { setConfirm(true); return; } onDeactivate(); }} style={{ width: "100%", padding: "13px", borderRadius: 14, border: `1px solid ${confirm ? T.pink : "rgba(255,255,255,0.1)"}`, background: confirm ? `${T.pink}22` : "transparent", color: confirm ? T.pink : T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s" }}>
          {confirm ? "⚠️ Confirmar desativação" : "🗑️ Desativar missão"}
        </button>
      </div>
    </div>
  );
};

// ─── Reward Modal ─────────────────────────────────────────
const RewardModal = ({ reward, emojis, onSave, onDeactivate, onClose }) => {
  const [title, setTitle]   = useState(reward.title || "");
  const [emoji, setEmoji]   = useState(reward.emoji || "🎁");
  const [cost, setCost]     = useState(reward.coin_cost ?? 50);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), emoji, coin_cost: cost });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 18, marginBottom: 20, textAlign: "center" }}>✏️ Editar Recompensa</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
          {emojis.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{ width: 40, height: 40, borderRadius: 10, fontSize: 20, border: `2px solid ${emoji === e ? T.secondary : "rgba(255,255,255,0.1)"}`, background: emoji === e ? `${T.secondary}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{e}</button>
          ))}
        </div>
        <Inp icon={emoji} placeholder="Nome da recompensa" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} />
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>Custo em KidCoins</div>
          <input type="number" value={cost} onChange={e => setCost(+e.target.value)} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <Btn onClick={handleSave} disabled={saving || !title.trim()} gradient={`linear-gradient(135deg, ${T.secondary}, ${T.primary})`}>
            {saving ? "Salvando..." : "✅ Salvar"}
          </Btn>
          <Btn onClick={onClose} outline small>Cancelar</Btn>
        </div>
        <button onClick={() => { if (!confirm) { setConfirm(true); return; } onDeactivate(); }} style={{ width: "100%", padding: "13px", borderRadius: 14, border: `1px solid ${confirm ? T.pink : "rgba(255,255,255,0.1)"}`, background: confirm ? `${T.pink}22` : "transparent", color: confirm ? T.pink : T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s" }}>
          {confirm ? "⚠️ Confirmar desativação" : "🗑️ Desativar recompensa"}
        </button>
      </div>
    </div>
  );
};

// ─── Extrato Modal ────────────────────────────────────────
const ExtratoModal = ({ child, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [{ data: missions }, { data: redemptions }, { data: demerits }, { data: streakBonuses }] = await Promise.all([
        supabase.from("mission_logs")
          .select("id,coins_earned,due_date,missions(title,emoji)")
          .eq("child_id", child.id)
          .eq("status", "approved")
          .order("due_date", { ascending: false })
          .limit(30),
        supabase.from("redemption_logs")
          .select("id,reward_title,reward_emoji,coin_cost,status,created_at")
          .eq("child_id", child.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("demerit_logs")
          .select("id,title,emoji,coins_deducted,created_at")
          .eq("child_id", child.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("streak_bonus_logs")
          .select("id,coins_awarded,streak_days,created_at,achievements(emoji,name)")
          .eq("child_id", child.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const all = [
        ...(missions || []).map(m => ({
          id: m.id, type: "mission",
          emoji: m.missions?.emoji || "✅",
          label: m.missions?.title || "Missão",
          coins: +(m.coins_earned || 0),
          date: m.due_date,
          sortKey: m.due_date,
        })),
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
          emoji: s.achievements?.emoji || "🔥",
          label: s.achievements?.name || `${s.streak_days} dias seguidos!`,
          coins: +(s.coins_awarded || 0),
          date: s.created_at?.slice(0, 10),
          sortKey: s.created_at,
        })),
      ].sort((a, b) => (b.sortKey || "").localeCompare(a.sortKey || ""));

      setItems(all);
      setLoading(false);
    };
    fetch();
  }, [child.id]);

  const typeColor = { mission: T.accent, redemption: T.secondary, demerit: T.pink, streak: T.primary };
  const typeLabel = { mission: "Bônus", redemption: "Resgate", demerit: "Tropeço", streak: "Sequência" };

  const total = items.reduce((sum, i) => sum + i.coins, 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 9200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0 }}>
          <AvatarImg value={child.avatar_emoji} size={44} radius={14} />
          <div style={{ flex: 1 }}>
            <div style={{ color: T.text, fontWeight: 900, fontSize: 17 }}>📋 Extrato de {child.display_name}</div>
            <div style={{ color: T.textMuted, fontSize: 12 }}>Bônus, resgates e tropeços</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Saldo do extrato */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16, flexShrink: 0 }}>
          {[
            { label: "Ganhos", value: items.filter(i=>i.coins>0).reduce((s,i)=>s+i.coins,0), color: T.accent, sign: "+" },
            { label: "Gastos", value: items.filter(i=>i.coins<0).reduce((s,i)=>s+i.coins,0), color: T.pink, sign: "" },
            { label: "Saldo atual", value: child.kidcoins || 0, color: T.secondary, sign: "" },
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
            const color = typeColor[item.type];
            return (
              <div key={`${item.type}-${item.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{item.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.text, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: color, fontWeight: 800, background: `${color}18`, borderRadius: 6, padding: "1px 6px" }}>{typeLabel[item.type]}</span>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{item.date}</span>
                    {item.type === "redemption" && item.status === "pending" && <span style={{ fontSize: 10, color: T.secondary, fontWeight: 700 }}>⏳ aguardando entrega</span>}
                    {item.type === "redemption" && item.status === "cancelled" && <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700 }}>❌ cancelado</span>}
                  </div>
                </div>
                <div style={{ color: item.status === "cancelled" ? T.textMuted : positive ? T.accent : T.pink, fontWeight: 900, fontSize: 14, flexShrink: 0, textDecoration: item.status === "cancelled" ? "line-through" : "none", opacity: item.status === "cancelled" ? 0.5 : 1 }}>
                  {item.status === "cancelled" ? `-${item.rawCost || 0}🪙` : `${positive ? "+" : ""}${item.coins}🪙`}
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
  const [selected, setSelected] = useState(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customEmoji, setCustomEmoji] = useState("⚠️");
  const [coins, setCoins] = useState(0);
  const [applying, setApplying] = useState(false);

  const preset = selected !== null && selected >= 0 ? DEMERIT_PRESETS[selected] : null;
  const title = preset ? preset.title : customTitle;
  const emoji = preset ? preset.emoji : customEmoji;
  const canApply = selected !== null && title.trim().length > 0 && coins >= 0;

  useEffect(() => {
    if (preset) setCoins(preset.coins);
    else if (selected === -1) { setCustomTitle(""); setCoins(0); }
  }, [selected]);

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    await onApply({ childId: child.id, title: title.trim(), emoji, coins });
    setApplying(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 9200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease", maxHeight: "90vh", overflowY: "auto" }}>
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
            <button key={i} onClick={() => setSelected(i)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 14, border: `2px solid ${selected === i ? T.pink : "rgba(255,255,255,0.1)"}`, background: selected === i ? `${T.pink}15` : "rgba(255,255,255,0.03)", cursor: "pointer", fontFamily: "'Nunito', sans-serif", textAlign: "left" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{p.emoji}</span>
              <div style={{ flex: 1, color: selected === i ? T.text : T.textMuted, fontWeight: 700, fontSize: 13 }}>{p.title}</div>
              <span style={{ color: T.pink, fontWeight: 900, fontSize: 12, flexShrink: 0 }}>-🪙{p.coins}</span>
            </button>
          ))}
          <button onClick={() => setSelected(-1)}
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

// ═══════════════════════════════════════════════════════════
// PARENT DASHBOARD
// ═══════════════════════════════════════════════════════════
const ParentDash = ({ profile, onSignOut, onRefresh }) => {
  const [tab, setTab]             = useState("home");
  const [children, setChildren]   = useState([]);
  const [missions, setMissions]   = useState([]);
  const [pending, setPending]     = useState([]);
  const [rewards, setRewards]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [notif, setNotif]         = useState(null);
  const [notifType, setNotifType] = useState("success");
  const [showMission, setShowMission]   = useState(false);
  const [showReward, setShowReward]     = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [newM, setNewM] = useState({ title:"", emoji:"⭐", coins_reward:20, xp_reward:15, frequency:"daily" });
  const [newR, setNewR] = useState({ title:"", emoji:"🎁", coin_cost:50 });
  const [aiLoading, setAiLoading] = useState(null); // "missions" | "report" | null
  const [aiMissions, setAiMissions] = useState([]);
  const [aiReport, setAiReport] = useState(null);
  const [aiError, setAiError]   = useState(null);
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
  const [childLogs, setChildLogs]           = useState([]);
  const [checkingMission, setCheckingMission] = useState(null); // "childId-missionId"
  const [redemptions, setRedemptions]         = useState([]);
  const [confirmingRed, setConfirmingRed]     = useState(null);
  const [cancellingRed, setCancellingRed]     = useState(null);
  const [demeritTarget, setDemeritTarget]     = useState(null); // child object
  const [extratoTarget, setExtratoTarget]     = useState(null); // child object
  const [coParents, setCoParents]             = useState([]);
  const [removingCoParent, setRemovingCoParent] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [inactiveMissions, setInactiveMissions] = useState([]);
  const [showArchivedMissions, setShowArchivedMissions] = useState(false);
  const [showArchivedRewards, setShowArchivedRewards]   = useState(false);
  const [reactivating, setReactivating]       = useState(null);

  const notify = (msg, type="success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };
  const tryAddChild = () => { if (familyPlan === "free" && children.length >= 1) { setShowUpgrade(true); } else { setShowAddChild(true); } };

  const loadInviteCode = async () => {
    const { data } = await supabase.rpc("get_invite_code");
    if (data && typeof data === "object") {
      setInviteCode(data.code || null);
      setInviteExpiresAt(data.expires_at || null);
    } else {
      setInviteCode(null);
      setInviteExpiresAt(null);
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
    if (error) return notify("Erro ao salvar nome: " + error.message, "error");
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
    setRemovingCoParent(targetId);
    const { error } = await supabase.rpc("remove_co_parent", { p_target_id: targetId });
    setRemovingCoParent(null);
    if (error) return notify(error.message, "error");
    notify("✅ Co-responsável removido");
    loadCoParents();
  };

  const deleteAccount = async () => {
    setDeletingAccount(true);
    const { data, error } = await supabase.rpc("delete_my_account");
    if (error) { setDeletingAccount(false); return notify(error.message, "error"); }
    await supabase.auth.signOut();
    setDeletingAccount(false);
    onSignOut();
  };

  const reactivateMission = async (missionId) => {
    setReactivating(missionId);
    const { error } = await supabase.rpc("reactivate_mission", { p_mission_id: missionId });
    setReactivating(null);
    if (error) return notify(error.message, "error");
    notify("✅ Missão reativada!");
    load();
  };

  const reactivateReward = async (rewardId) => {
    setReactivating(rewardId);
    const { error } = await supabase.rpc("reactivate_reward", { p_reward_id: rewardId });
    setReactivating(null);
    if (error) return notify(error.message, "error");
    notify("✅ Recompensa reativada!");
    load();
  };

  useEffect(() => {
    load();
    loadInviteCode();
    loadFamilyPlan();
    loadCoParents();
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
    return () => supabase.removeChannel(channel);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const last30 = Array.from({length: 30}, (_, i) => localDateStr(i));
      const [{ data: ch }, { data: m }, { data: mi }, { data: p }, { data: r }, { data: cl }, { data: rd }] = await Promise.all([
        supabase.from("profiles").select("*").eq("family_id", profile.family_id).eq("role","child"),
        supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active",true),
        supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active",false),
        supabase.from("pending_approvals").select("*"),
        supabase.from("rewards").select("*").eq("family_id", profile.family_id),
        supabase.from("mission_logs").select("mission_id, child_id, status, due_date").eq("family_id", profile.family_id).in("due_date", last30).in("status",["pending","approved"]),
        supabase.from("redemption_logs").select("*").eq("family_id", profile.family_id).eq("status","pending").order("created_at", { ascending: false }),
      ]);
      setChildren(ch||[]); setMissions(m||[]); setInactiveMissions(mi||[]); setPending(p||[]); setRewards(r||[]); setChildLogs(cl||[]); setRedemptions(rd||[]);
    } catch {
      // queries failed — don't leave screen stuck in loading
    } finally {
      setLoading(false);
    }
  };

  const getChildLog = (childId, missionId, frequency = "daily") => {
    const cutoffDays = { daily: 0, weekly: 6, biweekly: 13, monthly: 29 }[frequency] ?? 0;
    const cutoffStr = localDateStr(cutoffDays);
    return childLogs.find(l => l.child_id === childId && l.mission_id === missionId && l.due_date >= cutoffStr);
  };

  const parentCheck = async (childId, missionId) => {
    const key = `${childId}-${missionId}`;
    setCheckingMission(key);
    const { error } = await supabase.rpc("parent_check_mission", { p_child_id: childId, p_mission_id: missionId });
    setCheckingMission(null);
    if (error) return notify(error.message || "Erro ao marcar missão", "error");
    notify("✅ Missão marcada como concluída!"); load();
  };

  const confirmDelivery = async (redemptionId) => {
    setConfirmingRed(redemptionId);
    const { error } = await supabase.rpc("confirm_redemption", { p_log_id: redemptionId });
    setConfirmingRed(null);
    if (error) return notify(error.message || "Erro ao confirmar entrega", "error");
    notify("✅ Entrega confirmada!"); load();
  };

  const cancelRedemption = async (redemptionId) => {
    setCancellingRed(redemptionId);
    const { error } = await supabase.rpc("cancel_redemption", { p_log_id: redemptionId });
    setCancellingRed(null);
    if (error) return notify(error.message || "Erro ao cancelar", "error");
    notify("🔄 Solicitação cancelada. Coins devolvidos."); load();
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
    const { error } = await supabase.rpc("review_mission", { p_log_id: logId, p_approve: approve, p_note: approve ? "Ótimo trabalho! 🎉" : "Tente novamente!" });
    if (error) return notify("Erro ao revisar", "error");
    notify(approve ? "✅ Aprovado! KidCoins liberados!" : "❌ Missão rejeitada");
    load();
  };

  const isLimitError = (msg = "") => msg.includes("Limite") || msg.includes("upgrade") || msg.includes("ilimitad");

  const createMission = async () => {
    if (!newM.title) return notify("Digite o nome da missão", "error");
    const { data, error } = await supabase.rpc("create_mission", {
      p_title: newM.title, p_emoji: newM.emoji,
      p_coins_reward: newM.coins_reward, p_xp_reward: newM.xp_reward, p_frequency: newM.frequency,
    });
    if (error) {
      if (isLimitError(error.message)) { setShowMission(false); setShowUpgrade(true); return; }
      return notify("Erro ao criar missão: " + error.message, "error");
    }
    if (data?.success === false) {
      if (isLimitError(data.error || "")) { setShowMission(false); setShowUpgrade(true); return; }
      return notify(data.error || "Erro ao criar missão", "error");
    }
    notify("🎯 Missão criada!"); setShowMission(false); setNewM({ title:"", emoji:"⭐", coins_reward:20, xp_reward:15, frequency:"daily" }); load();
  };

  const createReward = async () => {
    if (!newR.title) return notify("Digite o nome da recompensa", "error");
    const { data, error } = await supabase.rpc("create_reward", {
      p_title: newR.title, p_emoji: newR.emoji, p_coin_cost: newR.coin_cost,
    });
    if (error) {
      if (isLimitError(error.message)) { setShowReward(false); setShowUpgrade(true); return; }
      return notify("Erro ao criar recompensa: " + error.message, "error");
    }
    if (data?.success === false) {
      if (isLimitError(data.error || "")) { setShowReward(false); setShowUpgrade(true); return; }
      return notify(data.error || "Erro ao criar recompensa", "error");
    }
    notify("🎁 Recompensa criada!"); setShowReward(false); setNewR({ title:"", emoji:"🎁", coin_cost:50 }); load();
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
      const report = (rawReport || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
      setAiReport(report);
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("premium_required")) { setShowUpgrade(true); setAiLoading(null); return; }
      const isQuota = msg.includes("quota") || msg.includes("429");
      const isOverload = msg.includes("503") || msg.includes("overload") || msg.includes("UNAVAILABLE");
      setAiError(isQuota ? "Limite da IA atingido. Tente novamente mais tarde ⏳" : isOverload ? "IA sobrecarregada no momento. Tente em alguns segundos ⏳" : "Erro ao gerar relatório. Tente novamente.");
    }
    setAiLoading(null);
  };

  const addAIMission = async (m) => {
    const { data, error } = await supabase.rpc("create_mission", {
      p_title: m.title, p_emoji: m.emoji,
      p_coins_reward: m.coins_reward, p_xp_reward: m.xp_reward, p_frequency: m.frequency || "daily",
    });
    if (error) {
      if (isLimitError(error.message)) { setShowUpgrade(true); return; }
      return notify("Erro ao criar missão: " + error.message, "error");
    }
    if (data?.success === false) {
      if (isLimitError(data.error || "")) { setShowUpgrade(true); return; }
      return notify(data.error || "Erro ao criar missão", "error");
    }
    notify(`✅ "${m.title}" adicionada!`);
    setAiMissions(prev => prev.filter(x => x.title !== m.title));
    load();
  };

  const navTabs = [{key:"home",icon:"🏠",label:"Início"},{key:"missions",icon:"🎯",label:"Missões"},{key:"rewards",icon:"🎁",label:"Recompensas"},{key:"stats",icon:"📊",label:"Stats"}];

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column" }}>
      <Notif msg={notif} type={notifType} />

      {/* Modal upgrade */}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

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

      {/* Modal editar missão */}
      {editingMission && (() => {
        const m = editingMission;
        const MISSION_EMOJIS = ["⭐","🎯","📚","🏃","🧹","🛁","🍽️","🐕","🌱","🎨","🎮","📖","💪","🎵","✏️","🦷","🛏️","🧺","🗓️","🌍"];
        return (
          <MissionModal
            mission={m}
            emojis={MISSION_EMOJIS}
            onSave={async (data) => {
              const { error } = await supabase.rpc("update_mission", {
                p_mission_id: m.id, p_title: data.title, p_emoji: data.emoji,
                p_coins_reward: data.coins_reward, p_xp_reward: data.xp_reward, p_frequency: data.frequency,
              });
              if (error) return notify("Erro: " + error.message, "error");
              setEditingMission(null); load(); notify("✅ Missão atualizada!");
            }}
            onDeactivate={async () => {
              const { error } = await supabase.rpc("deactivate_mission", { p_mission_id: m.id });
              if (error) { notify("Erro ao remover: " + error.message, "error"); return; }
              setEditingMission(null); load(); notify("🗑️ Missão removida.");
            }}
            onClose={() => setEditingMission(null)}
          />
        );
      })()}

      {/* Modal editar recompensa */}
      {editingReward && (() => {
        const r = editingReward;
        const REWARD_EMOJIS = ["🎁","🍕","🎮","🎬","🏖️","🍦","📱","🎪","🎠","🚀","🎤","🎭","🏆","🛍️","🎲","🧸","🎸","🍫","🌟","💫"];
        return (
          <RewardModal
            reward={r}
            emojis={REWARD_EMOJIS}
            onSave={async (data) => {
              const { error } = await supabase.rpc("update_reward", {
                p_reward_id: r.id, p_title: data.title, p_emoji: data.emoji, p_coin_cost: data.coin_cost,
              });
              if (error) return notify("Erro: " + error.message, "error");
              setEditingReward(null); load(); notify("✅ Recompensa atualizada!");
            }}
            onDeactivate={async () => {
              const { error } = await supabase.rpc("deactivate_reward", { p_reward_id: r.id });
              if (error) { notify("Erro ao remover: " + error.message, "error"); return; }
              setEditingReward(null); load(); notify("🗑️ Recompensa removida.");
            }}
            onClose={() => setEditingReward(null)}
          />
        );
      })()}

      {/* Header com saudação personalizada */}
      <div style={{ padding: "16px 20px", background: `linear-gradient(135deg, ${T.primary}18, ${T.pink}0A)`, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: T.textMuted }}>{getSaudacao()},</div>
            <div style={{ color: T.text, fontSize: 20, fontWeight: 900 }}>👋 {profile.display_name}!</div>
          </div>
          {pending.length > 0 && (
            <div style={{ background: T.warning, color: T.darker, borderRadius: 12, padding: "4px 14px", fontWeight: 900, fontSize: 13, animation: "pulse 2s infinite" }}>
              {pending.length} pendente{pending.length>1?"s":""}
            </div>
          )}
        </div>
        {/* Banner upgrade — aparece para free com 1+ filho */}
        {familyPlan === "free" && children.length >= 1 && (
          <button onClick={() => setShowUpgrade(true)} style={{ marginTop: 12, width: "100%", padding: "10px 16px", borderRadius: 14, border: `1px solid ${T.purple}55`, background: `linear-gradient(135deg, ${T.purple}18, ${T.pink}12)`, color: T.text, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>👑</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontWeight: 800, color: T.purple }}>Upgrade para Premium</div>
              <div style={{ color: T.textMuted, fontSize: 11, marginTop: 1 }}>10 filhos, missões ilimitadas + IA completa · R$ 14,90/mês</div>
            </div>
            <span style={{ color: T.purple, fontWeight: 900 }}>→</span>
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
        {loading ? <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Carregando... ⏳</div> : <>

          {/* HOME */}
          {tab === "home" && (
            <div>
              {/* Filhos */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>👶 Meus Filhos</div>
                  {familyPlan === "premium" && <span style={{ background: `linear-gradient(135deg, ${T.purple}, ${T.pink})`, color: "#fff", fontSize: 10, fontWeight: 900, borderRadius: 999, padding: "2px 8px", letterSpacing: 0.5 }}>PREMIUM</span>}
                </div>
                <button onClick={tryAddChild} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `${T.accent}22`, color: T.accent, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Adicionar</button>
              </div>

              {children.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted, marginBottom: 20 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>👶</div>
                    Nenhum filho cadastrado ainda!
                    <div style={{ marginTop: 16 }}>
                      <button onClick={tryAddChild} style={{ padding: "10px 20px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.blue})`, color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Adicionar filho(a)</button>
                    </div>
                  </div>
                : children.map(child => {
                    const l = getLvl(child.xp||0); const n = getNext(child.xp||0);
                    const age = child.birth_date ? calcAge(child.birth_date) : child.age;
                    return (
                      <div key={child.id} style={{ background: T.card, borderRadius: 24, padding: 20, marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 18, overflow: "hidden", background: `linear-gradient(135deg, ${T.purple}44, ${T.blue}44)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <AvatarImg value={child.avatar_emoji} size={56} radius={18} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: T.text, fontWeight: 800, fontSize: 17 }}>{child.display_name}</div>
                            <div style={{ color: T.textMuted, fontSize: 12 }}>{l.name} · 🪙 {child.kidcoins||0}{age ? ` · ${age} anos` : ""}</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                            <button onClick={() => setEditingChild(child)} style={{ padding: "5px 12px", borderRadius: 10, border: "none", background: `${T.primary}22`, color: T.primary, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✏️ Editar</button>
                            <button onClick={() => setExtratoTarget(child)} style={{ padding: "5px 12px", borderRadius: 10, border: "none", background: `${T.blue}22`, color: T.blue, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>📋 Extrato</button>
                            <button onClick={() => setDemeritTarget(child)} style={{ padding: "5px 12px", borderRadius: 10, border: "none", background: `${T.pink}22`, color: T.pink, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>⚠️ Tropeço</button>
                            <div style={{ color: T.warning, fontWeight: 900, fontSize: 13 }}>{child.streak||0}🔥</div>
                          </div>
                        </div>
                        <XPBar current={(child.xp||0)-l.xpNeeded} max={n.xpNeeded-l.xpNeeded} color={l.color} />
                        {/* Missões para marcar pelo responsável */}
                        {missions.length > 0 && (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 800, marginBottom: 8, letterSpacing: 0.5 }}>MARCAR MISSÕES</div>
                            {missions.map(m => {
                              const log = getChildLog(child.id, m.id, m.frequency);
                              const done = log?.status === "approved";
                              const pend = log?.status === "pending";
                              const key = `${child.id}-${m.id}`;
                              return (
                                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, opacity: done ? 0.5 : 1 }}>
                                  <span style={{ fontSize: 18, flexShrink: 0 }}>{done ? "✅" : m.emoji}</span>
                                  <div style={{ flex: 1, color: done ? T.textMuted : T.text, fontSize: 13, fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>{m.title}</div>
                                  {done
                                    ? <span style={{ fontSize: 10, color: T.accent, fontWeight: 800 }}>Feito</span>
                                    : pend
                                    ? <span style={{ fontSize: 10, color: T.secondary, fontWeight: 800 }}>⏳ Aguardando</span>
                                    : <button onClick={() => parentCheck(child.id, m.id)} disabled={checkingMission === key}
                                        style={{ padding: "5px 12px", borderRadius: 10, border: "none", background: `${T.accent}22`, color: T.accent, fontWeight: 800, fontSize: 12, cursor: checkingMission === key ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                                        {checkingMission === key ? "..." : "✓ Marcar"}
                                      </button>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Resgates pendentes de entrega */}
                        {redemptions.filter(r => r.child_id === child.id).length > 0 && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 800, marginBottom: 8, letterSpacing: 0.5 }}>🎁 RESGATES AGUARDANDO ENTREGA</div>
                            {redemptions.filter(r => r.child_id === child.id).map(r => (
                              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: `${T.secondary}0A`, borderRadius: 12, padding: "8px 10px" }}>
                                <span style={{ fontSize: 20, flexShrink: 0 }}>{r.reward_emoji}</span>
                                <div style={{ flex: 1, color: T.text, fontSize: 13, fontWeight: 600 }}>{r.reward_title}</div>
                                <span style={{ fontSize: 11, color: T.secondary, fontWeight: 700, flexShrink: 0 }}>🪙 {r.coin_cost}</span>
                                <button onClick={() => confirmDelivery(r.id)} disabled={confirmingRed === r.id || cancellingRed === r.id}
                                  style={{ padding: "5px 10px", borderRadius: 10, border: "none", background: `${T.accent}22`, color: T.accent, fontWeight: 800, fontSize: 11, cursor: (confirmingRed === r.id || cancellingRed === r.id) ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                                  {confirmingRed === r.id ? "..." : "✅ Entreguei"}
                                </button>
                                <button onClick={() => cancelRedemption(r.id)} disabled={cancellingRed === r.id || confirmingRed === r.id}
                                  style={{ padding: "5px 10px", borderRadius: 10, border: `1px solid ${T.pink}44`, background: "transparent", color: T.pink, fontWeight: 800, fontSize: 11, cursor: (cancellingRed === r.id || confirmingRed === r.id) ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                                  {cancellingRed === r.id ? "..." : "❌"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
              }

              {/* Convidar co-responsável */}
              <div style={{ background: T.card, borderRadius: 20, padding: 18, marginBottom: 20, border: `1px solid ${T.purple}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 22 }}>🔗</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>Convidar Co-responsável</div>
                    <div style={{ color: T.textMuted, fontSize: 12 }}>Compartilhe o código com outro responsável</div>
                  </div>
                  {familyPlan === "premium" && <span style={{ background: `linear-gradient(135deg, ${T.purple}, ${T.pink})`, color: "#fff", fontSize: 9, fontWeight: 900, borderRadius: 999, padding: "2px 8px" }}>PREMIUM</span>}
                </div>
                {familyPlan === "free" ? (
                  <button onClick={() => setShowUpgrade(true)} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: `1px solid ${T.purple}33`, background: `${T.purple}10`, color: T.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span>🔒</span>
                    <span>Disponível no <span style={{ color: T.purple, fontWeight: 900 }}>Premium</span> — até 10 co-responsáveis</span>
                  </button>
                ) : inviteCode ? (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ flex: 1, background: T.darker, borderRadius: 14, padding: "12px 16px", border: `2px solid ${T.purple}44`, textAlign: "center" }}>
                        <span style={{ color: T.purple, fontWeight: 900, fontSize: 20, letterSpacing: 4, fontFamily: "'Nunito', sans-serif" }}>{inviteCode}</span>
                      </div>
                      <button onClick={copyCode} style={{ padding: "12px 16px", borderRadius: 14, border: "none", background: codeCopied ? `${T.accent}33` : `${T.purple}22`, color: codeCopied ? T.accent : T.purple, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                        {codeCopied ? "✅ Copiado" : "📋 Copiar"}
                      </button>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: inviteExpiresAt && new Date(inviteExpiresAt) < new Date(Date.now() + 3600000) ? T.secondary : T.textMuted, fontSize: 11 }}>
                        ⏱ {fmtExpiry(inviteExpiresAt) || "validade desconhecida"}
                      </span>
                      <button onClick={generateCode} disabled={inviteLoading} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>🔄 Novo código</button>
                    </div>
                  </>
                ) : (
                  <button onClick={generateCode} disabled={inviteLoading} style={{ width: "100%", padding: "12px", borderRadius: 14, border: `1px solid ${T.purple}44`, background: `${T.purple}14`, color: T.purple, fontWeight: 800, fontSize: 14, cursor: inviteLoading ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif" }}>
                    {inviteLoading ? "Gerando..." : "✨ Gerar código de convite"}
                  </button>
                )}
              </div>

              {/* Pendentes */}
              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 12 }}>⏳ Aguardando Aprovação</div>
              {pending.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>Tudo em dia!</div>
                : pending.map(p => (
                    <div key={p.log_id} style={{ background: T.card, borderRadius: 18, padding: 16, marginBottom: 10, border: `1px solid ${T.warning}33` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${T.warning}22, ${T.primary}22)`, border: `1px solid ${T.warning}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, boxShadow: `0 4px 12px rgba(0,0,0,0.2)` }}>{p.mission_emoji}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.text, fontWeight: 700 }}>{p.mission_title}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                            <AvatarImg value={p.child_avatar} size={20} radius={6} />
                            <span style={{ fontSize: 12, color: T.textMuted }}>{p.child_name} · 🪙 {p.coins_reward} KidCoins</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => review(p.log_id, true)} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: `${T.accent}22`, color: T.accent, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✓</button>
                          <button onClick={() => review(p.log_id, false)} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: `${T.pink}22`, color: T.pink, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✗</button>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {/* MISSIONS */}
          {tab === "missions" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>🎯 Missões</div>
                  {familyPlan === "free" && (
                    <span onClick={() => setShowUpgrade(true)} style={{ background: missions.length >= 5 ? `${T.pink}22` : `${T.accent}18`, color: missions.length >= 5 ? T.pink : T.accent, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "2px 8px", cursor: "pointer" }}>
                      {missions.length}/5 {missions.length >= 5 ? "• upgrade 👑" : ""}
                    </span>
                  )}
                </div>
                <button onClick={() => { if (familyPlan === "free" && missions.length >= 5) { setShowUpgrade(true); return; } setShowMission(!showMission); }} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Nova</button>
              </div>
              {showMission && (
                <div style={{ background: T.card, borderRadius: 24, padding: 20, marginBottom: 16, border: `1px solid ${T.primary}44` }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 8 }}>EMOJI</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["⭐","🎯","📚","🏃","🧹","🛁","🍽️","🐕","🌱","🎨","📖","💪","🎵","✏️","🦷","🛏️","🧺","🌍","🏊","🎤"].map(e => (
                        <button key={e} onClick={() => setNewM(p=>({...p,emoji:e}))} style={{ width: 36, height: 36, borderRadius: 10, fontSize: 18, border: `2px solid ${newM.emoji === e ? T.primary : "rgba(255,255,255,0.1)"}`, background: newM.emoji === e ? `${T.primary}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{e}</button>
                      ))}
                    </div>
                  </div>
                  <Inp placeholder="Nome da missão" value={newM.title} onChange={e => setNewM(p=>({...p,title:e.target.value}))} icon={newM.emoji} maxLength={60} />
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 8 }}>FREQUÊNCIA</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {FREQ_OPTS.map(o => (
                        <button key={o.key} onClick={() => setNewM(p=>({...p,frequency:o.key}))}
                          style={{ flex: 1, padding: "7px 2px", borderRadius: 10, border: `2px solid ${newM.frequency === o.key ? T.purple : "rgba(255,255,255,0.1)"}`, background: newM.frequency === o.key ? `${T.purple}22` : "rgba(255,255,255,0.04)", color: newM.frequency === o.key ? T.purple : T.textMuted, fontWeight: 800, fontSize: 10, cursor: "pointer", fontFamily: "'Nunito', sans-serif", lineHeight: 1.3 }}>
                          {o.emoji}<br/>{o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>KidCoins</div>
                      <input type="number" value={newM.coins_reward} onChange={e => setNewM(p=>({...p,coins_reward:+e.target.value}))} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>XP</div>
                      <input type="number" value={newM.xp_reward} onChange={e => setNewM(p=>({...p,xp_reward:+e.target.value}))} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn onClick={createMission} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`} small>Criar</Btn>
                    <Btn onClick={() => setShowMission(false)} outline small>Cancelar</Btn>
                  </div>
                </div>
              )}
              {missions.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>Nenhuma missão ainda!</div>
                : missions.map((m, mi) => (
                    <div key={m.id} style={{ background: T.card, borderRadius: 18, padding: 16, marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: iconGrad(mi), border: `1px solid ${iconBorder(mi)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>{m.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: T.text, fontWeight: 700 }}>{m.title}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: T.secondary }}>🪙 {m.coins_reward}</span>
                            <span style={{ fontSize: 12, color: T.accent }}>⚡ {m.xp_reward} XP</span>
                            {m.frequency && m.frequency !== "daily" && <span style={{ fontSize: 10, color: T.purple, background: `${T.purple}22`, borderRadius: 6, padding: "1px 6px", fontWeight: 800 }}>{freqLabel(m.frequency)}</span>}
                          </div>
                        </div>
                        <button onClick={() => setEditingMission(m)} style={{ padding: "6px 12px", borderRadius: 10, border: "none", background: `${T.primary}22`, color: T.primary, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>✏️</button>
                      </div>
                    </div>
                  ))
              }

              {/* Missões arquivadas */}
              {inactiveMissions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => setShowArchivedMissions(v => !v)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", padding: "8px 0", width: "100%", textAlign: "left" }}>
                    {showArchivedMissions ? "▲" : "▼"} {inactiveMissions.length} missão(ões) arquivada(s)
                  </button>
                  {showArchivedMissions && inactiveMissions.map(m => (
                    <div key={m.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "12px 14px", marginBottom: 8, border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12, opacity: 0.7 }}>
                      <div style={{ fontSize: 22, flexShrink: 0 }}>{m.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: T.textMuted, fontWeight: 700, fontSize: 13, textDecoration: "line-through" }}>{m.title}</div>
                        <div style={{ color: T.textMuted, fontSize: 11 }}>🪙 {m.coins_reward} · ⚡ {m.xp_reward} XP</div>
                      </div>
                      <button onClick={() => reactivateMission(m.id)} disabled={reactivating === m.id}
                        style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${T.accent}44`, background: `${T.accent}18`, color: T.accent, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                        {reactivating === m.id ? "..." : "↩ Reativar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* REWARDS */}
          {tab === "rewards" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>🎁 Recompensas</div>
                  {familyPlan === "free" && (() => { const activeR = rewards.filter(r => r.is_active !== false).length; return (
                    <span onClick={() => setShowUpgrade(true)} style={{ background: activeR >= 3 ? `${T.pink}22` : `${T.secondary}18`, color: activeR >= 3 ? T.pink : T.secondary, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "2px 8px", cursor: "pointer" }}>
                      {activeR}/3 {activeR >= 3 ? "• upgrade 👑" : ""}
                    </span>
                  ); })()}
                </div>
                <button onClick={() => { if (familyPlan === "free" && rewards.filter(r => r.is_active !== false).length >= 3) { setShowUpgrade(true); return; } setShowReward(!showReward); }} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.secondary}, ${T.primary})`, color: T.darker, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Nova</button>
              </div>
              {showReward && (
                <div style={{ background: T.card, borderRadius: 24, padding: 20, marginBottom: 16, border: `1px solid ${T.secondary}44` }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 8 }}>EMOJI</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["🎁","🍕","🎮","🎬","🏖️","🍦","📱","🎪","🎠","🚀","🎤","🏆","🛍️","🎲","🧸","🍫","🌟","🍿","🎡","🎯"].map(e => (
                        <button key={e} onClick={() => setNewR(p=>({...p,emoji:e}))} style={{ width: 36, height: 36, borderRadius: 10, fontSize: 18, border: `2px solid ${newR.emoji === e ? T.secondary : "rgba(255,255,255,0.1)"}`, background: newR.emoji === e ? `${T.secondary}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{e}</button>
                      ))}
                    </div>
                  </div>
                  <Inp placeholder="Nome da recompensa" value={newR.title} onChange={e => setNewR(p=>({...p,title:e.target.value}))} icon={newR.emoji} maxLength={60} />
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>Custo em KidCoins</div>
                    <input type="number" value={newR.coin_cost} onChange={e => setNewR(p=>({...p,coin_cost:+e.target.value}))} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn onClick={createReward} gradient={`linear-gradient(135deg, ${T.secondary}, ${T.primary})`} small>Criar</Btn>
                    <Btn onClick={() => setShowReward(false)} outline small>Cancelar</Btn>
                  </div>
                </div>
              )}
              {rewards.filter(r => r.is_active !== false).length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>Nenhuma recompensa ainda!</div>
                : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {rewards.filter(r => r.is_active !== false).map((r, ri) => (
                      <div key={r.id} style={{ background: T.card, borderRadius: 20, padding: 16, textAlign: "center", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
                        <button onClick={() => setEditingReward(r)} style={{ position: "absolute", top: 10, right: 10, padding: "4px 8px", borderRadius: 8, border: "none", background: `${T.primary}22`, color: T.primary, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✏️</button>
                        <div style={{ width: 60, height: 60, borderRadius: 18, background: iconGrad(ri + 2), border: `1px solid ${iconBorder(ri + 2)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}>{r.emoji}</div>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{r.title}</div>
                        <div style={{ color: T.secondary, fontWeight: 900, fontSize: 14 }}>🪙 {r.coin_cost}</div>
                      </div>
                    ))}
                  </div>
              }

              {/* Recompensas arquivadas */}
              {rewards.filter(r => r.is_active === false).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => setShowArchivedRewards(v => !v)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", padding: "8px 0", width: "100%", textAlign: "left" }}>
                    {showArchivedRewards ? "▲" : "▼"} {rewards.filter(r => r.is_active === false).length} recompensa(s) arquivada(s)
                  </button>
                  {showArchivedRewards && rewards.filter(r => r.is_active === false).map(r => (
                    <div key={r.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "12px 14px", marginBottom: 8, border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12, opacity: 0.7 }}>
                      <div style={{ fontSize: 22, flexShrink: 0 }}>{r.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: T.textMuted, fontWeight: 700, fontSize: 13, textDecoration: "line-through" }}>{r.title}</div>
                        <div style={{ color: T.textMuted, fontSize: 11 }}>🪙 {r.coin_cost}</div>
                      </div>
                      <button onClick={() => reactivateReward(r.id)} disabled={reactivating === r.id}
                        style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${T.accent}44`, background: `${T.accent}18`, color: T.accent, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>
                        {reactivating === r.id ? "..." : "↩ Reativar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STATS */}
          {tab === "stats" && (
            <div>
              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>📊 Estatísticas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[{ label:"Filhos", value:children.length, icon:"👶", color:T.accent }, { label:"Missões", value:missions.length, icon:"🎯", color:T.primary }, { label:"Pendentes", value:pending.length, icon:"⏳", color:T.warning }, { label:"Recompensas", value:rewards.length, icon:"🎁", color:T.pink }].map((s,i) => (
                  <div key={i} style={{ background: T.card, borderRadius: 20, padding: 18, border: `1px solid ${s.color}22` }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ color: s.color, fontWeight: 900, fontSize: 26 }}>{s.value}</div>
                    <div style={{ color: T.textMuted, fontSize: 12, marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Assistente IA */}
              <div style={{ background: `linear-gradient(135deg, ${T.card}, ${T.cardLight})`, borderRadius: 24, padding: 20, marginBottom: 20, border: `1px solid ${T.purple}44` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg, ${T.purple}, ${T.pink})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
                  <div>
                    <div style={{ color: T.text, fontWeight: 900, fontSize: 15 }}>Assistente IA</div>
                    <div style={{ color: T.textMuted, fontSize: 11 }}>Powered by Gemini</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16, marginBottom: aiMissions.length > 0 || aiReport ? 16 : 0 }}>
                  <button onClick={suggestMissions} disabled={!!aiLoading} style={{ flex: 1, padding: "13px 8px", borderRadius: 14, border: `1px solid ${T.purple}55`, background: aiLoading === "missions" ? `${T.purple}33` : `${T.purple}18`, color: T.purple, fontWeight: 800, fontSize: 13, cursor: aiLoading ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s" }}>
                    {aiLoading === "missions" ? "Gerando... ✨" : "🤖 Sugerir missões"}
                  </button>
                  <button onClick={generateReport} disabled={!!aiLoading} style={{ flex: 1, padding: "13px 8px", borderRadius: 14, border: `1px solid ${T.blue}55`, background: aiLoading === "report" ? `${T.blue}33` : `${T.blue}18`, color: T.blue, fontWeight: 800, fontSize: 13, cursor: aiLoading ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", transition: "all 0.2s" }}>
                    {aiLoading === "report" ? "Gerando... 📊" : "📊 Relatório semanal"}
                  </button>
                </div>

                {/* Erro da IA — persistente e visível */}
                {aiError && (
                  <div style={{ background: `${T.pink}14`, borderRadius: 14, padding: "12px 16px", marginTop: 4, marginBottom: 4, border: `1px solid ${T.pink}33`, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: T.pink, fontSize: 13, fontWeight: 700 }}>{aiError}</div>
                      <button onClick={() => setAiError(null)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif", padding: 0, marginTop: 4 }}>✕ Fechar</button>
                    </div>
                  </div>
                )}

                {/* Missões sugeridas pela IA */}
                {aiMissions.length > 0 && (
                  <div ref={aiResultsRef}>
                    <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>SUGESTÕES — TOQUE PARA ADICIONAR</div>
                    {aiMissions.map((m, i) => (
                      <div key={i} style={{ background: T.darker, borderRadius: 14, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: `${T.purple}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{m.emoji}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{m.title}</div>
                          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: T.secondary }}>🪙 {m.coins_reward}</span>
                            <span style={{ fontSize: 11, color: T.accent }}>+{m.xp_reward} XP</span>
                          </div>
                        </div>
                        <button onClick={() => addAIMission(m)} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.blue})`, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif", flexShrink: 0 }}>+ Add</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Relatório semanal */}
                {aiReport && (
                  <div style={{ background: T.darker, borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 12 }}>RELATÓRIO SEMANAL</div>
                    <div style={{ color: T.text, fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>{aiReport}</div>
                    <button onClick={() => setAiReport(null)} style={{ marginTop: 14, padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✕ Fechar</button>
                  </div>
                )}
              </div>

              {/* Editar nome do responsável */}
              <div style={{ background: T.card, borderRadius: 20, padding: 18, marginBottom: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 12 }}>SEU PERFIL</div>
                {editingName ? (
                  <>
                    <Inp icon="👤" placeholder="Seu nome" value={newName} onChange={e => setNewName(e.target.value)} />
                    <div style={{ display: "flex", gap: 10 }}>
                      <Btn onClick={saveParentName} disabled={savingName || !newName.trim()} gradient={`linear-gradient(135deg, ${T.primary}, ${T.pink})`} small>
                        {savingName ? "Salvando..." : "✅ Salvar"}
                      </Btn>
                      <Btn onClick={() => setEditingName(false)} outline small>Cancelar</Btn>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: 15 }}>{profile.display_name}</div>
                      <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>Responsável</div>
                    </div>
                    <button onClick={() => { setNewName(profile.display_name); setEditingName(true); }} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `${T.primary}22`, color: T.primary, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✏️ Editar</button>
                  </div>
                )}
              </div>

              <NotifyToggle userId={profile.id} />
              {(profile.role === "admin") && (
                <button onClick={() => { window.history.pushState({}, "", "/admin"); window.location.reload(); }}
                  style={{ width: "100%", padding: "13px", borderRadius: 14, border: `1px solid ${T.purple}44`, background: `${T.purple}14`, color: T.purple, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif", marginBottom: 10 }}>
                  🛡️ Painel Admin
                </button>
              )}
              <button onClick={onSignOut} style={{ width: "100%", padding: "14px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: T.textMuted, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Sair da conta</button>

              {/* Co-responsáveis */}
              {coParents.length > 0 && (
                <div style={{ background: T.card, borderRadius: 20, padding: 18, marginTop: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 12 }}>CO-RESPONSÁVEIS</div>
                  {coParents.map(cp => (
                    <div key={cp.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 14 }}>{cp.display_name}</div>
                        <div style={{ color: T.textMuted, fontSize: 11 }}>{cp.role === "admin" ? "Admin" : "Responsável"}</div>
                      </div>
                      {cp.role !== "admin" && (
                        <button onClick={() => removeCoParent(cp.id)} disabled={removingCoParent === cp.id}
                          style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${T.pink}44`, background: "transparent", color: T.pink, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                          {removingCoParent === cp.id ? "..." : "Remover"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Excluir conta — LGPD */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {!confirmDeleteAccount ? (
                  <button onClick={() => setConfirmDeleteAccount(true)} style={{ background: "none", border: "none", color: `${T.pink}99`, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, width: "100%", textAlign: "center" }}>
                    🗑️ Excluir minha conta
                  </button>
                ) : (
                  <div style={{ background: `${T.pink}12`, borderRadius: 16, padding: 16, border: `1px solid ${T.pink}33` }}>
                    <div style={{ color: T.pink, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>⚠️ Excluir conta</div>
                    <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
                      Se você for o criador da família e o único responsável, todos os dados (filhos, missões, recompensas) serão excluídos permanentemente. Esta ação não pode ser desfeita.
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={deleteAccount} disabled={deletingAccount}
                        style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: T.pink, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                        {deletingAccount ? "Excluindo..." : "Sim, excluir tudo"}
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

// ═══════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════
const AdminPanel = ({ onBack }) => {
  const [families, setFamilies]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]       = useState(null);
  const [search, setSearch]           = useState("");
  const [notif, setNotif]             = useState(null);
  const [notifType, setNotifType]     = useState("success");
  const [denied, setDenied]           = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null); // family_id
  const [deleting, setDeleting]       = useState(null);           // family_id

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };

  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc("admin_get_families");
    setLoading(false);
    if (error) {
      console.error("[Admin] admin_get_families error:", error);
      if (error.message?.includes("Acesso negado")) { setDenied(true); return; }
      setLoadError(error.message || "Erro desconhecido");
      return;
    }
    setFamilies(data || []);
  };

  useEffect(() => { load(); }, []);

  const togglePlan = async (familyId, currentPlan) => {
    const newPlan = currentPlan === "premium" ? "free" : "premium";
    setToggling(familyId);
    const { error } = await supabase.rpc("admin_set_plan", { p_family_id: familyId, p_plan: newPlan });
    setToggling(null);
    if (error) { notify("Erro: " + error.message, "error"); return; }
    notify(newPlan === "premium" ? "👑 Premium ativado!" : "✅ Voltou para Free");
    setFamilies(prev => prev.map(f => f.family_id === familyId ? { ...f, plan: newPlan } : f));
  };

  const deleteFamily = async (familyId) => {
    setDeleting(familyId);
    const { error } = await supabase.rpc("admin_delete_family", { p_family_id: familyId });
    setDeleting(null);
    setConfirmingDelete(null);
    if (error) { notify("Erro ao remover: " + error.message, "error"); return; }
    notify("🗑️ Família removida.");
    setFamilies(prev => prev.filter(f => f.family_id !== familyId));
  };

  const filtered = families.filter(f =>
    (f.family_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.parent_email || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.parent_name  || "").toLowerCase().includes(search.toLowerCase())
  );

  const premCount = families.filter(f => f.plan === "premium").length;

  if (denied) {
    return (
      <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🚫</div>
        <div style={{ color: T.pink, fontWeight: 900, fontSize: 20, marginBottom: 8 }}>Acesso negado</div>
        <div style={{ color: T.textMuted, fontSize: 14, marginBottom: 28, textAlign: "center" }}>Esta conta não tem permissão de admin.</div>
        <button onClick={onBack} style={{ padding: "12px 24px", borderRadius: 14, border: "none", background: `${T.primary}22`, color: T.primary, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>← Voltar</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", maxWidth: 700, margin: "0 auto" }}>
      <Notif msg={notif} type={notifType} />

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${T.purple}22, ${T.pink}12)`, padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ color: T.purple, fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }}>PAINEL ADMIN</div>
            <div style={{ color: T.text, fontSize: 22, fontWeight: 900 }}>🛡️ RotinUp Admin</div>
          </div>
          <button onClick={onBack} style={{ padding: "9px 18px", borderRadius: 12, border: `1px solid ${T.purple}44`, background: `${T.purple}18`, color: T.purple, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            ← Meu app
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Total famílias", value: families.length,             color: T.blue     },
            { label: "Premium 👑",      value: premCount,                   color: T.secondary },
            { label: "Free",            value: families.length - premCount, color: T.textMuted },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "10px 12px", textAlign: "center", border: `1px solid ${s.color}22` }}>
              <div style={{ color: s.color, fontWeight: 900, fontSize: 24 }}>{s.value}</div>
              <div style={{ color: T.textMuted, fontSize: 10, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Busca */}
      <div style={{ padding: "14px 20px 0" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar família, email ou responsável..."
          style={{ width: "100%", padding: "12px 16px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = T.purple}
          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
        />
      </div>

      {/* Erro persistente de carregamento */}
      {loadError && (
        <div style={{ margin: "12px 20px 0", padding: "14px 18px", borderRadius: 16, background: `${T.pink}15`, border: `1px solid ${T.pink}44`, color: T.pink }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>⚠️ Erro ao carregar famílias</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10, wordBreak: "break-all" }}>{loadError}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
            Verifique se <strong style={{ color: T.text }}>supabase_admin.sql</strong> foi executado no Supabase SQL Editor.
          </div>
          <button onClick={load} style={{ padding: "7px 16px", borderRadius: 10, border: "none", background: `${T.pink}22`, color: T.pink, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>🔄 Tentar novamente</button>
        </div>
      )}

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 60px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Carregando famílias... ⏳</div>
        ) : !loadError && filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Nenhuma família encontrada</div>
        ) : filtered.map(f => (
          <div key={f.family_id} style={{ background: T.card, borderRadius: 18, padding: "14px 16px", marginBottom: 10, border: `1px solid ${confirmingDelete === f.family_id ? T.pink + "55" : f.plan === "premium" ? T.secondary + "55" : "rgba(255,255,255,0.07)"}`, transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ color: T.text, fontWeight: 800, fontSize: 15 }}>{f.family_name || "Sem nome"}</span>
                  <span style={{ background: f.plan === "premium" ? `linear-gradient(135deg, ${T.purple}, ${T.pink})` : "rgba(255,255,255,0.08)", color: f.plan === "premium" ? "#fff" : T.textMuted, fontSize: 9, fontWeight: 900, borderRadius: 999, padding: "2px 9px", letterSpacing: 0.5 }}>
                    {f.plan === "premium" ? "👑 PREMIUM" : "FREE"}
                  </span>
                </div>
                <div style={{ color: T.textMuted, fontSize: 12 }}>{f.parent_email || "—"}</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
                  {f.parent_name || "—"} · {f.child_count} filho{f.child_count !== 1 ? "s" : ""} · {new Date(f.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => togglePlan(f.family_id, f.plan)}
                  disabled={toggling === f.family_id || deleting === f.family_id}
                  style={{ padding: "8px 14px", borderRadius: 10, border: "none", minWidth: 88, textAlign: "center", fontFamily: "'Nunito', sans-serif", fontWeight: 900, fontSize: 12, cursor: toggling === f.family_id ? "not-allowed" : "pointer", transition: "all 0.18s",
                    background: toggling === f.family_id ? "rgba(255,255,255,0.06)" : f.plan === "premium" ? `${T.pink}28` : `linear-gradient(135deg, ${T.purple}, ${T.pink})`,
                    color: toggling === f.family_id ? T.textMuted : f.plan === "premium" ? T.pink : "#fff",
                  }}>
                  {toggling === f.family_id ? "..." : f.plan === "premium" ? "→ Free" : "👑 Premium"}
                </button>
                <button
                  onClick={() => confirmingDelete === f.family_id ? setConfirmingDelete(null) : setConfirmingDelete(f.family_id)}
                  disabled={deleting === f.family_id}
                  style={{ padding: "6px 14px", borderRadius: 10, border: `1px solid ${T.pink}44`, background: confirmingDelete === f.family_id ? `${T.pink}22` : "transparent", color: T.pink, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "'Nunito', sans-serif", textAlign: "center" }}>
                  {deleting === f.family_id ? "..." : "🗑️ Remover"}
                </button>
              </div>
            </div>
            {/* Confirmação de remoção expandida */}
            {confirmingDelete === f.family_id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.pink}33` }}>
                <div style={{ color: T.pink, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  ⚠️ Isso apaga <strong>todas</strong> as missões, coins, filhos e histórico desta família. Irreversível.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => deleteFamily(f.family_id)} disabled={deleting === f.family_id}
                    style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${T.pink}, #CC0000)`, color: "#fff", fontWeight: 900, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                    {deleting === f.family_id ? "Removendo..." : "✓ Confirmar remoção"}
                  </button>
                  <button onClick={() => setConfirmingDelete(null)}
                    style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen]   = useState("splash");
  const [splashDone, setSplashDone] = useState(false);
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode]           = useState("login");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall]     = useState(false);

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

  useEffect(() => {
    if (!splashDone || loading) return;
    if (screen !== "splash") return;
    if (user && profile) {
      const r = profile.role;
      if (!profile.family_id && (r === "parent" || r === "admin")) setScreen("onboarding");
      else if (!profile.family_id && r === "child") setScreen("child_join");
      else setScreen(r === "parent" || r === "admin" ? "parent" : "child");
    } else {
      setScreen("landing");
    }
  }, [splashDone, loading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else { setUser(null); setProfile(null); setScreen("landing"); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid) => {
    setLoading(true);
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (data) {
        // Google OAuth users may arrive without a role — default to parent
        if (!data.role) {
          await supabase.from("profiles").update({ role: "parent" }).eq("id", uid);
          data.role = "parent";
        }
        setProfile(data);
        const isAdmin = window.location.pathname === "/admin";
        const isParentRole = data.role === "parent" || data.role === "admin";
        setScreen(
          isAdmin ? "admin"
          : !data.family_id && isParentRole   ? "onboarding"
          : !data.family_id && data.role === "child" ? "child_join"
          : isParentRole ? "parent" : "child"
        );
      } else {
        await supabase.auth.signOut();
      }
    } catch {
      await supabase.auth.signOut();
    }
    setLoading(false);
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", justifyContent: "center", minHeight: "100vh", background: "#080810" }}>
        <div style={{ width: "100%", maxWidth: screen === "admin" ? 700 : 430, overflow: "hidden", minHeight: "100vh" }}>
          {screen === "admin" && (
            <AdminPanel onBack={() => {
              window.history.pushState({}, "", "/");
              setScreen((profile?.role === "parent" || profile?.role === "admin") ? "parent" : "child");
            }} />
          )}
          {screen !== "admin" && <>
          {screen === "splash" && <Splash onDone={() => setSplashDone(true)} />}
          {screen === "landing"    && <LandingPage onSignup={() => { setAuthMode("signup"); setScreen("auth"); }} onLogin={() => { setAuthMode("login"); setScreen("auth"); }} />}
          {screen === "auth"       && <AuthScreen initialMode={authMode} />}
          {screen === "onboarding" && user && <Onboarding user={user} onDone={() => loadProfile(user.id)} />}
          {screen === "child_join" && <ChildJoin onDone={() => loadProfile(user.id)} />}
          {screen === "parent"     && profile && <ParentDash profile={profile} onSignOut={signOut} onRefresh={() => loadProfile(user.id)} />}
          {screen === "child"      && profile && <ChildDash  profile={profile} onSignOut={signOut} onRefresh={() => loadProfile(user.id)} />}
          </>}
          {loading && screen !== "splash" && (
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
