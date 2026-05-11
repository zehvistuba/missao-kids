import { useState, useEffect, useRef } from "react";

// ============================================================
// THEME & CONSTANTS
// ============================================================
const THEME = {
  primary: "#FF6B35",
  secondary: "#FFD23F",
  accent: "#06D6A0",
  purple: "#9B5DE5",
  blue: "#4CC9F0",
  pink: "#F72585",
  dark: "#1A1A2E",
  darker: "#0F0F1A",
  card: "#252540",
  cardLight: "#2E2E50",
  text: "#F0F0FF",
  textMuted: "#9090B0",
  success: "#06D6A0",
  warning: "#FFD23F",
  danger: "#F72585",
};

const LEVELS = [
  { level: 1, name: "Recruta", xpNeeded: 0, color: "#9090B0", emoji: "🌱" },
  { level: 2, name: "Explorador", xpNeeded: 100, color: "#4CC9F0", emoji: "⭐" },
  { level: 3, name: "Aventureiro", xpNeeded: 300, color: "#06D6A0", emoji: "🚀" },
  { level: 4, name: "Herói", xpNeeded: 600, color: "#FFD23F", emoji: "🦸" },
  { level: 5, name: "Lendário", xpNeeded: 1000, color: "#FF6B35", emoji: "👑" },
  { level: 6, name: "Supremo", xpNeeded: 1500, color: "#F72585", emoji: "💎" },
];

const SAMPLE_MISSIONS = [
  { id: 1, name: "Arrumar a cama", emoji: "🛏️", coins: 20, xp: 15, category: "Casa", difficulty: "Fácil", done: false, pending: false, days: ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"] },
  { id: 2, name: "Escovar os dentes", emoji: "🦷", coins: 15, xp: 10, category: "Higiene", difficulty: "Fácil", done: true, pending: false, days: ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"] },
  { id: 3, name: "Fazer lição de casa", emoji: "📚", coins: 50, xp: 40, category: "Estudos", difficulty: "Médio", done: false, pending: true, days: ["Seg","Ter","Qua","Qui","Sex"] },
  { id: 4, name: "Organizar o quarto", emoji: "🧹", coins: 35, xp: 25, category: "Casa", difficulty: "Médio", done: false, pending: false, days: ["Sáb","Dom"] },
  { id: 5, name: "Ler por 20 minutos", emoji: "📖", coins: 30, xp: 25, category: "Estudos", difficulty: "Médio", done: false, pending: false, days: ["Seg","Ter","Qua","Qui","Sex"] },
  { id: 6, name: "Lavar a louça", emoji: "🍽️", coins: 40, xp: 30, category: "Casa", difficulty: "Médio", done: false, pending: false, days: ["Seg","Qua","Sex"] },
];

const REWARDS = [
  { id: 1, name: "1h de Videogame", emoji: "🎮", cost: 100, category: "Entretenimento" },
  { id: 2, name: "Sorvete", emoji: "🍦", cost: 60, category: "Guloseimas" },
  { id: 3, name: "Pacote de Figurinhas", emoji: "🃏", cost: 80, category: "Coleção" },
  { id: 4, name: "Passeio no Parque", emoji: "🌳", cost: 200, category: "Passeios" },
  { id: 5, name: "Netflix por 2h", emoji: "📺", cost: 120, category: "Entretenimento" },
  { id: 6, name: "Doces à escolha", emoji: "🍬", cost: 50, category: "Guloseimas" },
];

const ACHIEVEMENTS = [
  { id: 1, name: "Primeiros Passos", desc: "Complete sua primeira missão", emoji: "👣", earned: true },
  { id: 2, name: "7 dias seguidos", desc: "Mantenha o streak por 7 dias", emoji: "🔥", earned: true },
  { id: 3, name: "Mestre da Organização", desc: "Complete 10 missões de Casa", emoji: "🏆", earned: false },
  { id: 4, name: "Super Estudante", desc: "Complete 5 tarefas de estudos", emoji: "🎓", earned: false },
  { id: 5, name: "Colecionador", desc: "Resgate 3 recompensas", emoji: "⭐", earned: false },
];

const CHILDREN = [
  { id: 1, name: "Sofia", avatar: "👧", age: 9, coins: 340, xp: 420, streak: 7, level: 3, pendingApprovals: 1 },
  { id: 2, name: "Mateus", avatar: "👦", age: 12, coins: 180, xp: 280, streak: 3, level: 2, pendingApprovals: 0 },
];

// ============================================================
// UTILITY COMPONENTS
// ============================================================

const KidCoinIcon = ({ size = 16 }) => (
  <span style={{ fontSize: size, display: "inline-flex", alignItems: "center" }}>🪙</span>
);

const XPBar = ({ current, max, color = THEME.accent }) => {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, height: 8, overflow: "hidden", width: "100%" }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 999,
        background: `linear-gradient(90deg, ${color}, ${color}CC)`,
        transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: `0 0 8px ${color}88`,
      }} />
    </div>
  );
};

