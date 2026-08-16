export const TERMS_VERSION = "2026-08-13";
export const TERMS_LAST_UPDATED_LABEL = "13 de agosto de 2026 · v3.0";

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    children: 1,
    coParents: 1,
    activeMissions: 5,
    activeRewards: 3,
  }),
  premium: Object.freeze({
    children: 10,
    coParents: 10,
    activeMissions: null,
    activeRewards: null,
  }),
});

export const PLANS = Object.freeze({
  monthly: Object.freeze({ price: "14,90", period: "/mês", label: "Mensal", total: null, savings: null, badge: "🚀 Lançamento" }),
  annual: Object.freeze({ price: "149,90", period: "/ano", label: "Anual", total: "12,49/mês", savings: "R$ 28,90", badge: "⭐ Melhor valor" }),
});

export const HOTMART_CHECKOUT_URLS = Object.freeze({
  monthly: "https://pay.hotmart.com/E105936971D?off=992z9nyu",
  annual: "https://pay.hotmart.com/E105936971D?off=tjv79dzd",
});

export const PREMIUM_FEATURES = Object.freeze([
  `Até ${PLAN_LIMITS.premium.children} filhos`,
  `Até ${PLAN_LIMITS.premium.coParents} responsáveis`,
  "Missões e recompensas ilimitadas",
  "IA: até 200 solicitações por dia",
  "IA: relatório semanal sob demanda",
  "IA: missão surpresa personalizada",
  "Histórico completo por filho",
  "Suporte prioritário WhatsApp",
]);

export const FREE_FEATURES = Object.freeze([
  `${PLAN_LIMITS.free.children} filho`,
  `${PLAN_LIMITS.free.coParents} responsável (só você)`,
  `Até ${PLAN_LIMITS.free.activeMissions} missões ativas`,
  `Até ${PLAN_LIMITS.free.activeRewards} recompensas ativas`,
  "IA: até 40 solicitações por dia",
  "Gamificação completa (XP, níveis, streak, conquistas)",
]);

export function getAdminChildCount(family) {
  const explicitCount = Number(family?.child_count);
  if (Number.isFinite(explicitCount) && explicitCount >= 0) return explicitCount;

  if (!Array.isArray(family?.children)) return 0;
  return family.children.filter((member) => member?.role === "child").length;
}
