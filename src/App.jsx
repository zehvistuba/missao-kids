import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON
);

const callAI = async (action, context) => {
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { action, context },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.result;
};

const T = {
  primary: "#FF6B35", secondary: "#FFD23F", accent: "#06D6A0",
  purple: "#9B5DE5", blue: "#4CC9F0", pink: "#F72585",
  darker: "#0F0F1A", card: "#252540", cardLight: "#2E2E50",
  text: "#F0F0FF", textMuted: "#9090B0", warning: "#FFD23F",
};

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

// ─── UI Components ────────────────────────────────────────
const XPBar = ({ current, max, color = T.accent }) => (
  <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, height: 8, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (current / max) * 100)}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}CC)`, borderRadius: 999, transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)", boxShadow: `0 0 8px ${color}88` }} />
  </div>
);

const Notif = ({ msg, type }) => msg ? (
  <div style={{ position: "fixed", top: 20, left: 16, right: 16, zIndex: 9999, background: T.card, borderRadius: 16, padding: "14px 20px", border: `1px solid ${type === "error" ? T.pink : T.accent}44`, color: T.text, fontWeight: 700, fontSize: 14, textAlign: "center", animation: "slideDown 0.3s ease", maxWidth: 430, margin: "0 auto" }}>{msg}</div>
) : null;

const Inp = ({ placeholder, type = "text", value, onChange, icon }) => (
  <div style={{ position: "relative", marginBottom: 14 }}>
    {icon && <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, zIndex: 1 }}>{icon}</span>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ width: "100%", padding: icon ? "14px 18px 14px 46px" : "14px 18px", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 15, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box" }}
      onFocus={e => e.target.style.borderColor = T.primary}
      onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
    />
  </div>
);

const Btn = ({ children, onClick, gradient, disabled, outline, small }) => (
  <button onClick={onClick} disabled={disabled} style={{ width: small ? "auto" : "100%", padding: small ? "10px 20px" : "15px 24px", borderRadius: 16, border: outline ? "1px solid rgba(255,255,255,0.15)" : "none", background: disabled ? "rgba(255,255,255,0.08)" : outline ? "rgba(255,255,255,0.04)" : gradient || `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: disabled ? T.textMuted : T.text, fontWeight: 800, fontSize: small ? 13 : 15, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Nunito', sans-serif", letterSpacing: 0.3 }}>{children}</button>
);