const Badge = ({ children, color = THEME.primary }) => (
  <span style={{
    background: `${color}22`, color, border: `1px solid ${color}44`,
    borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700,
    letterSpacing: 0.5,
  }}>{children}</span>
);

const CoinBurst = ({ show }) => {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          fontSize: 24,
          animation: `coinBurst${i} 0.8s ease-out forwards`,
          transform: `rotate(${i * 45}deg)`,
        }}>🪙</div>
      ))}
      <div style={{
        fontSize: 28, fontWeight: 900, color: THEME.secondary,
        textShadow: `0 0 20px ${THEME.secondary}`,
        animation: "fadeUp 0.8s ease-out forwards",
      }}>+KidCoins!</div>
    </div>
  );
};

// ============================================================
// SCREENS
// ============================================================

// ─── SPLASH ───
const SplashScreen = ({ onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      ...styles.screen,
      background: `radial-gradient(ellipse at 30% 20%, ${THEME.purple}44 0%, transparent 60%),
                   radial-gradient(ellipse at 80% 80%, ${THEME.primary}44 0%, transparent 60%),
                   ${THEME.darker}`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ animation: "bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1)", textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 12, filter: "drop-shadow(0 0 20px rgba(255,107,53,0.6))" }}>🚀</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: THEME.text, letterSpacing: -1 }}>
          Missão<span style={{ color: THEME.primary }}> Kids</span>
        </div>
        <div style={{ color: THEME.textMuted, fontSize: 14, marginTop: 8, letterSpacing: 2 }}>
          TRANSFORME A ROTINA EM AVENTURA
        </div>
      </div>
      <div style={{ marginTop: 60, display: "flex", gap: 8 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: i === 0 ? 24 : 8, height: 8, borderRadius: 999,
            background: i === 0 ? THEME.primary : "rgba(255,255,255,0.2)",
            animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
};

// ─── ONBOARDING ───
const OnboardingScreen = ({ onDone }) => {
  const [step, setStep] = useState(0);
  const steps = [
    { emoji: "🎯", title: "Missões Diárias", desc: "Crie tarefas divertidas e ajude seus filhos a desenvolver bons hábitos de forma natural.", color: THEME.primary },
    { emoji: "🪙", title: "Ganhe KidCoins", desc: "Cada missão concluída rende KidCoins. Complete e suba de nível!", color: THEME.secondary },
    { emoji: "🏆", title: "Recompensas Reais", desc: "Troque KidCoins por recompensas que você mesmo define para sua família.", color: THEME.accent },
  ];
  const s = steps[step];

  return (
    <div style={{ ...styles.screen, background: THEME.darker, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
        <div style={{
          width: 160, height: 160, borderRadius: 40,
          background: `radial-gradient(circle, ${s.color}33, ${s.color}11)`,
          border: `2px solid ${s.color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 80, marginBottom: 40,
          boxShadow: `0 0 40px ${s.color}33`,
          animation: "floatY 2s ease-in-out infinite",
        }}>{s.emoji}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: THEME.text, textAlign: "center", marginBottom: 16 }}>{s.title}</div>
        <div style={{ fontSize: 16, color: THEME.textMuted, textAlign: "center", lineHeight: 1.6 }}>{s.desc}</div>
      </div>

      <div style={{ padding: "32px 24px 48px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 32 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              height: 8, width: i === step ? 32 : 8, borderRadius: 999,
              background: i === step ? s.color : "rgba(255,255,255,0.15)",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>
        <button
          onClick={() => step < steps.length - 1 ? setStep(step + 1) : onDone()}
          style={{ ...styles.btn, background: `linear-gradient(135deg, ${s.color}, ${s.color}BB)` }}
        >
          {step < steps.length - 1 ? "Próximo →" : "Vamos lá! 🚀"}
        </button>
      </div>
    </div>
  );
};

// ─── LOGIN ───
const LoginScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("child"); // child | parent
  const [name, setName] = useState("");

  return (
    <div style={{
      ...styles.screen, background: THEME.darker,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 24px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🚀</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: THEME.text }}>
          Missão<span style={{ color: THEME.primary }}> Kids</span>
        </div>
        <div style={{ color: THEME.textMuted, fontSize: 13, marginTop: 4 }}>Escolha como quer entrar</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 32, width: "100%" }}>
        {[
          { key: "child", label: "Sou Criança", emoji: "👦", color: THEME.accent },
          { key: "parent", label: "Sou Responsável", emoji: "👨‍👩‍👧", color: THEME.primary },
        ].map(opt => (
          <button key={opt.key} onClick={() => setMode(opt.key)} style={{
            flex: 1, padding: "20px 12px", borderRadius: 20,
            border: `2px solid ${mode === opt.key ? opt.color : "rgba(255,255,255,0.1)"}`,
            background: mode === opt.key ? `${opt.color}22` : "rgba(255,255,255,0.04)",
            color: mode === opt.key ? opt.color : THEME.textMuted,
            cursor: "pointer", transition: "all 0.2s",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 32 }}>{opt.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</span>
          </button>
        ))}
      </div>

      <div style={{ width: "100%", marginBottom: 24 }}>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder={mode === "child" ? "Qual é o seu nome?" : "Nome do responsável"}
          style={styles.input}
        />
      </div>

      <button
        onClick={() => name && onLogin(mode, name)}
        style={{
          ...styles.btn,
          background: mode === "child"
            ? `linear-gradient(135deg, ${THEME.accent}, ${THEME.blue})`
            : `linear-gradient(135deg, ${THEME.primary}, ${THEME.pink})`,
          opacity: name ? 1 : 0.5,
        }}
      >
        Entrar na Aventura 🎮
      </button>

      <div style={{ color: THEME.textMuted, fontSize: 13, marginTop: 20, textAlign: "center" }}>
        Novo por aqui?{" "}
        <span style={{ color: THEME.primary, cursor: "pointer", fontWeight: 700 }}>Criar conta gratuita</span>
      </div>
    </div>
  );
};

// ─── CHILD DASHBOARD ───
const ChildDashboard = ({ childName, onBack }) => {
  const [tab, setTab] = useState("home");
  const [missions, setMissions] = useState(SAMPLE_MISSIONS);
  const [coins, setCoins] = useState(340);
  const [xp, setXp] = useState(420);
  const [streak, setStreak] = useState(7);
  const [showBurst, setShowBurst] = useState(false);
  const [notification, setNotification] = useState(null);
  const currentLevel = LEVELS.filter(l => xp >= l.xpNeeded).pop();
  const nextLevel = LEVELS.find(l => l.xpNeeded > xp) || LEVELS[LEVELS.length - 1];
  const xpInLevel = xp - currentLevel.xpNeeded;
  const xpForNext = nextLevel.xpNeeded - currentLevel.xpNeeded;

  const completeMission = (id) => {
    setMissions(prev => prev.map(m => m.id === id ? { ...m, pending: true } : m));
    setNotification("✅ Missão enviada para aprovação!");
    setTimeout(() => setNotification(null), 2500);
  };

  const approveDemo = (id) => {
    const m = missions.find(m => m.id === id);
    if (!m) return;
    setMissions(prev => prev.map(m => m.id === id ? { ...m, done: true, pending: false } : m));
    setCoins(c => c + m.coins);
    setXp(x => x + m.xp);
    setShowBurst(true);
    setNotification(`🎉 +${m.coins} KidCoins ganhos!`);
    setTimeout(() => { setShowBurst(false); setNotification(null); }, 2500);
  };

  const todayMissions = missions;
  const doneMissions = todayMissions.filter(m => m.done).length;
  const totalMissions = todayMissions.length;

  return (
    <div style={{ ...styles.screen, background: THEME.darker, display: "flex", flexDirection: "column" }}>
      <CoinBurst show={showBurst} />

      {notification && (
        <div style={{
          position: "fixed", top: 20, left: 16, right: 16, zIndex: 9998,
          background: THEME.card, borderRadius: 16, padding: "14px 20px",
          border: `1px solid ${THEME.accent}44`, color: THEME.text,
          fontWeight: 700, fontSize: 14, textAlign: "center",
          boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
          animation: "slideDown 0.3s ease",
        }}>{notification}</div>
      )}

      {/* Header */}
      <div style={{
        padding: "16px 20px 0",
        background: `linear-gradient(180deg, ${THEME.darker} 0%, transparent 100%)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: `linear-gradient(135deg, ${THEME.purple}, ${THEME.blue})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, border: `2px solid ${THEME.purple}44`,
            }}>👧</div>
            <div>
              <div style={{ color: THEME.textMuted, fontSize: 11, letterSpacing: 1 }}>BEM-VINDA,</div>
              <div style={{ color: THEME.text, fontSize: 16, fontWeight: 800 }}>Sofia ⚡</div>
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: THEME.card, borderRadius: 14, padding: "8px 14px",
            border: `1px solid ${THEME.secondary}33`,
          }}>
            <KidCoinIcon size={18} />
            <span style={{ color: THEME.secondary, fontWeight: 900, fontSize: 16 }}>{coins}</span>
          </div>
        </div>

        {/* Level Card */}
        <div style={{
          background: `linear-gradient(135deg, ${THEME.card}, ${THEME.cardLight})`,
          borderRadius: 20, padding: "16px 20px", marginBottom: 4,
          border: `1px solid ${currentLevel.color}33`,
          boxShadow: `0 4px 24px ${currentLevel.color}22`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>{currentLevel.emoji}</span>
              <div>
                <div style={{ color: currentLevel.color, fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                  NÍVEL {currentLevel.level}
                </div>
                <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16 }}>{currentLevel.name}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: THEME.textMuted, fontSize: 11 }}>Streak</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 16 }}>🔥</span>
                <span style={{ color: THEME.warning, fontWeight: 900, fontSize: 18 }}>{streak}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: THEME.textMuted }}>XP: {xpInLevel} / {xpForNext}</span>
            <span style={{ fontSize: 12, color: currentLevel.color }}>→ {nextLevel.name}</span>
          </div>
          <XPBar current={xpInLevel} max={xpForNext} color={currentLevel.color} />
        </div>

        {/* Today Progress */}
        <div style={{
          background: THEME.card, borderRadius: 16, padding: "12px 16px",
          marginTop: 12, marginBottom: 4,
          border: `1px solid rgba(255,255,255,0.06)`,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 6 }}>
              Missões de hoje: {doneMissions}/{totalMissions}
            </div>
            <XPBar current={doneMissions} max={totalMissions} color={THEME.accent} />
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `conic-gradient(${THEME.accent} ${doneMissions / totalMissions * 360}deg, rgba(255,255,255,0.1) 0deg)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: THEME.card,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: THEME.accent,
            }}>{Math.round(doneMissions / totalMissions * 100)}%</div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 80px" }}>
        {tab === "home" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16 }}>🎯 Missões de Hoje</div>
              <Badge color={THEME.primary}>{totalMissions - doneMissions} pendentes</Badge>
            </div>

            {todayMissions.map(m => (
              <div key={m.id} style={{
                background: m.done ? `${THEME.accent}11` : m.pending ? `${THEME.warning}11` : THEME.card,
                borderRadius: 18, padding: "16px", marginBottom: 12,
                border: `1px solid ${m.done ? THEME.accent + "44" : m.pending ? THEME.warning + "44" : "rgba(255,255,255,0.06)"}`,
                opacity: m.done ? 0.7 : 1,
                transition: "all 0.3s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 16,
                    background: m.done ? `${THEME.accent}22` : `rgba(255,255,255,0.06)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26,
                  }}>{m.done ? "✅" : m.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: m.done ? THEME.textMuted : THEME.text,
                      fontWeight: 700, fontSize: 15,
                      textDecoration: m.done ? "line-through" : "none",
                    }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: THEME.secondary, display: "flex", alignItems: "center", gap: 3 }}>
                        <KidCoinIcon size={12} /> {m.coins}
                      </span>
                      <span style={{ fontSize: 12, color: THEME.accent }}>+{m.xp} XP</span>
                      <Badge color={m.difficulty === "Fácil" ? THEME.accent : THEME.warning}>{m.difficulty}</Badge>
                    </div>
                  </div>
                  {!m.done && !m.pending && (
                    <button onClick={() => completeMission(m.id)} style={{
                      padding: "8px 14px", borderRadius: 12,
                      background: `linear-gradient(135deg, ${THEME.primary}, ${THEME.pink})`,
                      border: "none", color: "#fff", fontWeight: 800, fontSize: 12,
                      cursor: "pointer",
                    }}>Feito!</button>
                  )}
                  {m.pending && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span style={{ fontSize: 11, color: THEME.warning, fontWeight: 700 }}>⏳ Aprovação</span>
                      <button onClick={() => approveDemo(m.id)} style={{
                        padding: "6px 10px", borderRadius: 10, fontSize: 10,
                        background: `${THEME.accent}22`, border: `1px solid ${THEME.accent}44`,
                        color: THEME.accent, fontWeight: 700, cursor: "pointer",
                      }}>Demo: Aprovar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "store" && (
          <div>
            <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🏪 Loja de Recompensas</div>
            <div style={{ color: THEME.textMuted, fontSize: 13, marginBottom: 20 }}>
              Seu saldo: <span style={{ color: THEME.secondary, fontWeight: 800 }}><KidCoinIcon /> {coins}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {REWARDS.map(r => {
                const canAfford = coins >= r.cost;
                return (
                  <div key={r.id} style={{
                    background: THEME.card, borderRadius: 20, padding: 16,
                    border: `1px solid ${canAfford ? THEME.accent + "33" : "rgba(255,255,255,0.06)"}`,
                    textAlign: "center", opacity: canAfford ? 1 : 0.6,
                  }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>{r.emoji}</div>
                    <div style={{ color: THEME.text, fontWeight: 700, fontSize: 13, marginBottom: 8, lineHeight: 1.3 }}>{r.name}</div>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      color: THEME.secondary, fontWeight: 900, fontSize: 14, marginBottom: 10,
                    }}>
                      <KidCoinIcon size={14} /> {r.cost}
                    </div>
                    <button style={{
                      width: "100%", padding: "8px 0", borderRadius: 12, border: "none",
                      background: canAfford
                        ? `linear-gradient(135deg, ${THEME.accent}, ${THEME.blue})`
                        : "rgba(255,255,255,0.06)",
                      color: canAfford ? "#fff" : THEME.textMuted,
                      fontWeight: 800, fontSize: 12, cursor: canAfford ? "pointer" : "not-allowed",
                    }}>{canAfford ? "Resgatar" : "Sem saldo"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "achievements" && (
          <div>
            <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16, marginBottom: 20 }}>🏆 Conquistas</div>
            {ACHIEVEMENTS.map(a => (
              <div key={a.id} style={{
                background: a.earned ? `${THEME.secondary}11` : THEME.card,
                borderRadius: 18, padding: "16px", marginBottom: 10,
                border: `1px solid ${a.earned ? THEME.secondary + "44" : "rgba(255,255,255,0.06)"}`,
                display: "flex", alignItems: "center", gap: 16,
                opacity: a.earned ? 1 : 0.5,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16, fontSize: 28,
                  background: a.earned ? `${THEME.secondary}22` : "rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  filter: a.earned ? "none" : "grayscale(100%)",
                }}>{a.emoji}</div>
                <div>
                  <div style={{ color: a.earned ? THEME.text : THEME.textMuted, fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                  <div style={{ color: THEME.textMuted, fontSize: 12, marginTop: 3 }}>{a.desc}</div>
                  {a.earned && <Badge color={THEME.secondary}>✨ Desbloqueado</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "profile" && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 100, height: 100, borderRadius: 30, margin: "0 auto 16px",
              background: `linear-gradient(135deg, ${THEME.purple}, ${THEME.blue})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 56, border: `3px solid ${THEME.purple}`,
              boxShadow: `0 0 30px ${THEME.purple}44`,
            }}>👧</div>
            <div style={{ color: THEME.text, fontWeight: 900, fontSize: 22, marginBottom: 4 }}>Sofia</div>
            <div style={{ color: THEME.textMuted, fontSize: 14, marginBottom: 24 }}>9 anos</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { label: "KidCoins", value: coins, icon: "🪙", color: THEME.secondary },
                { label: "Nível", value: currentLevel.level, icon: currentLevel.emoji, color: currentLevel.color },
                { label: "Streak", value: `${streak}🔥`, icon: "", color: THEME.warning },
              ].map((s, i) => (
                <div key={i} style={{
                  background: THEME.card, borderRadius: 18, padding: 16,
                  border: `1px solid ${s.color}33`, textAlign: "center",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ color: s.color, fontWeight: 900, fontSize: 18 }}>{s.value}</div>
                  <div style={{ color: THEME.textMuted, fontSize: 11 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: THEME.card, borderRadius: 20, padding: 20, textAlign: "left" }}>
              <div style={{ color: THEME.text, fontWeight: 700, marginBottom: 12 }}>Histórico Semanal</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map((d, i) => (
                  <div key={d} style={{ textAlign: "center", flex: 1 }}>
                    <div style={{
                      height: 40, borderRadius: 8, marginBottom: 6,
                      background: i < 5 ? `linear-gradient(180deg, ${THEME.accent}, ${THEME.blue})` :
                                  i === 5 ? `linear-gradient(180deg, ${THEME.warning}, ${THEME.primary})` :
                                  "rgba(255,255,255,0.06)",
                    }} />
                    <div style={{ fontSize: 9, color: THEME.textMuted }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        maxWidth: 430, margin: "0 auto",
        background: `${THEME.darker}EE`, backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", padding: "12px 0 24px",
      }}>
        {[
          { key: "home", icon: "🏠", label: "Início" },
          { key: "store", icon: "🏪", label: "Loja" },
          { key: "achievements", icon: "🏆", label: "Conquistas" },
          { key: "profile", icon: "👧", label: "Perfil" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer",
          }}>
            <div style={{
              fontSize: 24,
              filter: tab === t.key ? "none" : "grayscale(80%)",
              transform: tab === t.key ? "scale(1.2)" : "scale(1)",
              transition: "all 0.2s",
            }}>{t.icon}</div>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: tab === t.key ? THEME.primary : THEME.textMuted,
              letterSpacing: 0.5,
            }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── PARENT DASHBOARD ───
const ParentDashboard = ({ parentName, onBack }) => {
  const [tab, setTab] = useState("home");
  const [children] = useState(CHILDREN);
  const [missions, setMissions] = useState(SAMPLE_MISSIONS);
  const [showNewMission, setShowNewMission] = useState(false);
  const [newMission, setNewMission] = useState({ name: "", emoji: "⭐", coins: 20, xp: 15, difficulty: "Fácil", category: "Casa" });

  const addMission = () => {
    if (!newMission.name) return;
    setMissions(prev => [...prev, { ...newMission, id: Date.now(), done: false, pending: false, days: ["Seg","Ter","Qua","Qui","Sex"] }]);
    setNewMission({ name: "", emoji: "⭐", coins: 20, xp: 15, difficulty: "Fácil", category: "Casa" });
    setShowNewMission(false);
  };

  return (
    <div style={{ ...styles.screen, background: THEME.darker, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        background: `linear-gradient(135deg, ${THEME.primary}22, ${THEME.pink}11)`,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: THEME.textMuted, letterSpacing: 1 }}>PAINEL DO RESPONSÁVEL</div>
            <div style={{ color: THEME.text, fontSize: 18, fontWeight: 800 }}>👨‍👩‍👧 {parentName}</div>
          </div>
          <div style={{
            background: `${THEME.primary}22`, border: `1px solid ${THEME.primary}44`,
            borderRadius: 12, padding: "6px 12px",
            color: THEME.primary, fontSize: 12, fontWeight: 700,
          }}>
            {children.reduce((a, c) => a + c.pendingApprovals, 0)} aprovações
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
        {tab === "home" && (
          <div>
            <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>👶 Meus Filhos</div>

            {children.map(child => (
              <div key={child.id} style={{
                background: THEME.card, borderRadius: 24, padding: 20, marginBottom: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: 20, fontSize: 32,
                    background: `linear-gradient(135deg, ${THEME.purple}44, ${THEME.blue}44)`,
                    border: `2px solid ${THEME.purple}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{child.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: THEME.text, fontWeight: 800, fontSize: 18 }}>{child.name}</div>
                    <div style={{ color: THEME.textMuted, fontSize: 13 }}>{child.age} anos · {LEVELS.filter(l => child.xp >= l.xpNeeded).pop().name}</div>
                  </div>
                  {child.pendingApprovals > 0 && (
                    <div style={{
                      background: THEME.warning, color: THEME.darker,
                      borderRadius: 10, width: 24, height: 24,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 900,
                    }}>{child.pendingApprovals}</div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "KidCoins", value: child.coins, icon: "🪙", color: THEME.secondary },
                    { label: "XP", value: child.xp, icon: "⚡", color: THEME.accent },
                    { label: "Streak", value: `${child.streak}🔥`, icon: "", color: THEME.warning },
                  ].map((s, i) => (
                    <div key={i} style={{
                      background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "10px 8px", textAlign: "center",
                    }}>
                      <div style={{ color: s.color, fontWeight: 900, fontSize: 16 }}>{s.icon} {s.value}</div>
                      <div style={{ color: THEME.textMuted, fontSize: 10, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <XPBar
                  current={child.xp - LEVELS.filter(l => child.xp >= l.xpNeeded).pop().xpNeeded}
                  max={
                    (LEVELS.find(l => l.xpNeeded > child.xp) || LEVELS[LEVELS.length - 1]).xpNeeded -
                    LEVELS.filter(l => child.xp >= l.xpNeeded).pop().xpNeeded
                  }
                  color={LEVELS.filter(l => child.xp >= l.xpNeeded).pop().color}
                />

                {child.pendingApprovals > 0 && (
                  <button style={{
                    ...styles.btn, marginTop: 16,
                    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.blue})`,
                    padding: "12px 0",
                  }}>⚡ Revisar {child.pendingApprovals} tarefa(s)</button>
                )}
              </div>
            ))}

            {/* Pending Approval Section */}
            <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
              ⏳ Aguardando Aprovação
            </div>
            {missions.filter(m => m.pending).length === 0 ? (
              <div style={{
                background: THEME.card, borderRadius: 20, padding: 24, textAlign: "center",
                border: "1px solid rgba(255,255,255,0.06)", color: THEME.textMuted,
              }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✨</div>
                <div>Nada pendente! Tudo em dia.</div>
              </div>
            ) : (
              missions.filter(m => m.pending).map(m => (
                <div key={m.id} style={{
                  background: THEME.card, borderRadius: 18, padding: 16, marginBottom: 10,
                  border: `1px solid ${THEME.warning}33`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 28, flex: "none" }}>{m.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: THEME.text, fontWeight: 700 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: THEME.textMuted }}>Sofia · {m.coins} KidCoins</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{
                        padding: "8px 12px", borderRadius: 10, border: "none",
                        background: `${THEME.accent}22`, color: THEME.accent,
                        fontWeight: 800, fontSize: 12, cursor: "pointer",
                      }}>✓</button>
                      <button style={{
                        padding: "8px 12px", borderRadius: 10, border: "none",
                        background: `${THEME.pink}22`, color: THEME.pink,
                        fontWeight: 800, fontSize: 12, cursor: "pointer",
                      }}>✗</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "missions" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16 }}>🎯 Missões Cadastradas</div>
              <button onClick={() => setShowNewMission(true)} style={{
                padding: "8px 16px", borderRadius: 12,
                background: `linear-gradient(135deg, ${THEME.primary}, ${THEME.pink})`,
                border: "none", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
              }}>+ Nova</button>
            </div>

            {showNewMission && (
              <div style={{
                background: THEME.card, borderRadius: 24, padding: 20, marginBottom: 16,
                border: `1px solid ${THEME.primary}44`,
              }}>
                <div style={{ color: THEME.text, fontWeight: 800, marginBottom: 16 }}>✨ Nova Missão</div>
                <input
                  value={newMission.name}
                  onChange={e => setNewMission(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nome da missão..."
                  style={{ ...styles.input, marginBottom: 12 }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 6 }}>KIDCOINS</div>
                    <input
                      type="number" value={newMission.coins}
                      onChange={e => setNewMission(p => ({ ...p, coins: +e.target.value }))}
                      style={{ ...styles.input, padding: "10px 14px" }}
                    />
                  </div>
                  <div>
                    <div style={{ color: THEME.textMuted, fontSize: 11, marginBottom: 6 }}>XP</div>
                    <input
                      type="number" value={newMission.xp}
                      onChange={e => setNewMission(p => ({ ...p, xp: +e.target.value }))}
                      style={{ ...styles.input, padding: "10px 14px" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button onClick={addMission} style={{
                    ...styles.btn, flex: 1,
                    background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.blue})`,
                    padding: "12px 0",
                  }}>Criar Missão</button>
                  <button onClick={() => setShowNewMission(false)} style={{
                    padding: "12px 20px", borderRadius: 14, border: `1px solid rgba(255,255,255,0.1)`,
                    background: "none", color: THEME.textMuted, cursor: "pointer", fontWeight: 700,
                  }}>Cancelar</button>
                </div>
              </div>
            )}

            {missions.map(m => (
              <div key={m.id} style={{
                background: THEME.card, borderRadius: 18, padding: 16, marginBottom: 10,
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 28 }}>{m.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: THEME.text, fontWeight: 700 }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: THEME.secondary }}>🪙 {m.coins}</span>
                      <span style={{ fontSize: 12, color: THEME.accent }}>⚡ {m.xp} XP</span>
                      <Badge color={m.difficulty === "Fácil" ? THEME.accent : THEME.warning}>{m.difficulty}</Badge>
                    </div>
                  </div>
                  <div style={{ color: THEME.textMuted, fontSize: 20, cursor: "pointer" }}>⋮</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "rewards" && (
          <div>
            <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🎁 Recompensas da Loja</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {REWARDS.map(r => (
                <div key={r.id} style={{
                  background: THEME.card, borderRadius: 20, padding: 16, textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{r.emoji}</div>
                  <div style={{ color: THEME.text, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{r.name}</div>
                  <div style={{ color: THEME.secondary, fontWeight: 900, fontSize: 14, marginBottom: 10 }}>
                    🪙 {r.cost}
                  </div>
                  <Badge color={THEME.primary}>{r.category}</Badge>
                </div>
              ))}
            </div>
            <button style={{
              ...styles.btn, marginTop: 16,
              background: `linear-gradient(135deg, ${THEME.secondary}, ${THEME.primary})`,
            }}>+ Adicionar Recompensa</button>
          </div>
        )}

        {tab === "stats" && (
          <div>
            <div style={{ color: THEME.text, fontWeight: 800, fontSize: 16, marginBottom: 16 }}>📊 Estatísticas da Família</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Missões essa semana", value: "23", icon: "🎯", color: THEME.primary },
                { label: "KidCoins distribuídos", value: "860", icon: "🪙", color: THEME.secondary },
                { label: "Melhor streak", value: "7🔥", icon: "", color: THEME.warning },
                { label: "Conquistas desbloqueadas", value: "4", icon: "🏆", color: THEME.accent },
              ].map((s, i) => (
                <div key={i} style={{
                  background: THEME.card, borderRadius: 20, padding: 18,
                  border: `1px solid ${s.color}22`,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ color: s.color, fontWeight: 900, fontSize: 22 }}>{s.value}</div>
                  <div style={{ color: THEME.textMuted, fontSize: 11, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: THEME.card, borderRadius: 24, padding: 20, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: THEME.text, fontWeight: 700, marginBottom: 16 }}>Progresso Semanal</div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
                {[60, 85, 45, 90, 70, 30, 20].map((h, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: "100%", height: `${h}%`, borderRadius: "8px 8px 0 0",
                      background: i < 5
                        ? `linear-gradient(180deg, ${THEME.primary}, ${THEME.pink})`
                        : "rgba(255,255,255,0.08)",
                    }} />
                    <span style={{ fontSize: 9, color: THEME.textMuted }}>
                      {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
        background: `${THEME.darker}EE`, backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", padding: "12px 0 24px",
      }}>
        {[
          { key: "home", icon: "🏠", label: "Início" },
          { key: "missions", icon: "🎯", label: "Missões" },
          { key: "rewards", icon: "🎁", label: "Recompensas" },
          { key: "stats", icon: "📊", label: "Stats" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer",
          }}>
            <div style={{
              fontSize: 22,
              filter: tab === t.key ? "none" : "grayscale(80%)",
              transform: tab === t.key ? "scale(1.2)" : "scale(1)",
              transition: "all 0.2s",
            }}>{t.icon}</div>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: tab === t.key ? THEME.primary : THEME.textMuted,
            }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// MAIN APP
// ============================================================
export default function MissaoKids() {
  const [screen, setScreen] = useState("splash");
  const [userMode, setUserMode] = useState(null);
  const [userName, setUserName] = useState("");

  const handleLogin = (mode, name) => {
    setUserMode(mode);
    setUserName(name);
    setScreen(mode === "child" ? "childDash" : "parentDash");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body { font-family: 'Nunito', sans-serif; background: #0F0F1A; }

        @keyframes bounceIn {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); }
          80% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes floatY {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes coinBurst0 { to { transform: rotate(0deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst1 { to { transform: rotate(45deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst2 { to { transform: rotate(90deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst3 { to { transform: rotate(135deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst4 { to { transform: rotate(180deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst5 { to { transform: rotate(225deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst6 { to { transform: rotate(270deg) translateY(-80px); opacity: 0; } }
        @keyframes coinBurst7 { to { transform: rotate(315deg) translateY(-80px); opacity: 0; } }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <div style={{
        display: "flex", justifyContent: "center", minHeight: "100vh",
        background: "#080810",
      }}>
        <div style={{ width: "100%", maxWidth: 430, position: "relative", overflow: "hidden", minHeight: "100vh" }}>
          {screen === "splash" && <SplashScreen onDone={() => setScreen("onboarding")} />}
          {screen === "onboarding" && <OnboardingScreen onDone={() => setScreen("login")} />}
          {screen === "login" && <LoginScreen onLogin={handleLogin} />}
          {screen === "childDash" && <ChildDashboard childName={userName} onBack={() => setScreen("login")} />}
          {screen === "parentDash" && <ParentDashboard parentName={userName} onBack={() => setScreen("login")} />}
        </div>
      </div>
    </>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = {
  screen: {
    minHeight: "100vh",
    width: "100%",
    fontFamily: "'Nunito', sans-serif",
  },
  btn: {
    width: "100%", padding: "16px 24px", borderRadius: 18,
    border: "none", color: "#fff", fontWeight: 900,
    fontSize: 16, cursor: "pointer", letterSpacing: 0.3,
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    transition: "transform 0.1s, opacity 0.2s",
  },
  input: {
    width: "100%", padding: "14px 18px", borderRadius: 16,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#F0F0FF", fontSize: 15, fontFamily: "'Nunito', sans-serif",
    outline: "none",
  },
};