// ─── Add Child Modal ───────────────────────────────────────
const AddChildModal = ({ familyId, onAdd, onClose }) => {
  const [name, setName]     = useState("");
  const [age, setAge]       = useState("");
  const [avatar, setAvatar] = useState("👦");
  const [loading, setLoading] = useState(false);
  const avatars = ["👦","👧","🧒","👶","🦸‍♂️","🦸‍♀️","🐱","🦊","🐸","🦁"];

  const handleAdd = async () => {
    if (!name || !age) return;
    setLoading(true);
    const { error } = await supabase.rpc("add_child", {
      p_display_name: name,
      p_age: parseInt(age),
      p_avatar_emoji: avatar,
    });
    setLoading(false);
    if (!error) onAdd();
    else onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 430, animation: "slideDown 0.3s ease" }}>
        <div style={{ color: T.text, fontWeight: 900, fontSize: 18, marginBottom: 20, textAlign: "center" }}>👶 Adicionar Filho(a)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
          {avatars.map(a => (
            <button key={a} onClick={() => setAvatar(a)} style={{ width: 46, height: 46, borderRadius: 12, fontSize: 22, border: `2px solid ${avatar === a ? T.accent : "rgba(255,255,255,0.1)"}`, background: avatar === a ? `${T.accent}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{a}</button>
          ))}
        </div>
        <Inp icon={avatar} placeholder="Nome do filho(a)" value={name} onChange={e => setName(e.target.value)} />
        <Inp icon="🎂" placeholder="Idade" type="number" value={age} onChange={e => setAge(e.target.value)} />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={handleAdd} disabled={loading || !name || !age} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>
            {loading ? "Salvando..." : "✅ Adicionar"}
          </Btn>
          <Btn onClick={onClose} outline small>Cancelar</Btn>
        </div>
      </div>
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
        <div style={{ fontSize: 80, marginBottom: 16, filter: `drop-shadow(0 0 20px ${T.primary}88)` }}>🚀</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: T.text, letterSpacing: -1 }}>Missão<span style={{ color: T.primary }}> Kids</span></div>
        <div style={{ color: T.textMuted, fontSize: 13, marginTop: 8, letterSpacing: 2 }}>TRANSFORME A ROTINA EM AVENTURA</div>
      </div>
      <div style={{ marginTop: 60, display: "flex", gap: 8 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: i === 0 ? 28 : 8, height: 8, borderRadius: 999, background: i === 0 ? T.primary : "rgba(255,255,255,0.2)", animation: `pulse 1s ease-in-out ${i*0.2}s infinite` }} />)}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const AuthScreen = () => {
  const [mode, setMode]         = useState("login");
  const [userType, setUserType] = useState("parent");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [notif, setNotif]       = useState(null);
  const [notifType, setNotifType] = useState("success");

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3500); };

  const handleEmail = async () => {
    if (mode !== "login" && !name) return notify("Digite seu nome!", "error");
    if (!email || !password) return notify("Preencha email e senha!", "error");
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
      notify(err.message || "Erro ao autenticar", "error");
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
      <div style={{ textAlign: "center", paddingTop: 60, marginBottom: 36 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🚀</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: T.text }}>Missão<span style={{ color: T.primary }}> Kids</span></div>
        <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>{mode === "login" ? "Bem-vindo de volta!" : "Crie sua conta gratuita"}</div>
      </div>

      {mode === "signup" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {[{ key: "parent", label: "Responsável", emoji: "👨‍👩‍👧", color: T.primary }, { key: "child", label: "Criança", emoji: "👦", color: T.accent }].map(opt => (
            <button key={opt.key} onClick={() => setUserType(opt.key)} style={{ flex: 1, padding: "16px 12px", borderRadius: 18, border: `2px solid ${userType === opt.key ? opt.color : "rgba(255,255,255,0.08)"}`, background: userType === opt.key ? `${opt.color}18` : "rgba(255,255,255,0.03)", color: userType === opt.key ? opt.color : T.textMuted, cursor: "pointer", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 28 }}>{opt.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }}>
        {mode !== "login" && <Inp icon="👤" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} />}
        <Inp icon="✉️" placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Inp icon="🔒" placeholder="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <Btn onClick={handleEmail} disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "🚀 Entrar" : "✨ Criar conta"}</Btn>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
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
        </button>
      </div>

      <div style={{ textAlign: "center", padding: "24px 0 40px", color: T.textMuted, fontSize: 14 }}>
        {mode === "login"
          ? <> Novo por aqui? <span onClick={() => setMode("signup")} style={{ color: T.primary, fontWeight: 800, cursor: "pointer" }}>Criar conta grátis</span></>
          : <> Já tem conta? <span onClick={() => setMode("login")} style={{ color: T.primary, fontWeight: 800, cursor: "pointer" }}>Fazer login</span></>
        }
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════
const Onboarding = ({ user, onDone }) => {
  const [step, setStep]             = useState(0);
  const [familyName, setFamilyName] = useState("");
  const [childName, setChildName]   = useState("");
  const [childAge, setChildAge]     = useState("");
  const [avatar, setAvatar]         = useState("👦");
  const [loading, setLoading]       = useState(false);
  const avatars = ["👦","👧","🧒","👶","🦸‍♂️","🦸‍♀️","🐱","🦊","🐸","🦁"];

  const createFamily = async () => {
    if (!familyName) return;
    setLoading(true);
    await supabase.rpc("create_family", { p_family_name: familyName });
    setLoading(false);
    setStep(1);
  };

  const addChild = async () => {
    if (!childName || !childAge) return;
    setLoading(true);
    await supabase.rpc("add_child", { p_display_name: childName, p_age: parseInt(childAge), p_avatar_emoji: avatar });
    setLoading(false);
    onDone();
  };

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column", padding: "0 24px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {step === 0 && <>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🏠</div>
            <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Vamos começar!</div>
            <div style={{ color: T.textMuted, fontSize: 15 }}>Dê um nome para a sua família</div>
          </div>
          <Inp icon="🏠" placeholder="Ex: Família Silva" value={familyName} onChange={e => setFamilyName(e.target.value)} />
          <Btn onClick={createFamily} disabled={loading || !familyName}>{loading ? "Criando..." : "Próximo →"}</Btn>
        </>}
        {step === 1 && <>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>👶</div>
            <div style={{ color: T.text, fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Adicionar filho(a)</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
            {avatars.map(a => (
              <button key={a} onClick={() => setAvatar(a)} style={{ width: 48, height: 48, borderRadius: 14, fontSize: 24, border: `2px solid ${avatar === a ? T.accent : "rgba(255,255,255,0.1)"}`, background: avatar === a ? `${T.accent}22` : "rgba(255,255,255,0.04)", cursor: "pointer" }}>{a}</button>
            ))}
          </div>
          <Inp icon={avatar} placeholder="Nome do filho(a)" value={childName} onChange={e => setChildName(e.target.value)} />
          <Inp icon="🎂" placeholder="Idade" type="number" value={childAge} onChange={e => setChildAge(e.target.value)} />
          <Btn onClick={addChild} disabled={loading || !childName || !childAge} gradient={`linear-gradient(135deg, ${T.accent}, ${T.blue})`}>{loading ? "Salvando..." : "🚀 Começar a aventura!"}</Btn>
          <button onClick={onDone} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 13, marginTop: 16, cursor: "pointer", fontFamily: "'Nunito', sans-serif", width: "100%", textAlign: "center" }}>Pular por agora</button>
        </>}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingBottom: 40 }}>
        {[0,1].map(i => <div key={i} style={{ width: i === step ? 28 : 8, height: 8, borderRadius: 999, background: i === step ? T.primary : "rgba(255,255,255,0.15)", transition: "all 0.3s" }} />)}
      </div>
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
  const [celebration, setCelebration] = useState(null); // { msg, coins, xp }
  // Profile editing
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatar_emoji || "👦");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [siblings, setSiblings] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const lvl  = getLvl(profile.xp || 0);
  const next = getNext(profile.xp || 0);
  const xpIn  = (profile.xp || 0) - lvl.xpNeeded;
  const xpFor = next.xpNeeded - lvl.xpNeeded;

  const notify = (msg, type = "success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };

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
          const mission = missions.find(m => m.id === payload.new.mission_id);
          try {
            const msg = await callAI("motivational", {
              childName: profile.display_name,
              age: profile.age,
              level: getLvl(profile.xp || 0).level,
              missionName: mission?.title || "essa missão",
              coins: payload.new.coins_earned,
              xp: mission?.xp_reward || 0,
            });
            setCelebration({ msg, coins: payload.new.coins_earned, xp: mission?.xp_reward || 0 });
          } catch {
            notify(`🎉 Missão aprovada! +${payload.new.coins_earned} KidCoins!`);
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const [{ data: m }, { data: r }, { data: a }, { data: l }] = await Promise.all([
      supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active", true),
      supabase.from("rewards").select("*").eq("family_id", profile.family_id).eq("is_active", true),
      supabase.from("achievements").select("*").order("condition_val"),
      supabase.from("mission_logs").select("*").eq("child_id", profile.id).eq("due_date", today),
    ]);
    setMissions(m || []); setRewards(r || []); setLogs(l || []);
    if (a) {
      const { data: earned } = await supabase.from("child_achievements").select("achievement_id").eq("child_id", profile.id);
      const earnedSet = new Set((earned || []).map(e => e.achievement_id));
      setAch(a.map(ach => ({ ...ach, earned: earnedSet.has(ach.id) })));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tab === "profile") loadProfileExtras();
  }, [tab]);

  const loadProfileExtras = async () => {
    setHistoryLoading(true);
    const [{ data: sibs }, { data: hist }] = await Promise.all([
      supabase.from("profiles")
        .select("id,display_name,avatar_emoji,xp,kidcoins,streak")
        .eq("family_id", profile.family_id)
        .eq("role", "child")
        .order("xp", { ascending: false }),
      supabase.from("mission_logs")
        .select("id,coins_earned,due_date,mission_id,missions(title,emoji)")
        .eq("child_id", profile.id)
        .eq("status", "approved")
        .order("due_date", { ascending: false })
        .limit(20),
    ]);
    setSiblings(sibs || []);
    setHistoryLogs(hist || []);
    setHistoryLoading(false);
  };

  const saveAvatar = async (emoji) => {
    setAvatarEmoji(emoji);
    setEditingAvatar(false);
    await supabase.from("profiles").update({ avatar_emoji: emoji }).eq("id", profile.id);
    if (onRefresh) onRefresh();
  };

  const generateSurpriseMission = async () => {
    setSurpriseLoading(true);
    try {
      const raw = await callAI("surprise_mission", {
        childName: profile.display_name,
        age: profile.age,
        level: getLvl(profile.xp || 0).level,
        levelName: getLvl(profile.xp || 0).name,
        xp: profile.xp || 0,
      });
      setSurpriseMission(JSON.parse(raw));
    } catch {
      notify("Não consegui criar a missão surpresa 😅 Tente novamente!", "error");
    }
    setSurpriseLoading(false);
  };

  const getLog = (mid) => logs.find(l => l.mission_id === mid);

  const submit = async (mid) => {
    const { error } = await supabase.rpc("submit_mission", { p_mission_id: mid });
    if (error) return notify("Erro ao enviar missão", "error");
    notify("✅ Missão enviada para aprovação!"); load();
  };

  const redeem = async (rid, cost) => {
    if ((profile.kidcoins || 0) < cost) return notify("KidCoins insuficientes! 😢", "error");
    const { error } = await supabase.rpc("redeem_reward", { p_reward_id: rid });
    if (error) return notify(error.message || "Erro", "error");
    notify("🎁 Recompensa resgatada! Aguarde a entrega."); load();
  };

  const navTabs = [{ key:"home",icon:"🏠",label:"Início"},{key:"store",icon:"🏪",label:"Loja"},{key:"achievements",icon:"🏆",label:"Conquistas"},{key:"profile",icon:"👤",label:"Perfil"}];

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column" }}>
      <Notif msg={notif} type={notifType} />

      {/* Modal de celebração IA */}
      {celebration && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: `linear-gradient(135deg, ${T.purple}DD, ${T.pink}DD)`, borderRadius: 32, padding: "36px 28px", maxWidth: 360, width: "100%", textAlign: "center", border: "2px solid rgba(255,255,255,0.15)", backdropFilter: "blur(20px)" }}>
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
            <div style={{ color: "rgba(255,255,255,0.95)", fontSize: 16, fontWeight: 700, marginBottom: 28, lineHeight: 1.6 }}>{celebration.msg}</div>
            <button onClick={() => setCelebration(null)} style={{ width: "100%", padding: "15px", borderRadius: 18, border: "none", background: "rgba(255,255,255,0.22)", color: "#fff", fontWeight: 900, fontSize: 17, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Uhuuul! 🚀</button>
          </div>
        </div>
      )}

      {/* Header com saudação personalizada */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{profile.avatar_emoji || "👦"}</div>
            <div>
              <div style={{ color: T.textMuted, fontSize: 11 }}>{getSaudacao()},</div>
              <div style={{ color: T.text, fontSize: 17, fontWeight: 900 }}>👋 {profile.display_name}!</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.card, borderRadius: 14, padding: "8px 14px", border: `1px solid ${T.secondary}33` }}>
            <span>🪙</span><span style={{ color: T.secondary, fontWeight: 900, fontSize: 16 }}>{profile.kidcoins || 0}</span>
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
                      {surpriseLoading ? "✨..." : "✨ Gerar"}
                    </button>
                  ) : (
                    <button onClick={() => setSurpriseMission(null)} style={{ padding: "8px 14px", borderRadius: 12, border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Nova 🔄</button>
                  )}
                </div>
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
                  </div>
                )}
              </div>

              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🎯 Missões de Hoje</div>
              {missions.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>Nenhuma missão ainda!</div>
                : missions.map(m => {
                    const log = getLog(m.id);
                    const done = log?.status === "approved";
                    const pending = log?.status === "pending";
                    return (
                      <div key={m.id} style={{ background: done ? `${T.accent}11` : pending ? `${T.secondary}11` : T.card, borderRadius: 18, padding: 16, marginBottom: 12, border: `1px solid ${done ? T.accent+"44" : pending ? T.secondary+"44" : "rgba(255,255,255,0.06)"}`, opacity: done ? 0.7 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 16, fontSize: 26, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? "✅" : m.emoji}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: done ? T.textMuted : T.text, fontWeight: 700, fontSize: 15, textDecoration: done ? "line-through" : "none" }}>{m.title}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <span style={{ fontSize: 12, color: T.secondary }}>🪙 {m.coins_reward}</span>
                              <span style={{ fontSize: 12, color: T.accent }}>+{m.xp_reward} XP</span>
                            </div>
                          </div>
                          {!done && !pending && <button onClick={() => submit(m.id)} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Feito!</button>}
                          {pending && <span style={{ fontSize: 11, color: T.secondary, fontWeight: 700 }}>⏳ Aguardando</span>}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}

          {/* STORE */}
          {tab === "store" && (
            <div>
              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🏪 Loja</div>
              <div style={{ color: T.textMuted, fontSize: 13, marginBottom: 20 }}>Saldo: <span style={{ color: T.secondary, fontWeight: 800 }}>🪙 {profile.kidcoins || 0}</span></div>
              {rewards.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>Nenhuma recompensa ainda!</div>
                : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {rewards.map(r => {
                      const can = (profile.kidcoins || 0) >= r.coin_cost;
                      return (
                        <div key={r.id} style={{ background: T.card, borderRadius: 20, padding: 16, textAlign: "center", border: `1px solid ${can ? T.accent+"33" : "rgba(255,255,255,0.06)"}`, opacity: can ? 1 : 0.6 }}>
                          <div style={{ fontSize: 40, marginBottom: 8 }}>{r.emoji}</div>
                          <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{r.title}</div>
                          <div style={{ color: T.secondary, fontWeight: 900, fontSize: 14, marginBottom: 10 }}>🪙 {r.coin_cost}</div>
                          <button onClick={() => redeem(r.id, r.coin_cost)} style={{ width: "100%", padding: "8px 0", borderRadius: 12, border: "none", background: can ? `linear-gradient(135deg, ${T.accent}, ${T.blue})` : "rgba(255,255,255,0.06)", color: can ? "#fff" : T.textMuted, fontWeight: 800, fontSize: 12, cursor: can ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif" }}>{can ? "Resgatar" : "Sem saldo"}</button>
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
              {achievements.map(a => (
                <div key={a.id} style={{ background: a.earned ? `${T.secondary}11` : T.card, borderRadius: 18, padding: 16, marginBottom: 10, border: `1px solid ${a.earned ? T.secondary+"44" : "rgba(255,255,255,0.06)"}`, display: "flex", alignItems: "center", gap: 16, opacity: a.earned ? 1 : 0.5 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, fontSize: 28, background: a.earned ? `${T.secondary}22` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", filter: a.earned ? "none" : "grayscale(100%)" }}>{a.emoji}</div>
                  <div>
                    <div style={{ color: a.earned ? T.text : T.textMuted, fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                    <div style={{ color: T.textMuted, fontSize: 12, marginTop: 3 }}>{a.description}</div>
                    {a.earned && <span style={{ background: `${T.secondary}22`, color: T.secondary, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>✨ Desbloqueado</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PROFILE */}
          {tab === "profile" && (
            <div>
              {/* Avatar picker modal */}
              {editingAvatar && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div style={{ background: T.card, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 430 }}>
                    <div style={{ color: T.text, fontWeight: 900, fontSize: 17, textAlign: "center", marginBottom: 20 }}>✏️ Escolher avatar</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 20 }}>
                      {["👦","👧","🧒","👶","🦸‍♂️","🦸‍♀️","🐱","🦊","🐸","🦁","🐶","🐼","🦄","🐯","🦋","🌟","🦅","🐉","🤖","👾"].map(e => (
                        <button key={e} onClick={() => saveAvatar(e)} style={{ width: 54, height: 54, borderRadius: 16, fontSize: 26, border: `2px solid ${avatarEmoji === e ? T.accent : "rgba(255,255,255,0.1)"}`, background: avatarEmoji === e ? `${T.accent}22` : "rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.15s" }}>{e}</button>
                      ))}
                    </div>
                    <button onClick={() => setEditingAvatar(false)} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* Avatar + nome */}
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div onClick={() => setEditingAvatar(true)} style={{ position: "relative", display: "inline-block", cursor: "pointer", marginBottom: 12 }}>
                  <div style={{ width: 100, height: 100, borderRadius: 30, background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>{avatarEmoji}</div>
                  <div style={{ position: "absolute", bottom: -4, right: -4, width: 28, height: 28, borderRadius: 10, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: `2px solid ${T.darker}` }}>✏️</div>
                </div>
                <div style={{ color: T.text, fontWeight: 900, fontSize: 22 }}>{profile.display_name}</div>
                <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>{profile.age ? `${profile.age} anos · ` : ""}{lvl.name} {lvl.emoji}</div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {[
                  { label:"KidCoins", value:profile.kidcoins||0, icon:"🪙", color:T.secondary },
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
                        <div style={{ fontSize: 28 }}>{s.avatar_emoji || "👦"}</div>
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
                    <div style={{ color: T.secondary, fontWeight: 800, fontSize: 13 }}>+🪙{log.coins_earned||0}</div>
                  </div>
                ))}
              </div>

              <button onClick={onSignOut} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: T.textMuted, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Sair da conta</button>
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
// PARENT DASHBOARD
// ═══════════════════════════════════════════════════════════
const ParentDash = ({ profile, onSignOut }) => {
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
  const [newM, setNewM] = useState({ title:"", emoji:"⭐", coins_reward:20, xp_reward:15 });
  const [newR, setNewR] = useState({ title:"", emoji:"🎁", coin_cost:50 });
  const [aiLoading, setAiLoading] = useState(null); // "missions" | "report" | null
  const [aiMissions, setAiMissions] = useState([]);
  const [aiReport, setAiReport] = useState(null);

  const notify = (msg, type="success") => { setNotif(msg); setNotifType(type); setTimeout(() => setNotif(null), 3000); };

  useEffect(() => {
    load();
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
    const [{ data: ch }, { data: m }, { data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("family_id", profile.family_id).eq("role","child"),
      supabase.from("missions").select("*").eq("family_id", profile.family_id).eq("is_active",true),
      supabase.from("pending_approvals").select("*"),
      supabase.from("rewards").select("*").eq("family_id", profile.family_id),
    ]);
    setChildren(ch||[]); setMissions(m||[]); setPending(p||[]); setRewards(r||[]);
    setLoading(false);
  };

  const review = async (logId, approve) => {
    const { error } = await supabase.rpc("review_mission", { p_log_id: logId, p_approve: approve, p_note: approve ? "Ótimo trabalho! 🎉" : "Tente novamente!" });
    if (error) return notify("Erro ao revisar", "error");
    notify(approve ? "✅ Aprovado! KidCoins liberados!" : "❌ Missão rejeitada");
    load();
  };

  const createMission = async () => {
    if (!newM.title) return notify("Digite o nome da missão", "error");
    const { error } = await supabase.from("missions").insert({ ...newM, family_id: profile.family_id, created_by: profile.id });
    if (error) return notify("Erro ao criar", "error");
    notify("🎯 Missão criada!"); setShowMission(false); setNewM({ title:"", emoji:"⭐", coins_reward:20, xp_reward:15 }); load();
  };

  const createReward = async () => {
    if (!newR.title) return notify("Digite o nome da recompensa", "error");
    const { error } = await supabase.from("rewards").insert({ ...newR, family_id: profile.family_id, created_by: profile.id });
    if (error) return notify("Erro ao criar", "error");
    notify("🎁 Recompensa criada!"); setShowReward(false); setNewR({ title:"", emoji:"🎁", coin_cost:50 }); load();
  };

  const suggestMissions = async () => {
    if (children.length === 0) return notify("Adicione um filho primeiro!", "error");
    setAiLoading("missions");
    setAiReport(null);
    try {
      const raw = await callAI("suggest_missions", {
        children: children.map(c => ({ name: c.display_name, age: c.age, xp: c.xp })),
        existingMissions: missions.map(m => ({ title: m.title })),
      });
      setAiMissions(JSON.parse(raw));
    } catch (e) {
      notify("Erro ao gerar sugestões: " + (e.message || "Tente novamente"), "error");
    }
    setAiLoading(null);
  };

  const generateReport = async () => {
    if (children.length === 0) return notify("Adicione um filho primeiro!", "error");
    setAiLoading("report");
    setAiMissions([]);
    try {
      const report = await callAI("weekly_report", {
        familyName: profile.display_name,
        children: children.map(c => ({
          name: c.display_name,
          age: c.age,
          xp: c.xp,
          kidcoins: c.kidcoins,
          streak: c.streak,
        })),
      });
      setAiReport(report);
    } catch (e) {
      notify("Erro ao gerar relatório: " + (e.message || "Tente novamente"), "error");
    }
    setAiLoading(null);
  };

  const addAIMission = async (m) => {
    const { error } = await supabase.from("missions").insert({
      title: m.title,
      emoji: m.emoji,
      coins_reward: m.coins_reward,
      xp_reward: m.xp_reward,
      family_id: profile.family_id,
      created_by: profile.id,
    });
    if (error) return notify("Erro ao criar missão", "error");
    notify(`✅ "${m.title}" adicionada!`);
    setAiMissions(prev => prev.filter(x => x.title !== m.title));
    load();
  };

  const navTabs = [{key:"home",icon:"🏠",label:"Início"},{key:"missions",icon:"🎯",label:"Missões"},{key:"rewards",icon:"🎁",label:"Recompensas"},{key:"stats",icon:"📊",label:"Stats"}];

  return (
    <div style={{ minHeight: "100vh", background: T.darker, display: "flex", flexDirection: "column" }}>
      <Notif msg={notif} type={notifType} />

      {/* Modal adicionar filho */}
      {showAddChild && (
        <AddChildModal
          familyId={profile.family_id}
          onAdd={() => { setShowAddChild(false); load(); notify("👶 Filho(a) adicionado com sucesso!"); }}
          onClose={() => setShowAddChild(false)}
        />
      )}

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
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
        {loading ? <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Carregando... ⏳</div> : <>

          {/* HOME */}
          {tab === "home" && (
            <div>
              {/* Filhos */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>👶 Meus Filhos</div>
                <button onClick={() => setShowAddChild(true)} style={{ padding: "8px 14px", borderRadius: 12, border: "none", background: `${T.accent}22`, color: T.accent, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Adicionar</button>
              </div>

              {children.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted, marginBottom: 20 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>👶</div>
                    Nenhum filho cadastrado ainda!
                    <div style={{ marginTop: 16 }}>
                      <button onClick={() => setShowAddChild(true)} style={{ padding: "10px 20px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.blue})`, color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Adicionar filho(a)</button>
                    </div>
                  </div>
                : children.map(child => {
                    const l = getLvl(child.xp||0); const n = getNext(child.xp||0);
                    return (
                      <div key={child.id} style={{ background: T.card, borderRadius: 24, padding: 20, marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 18, fontSize: 30, background: `linear-gradient(135deg, ${T.purple}44, ${T.blue}44)`, display: "flex", alignItems: "center", justifyContent: "center" }}>{child.avatar_emoji||"👦"}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: T.text, fontWeight: 800, fontSize: 17 }}>{child.display_name}</div>
                            <div style={{ color: T.textMuted, fontSize: 12 }}>{l.name} · 🪙 {child.kidcoins||0} · {child.age ? `${child.age} anos` : ""}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ color: T.textMuted, fontSize: 10 }}>Streak</div>
                            <div style={{ color: T.warning, fontWeight: 900 }}>{child.streak||0}🔥</div>
                          </div>
                        </div>
                        <XPBar current={(child.xp||0)-l.xpNeeded} max={n.xpNeeded-l.xpNeeded} color={l.color} />
                      </div>
                    );
                  })
              }

              {/* Pendentes */}
              <div style={{ color: T.text, fontWeight: 800, fontSize: 16, marginBottom: 12 }}>⏳ Aguardando Aprovação</div>
              {pending.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>Tudo em dia!</div>
                : pending.map(p => (
                    <div key={p.log_id} style={{ background: T.card, borderRadius: 18, padding: 16, marginBottom: 10, border: `1px solid ${T.warning}33` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: `${T.warning}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{p.mission_emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: T.text, fontWeight: 700 }}>{p.mission_title}</div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{p.child_avatar} {p.child_name} · 🪙 {p.coins_reward} KidCoins</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
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
                <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>🎯 Missões</div>
                <button onClick={() => setShowMission(!showMission)} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.primary}, ${T.pink})`, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Nova</button>
              </div>
              {showMission && (
                <div style={{ background: T.card, borderRadius: 24, padding: 20, marginBottom: 16, border: `1px solid ${T.primary}44` }}>
                  <Inp placeholder="Nome da missão" value={newM.title} onChange={e => setNewM(p=>({...p,title:e.target.value}))} icon="🎯" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>KIDCOINS</div>
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
                : missions.map(m => (
                    <div key={m.id} style={{ background: T.card, borderRadius: 18, padding: 16, marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 28 }}>{m.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: T.text, fontWeight: 700 }}>{m.title}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: T.secondary }}>🪙 {m.coins_reward}</span>
                            <span style={{ fontSize: 12, color: T.accent }}>⚡ {m.xp_reward} XP</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {/* REWARDS */}
          {tab === "rewards" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ color: T.text, fontWeight: 800, fontSize: 16 }}>🎁 Recompensas</div>
                <button onClick={() => setShowReward(!showReward)} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${T.secondary}, ${T.primary})`, color: T.darker, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>+ Nova</button>
              </div>
              {showReward && (
                <div style={{ background: T.card, borderRadius: 24, padding: 20, marginBottom: 16, border: `1px solid ${T.secondary}44` }}>
                  <Inp placeholder="Nome da recompensa" value={newR.title} onChange={e => setNewR(p=>({...p,title:e.target.value}))} icon="🎁" />
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>CUSTO EM KIDCOINS</div>
                    <input type="number" value={newR.coin_cost} onChange={e => setNewR(p=>({...p,coin_cost:+e.target.value}))} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: T.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn onClick={createReward} gradient={`linear-gradient(135deg, ${T.secondary}, ${T.primary})`} small>Criar</Btn>
                    <Btn onClick={() => setShowReward(false)} outline small>Cancelar</Btn>
                  </div>
                </div>
              )}
              {rewards.length === 0
                ? <div style={{ background: T.card, borderRadius: 20, padding: 24, textAlign: "center", color: T.textMuted }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>Nenhuma recompensa ainda!</div>
                : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {rewards.map(r => (
                      <div key={r.id} style={{ background: T.card, borderRadius: 20, padding: 16, textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>{r.emoji}</div>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{r.title}</div>
                        <div style={{ color: T.secondary, fontWeight: 900, fontSize: 14 }}>🪙 {r.coin_cost}</div>
                      </div>
                    ))}
                  </div>
              }
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

                {/* Missões sugeridas pela IA */}
                {aiMissions.length > 0 && (
                  <div>
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
                    <div style={{ color: T.text, fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{aiReport}</div>
                    <button onClick={() => setAiReport(null)} style={{ marginTop: 14, padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>✕ Fechar</button>
                  </div>
                )}
              </div>

              <button onClick={onSignOut} style={{ width: "100%", padding: "14px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: T.textMuted, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Sair da conta</button>
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
// APP ROOT
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen]   = useState("splash");
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else { setUser(null); setProfile(null); setScreen("auth"); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid) => {
    setLoading(true);
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (data) {
        setProfile(data);
        setScreen(!data.family_id && data.role === "parent" ? "onboarding" : data.role === "parent" ? "parent" : "child");
      } else {
        // Perfil não encontrado: trigger falhou anteriormente. Desloga para o usuário se recadastrar.
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
        <div style={{ width: "100%", maxWidth: 430, overflow: "hidden", minHeight: "100vh" }}>
          {screen === "splash" && <Splash onDone={() => {
            if (!loading && user && profile) setScreen(profile.role === "parent" ? "parent" : "child");
            else setScreen("auth");
          }} />}
          {screen === "auth"       && <AuthScreen />}
          {screen === "onboarding" && user && <Onboarding user={user} onDone={() => loadProfile(user.id)} />}
          {screen === "parent"     && profile && <ParentDash profile={profile} onSignOut={signOut} />}
          {screen === "child"      && profile && <ChildDash  profile={profile} onSignOut={signOut} onRefresh={() => loadProfile(user.id)} />}
          {loading && screen !== "splash" && (
            <div style={{ position: "fixed", inset: 0, background: T.darker, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 48, animation: "pulse 1s infinite" }}>🚀</div>
              <div style={{ color: T.textMuted, fontSize: 14 }}>Carregando...</div>
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
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
`;
