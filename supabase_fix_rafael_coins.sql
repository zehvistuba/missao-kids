-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: compensação histórica de coins do Rafael
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-28
-- IMPORTANTE: versão corrigida — sem produto cartesiano (subqueries independentes)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ETAPA 1: DIAGNÓSTICO (rode primeiro, não altera nada) ───────────────

SELECT
  p.display_name,
  p.kidcoins                                                        AS saldo_atual,

  -- Ganhos: missões aprovadas (coins_reward, ignorando negativos)
  (SELECT COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0)
   FROM mission_logs ml JOIN missions m ON m.id = ml.mission_id
   WHERE ml.child_id = p.id AND ml.status = 'approved')            AS ganhos_missoes,

  -- Ganhos: bônus de streak
  (SELECT COALESCE(SUM(bonus_coins), 0)
   FROM streak_bonus_logs WHERE child_id = p.id)                   AS ganhos_streak,

  -- Gastos: resgates entregues
  (SELECT COALESCE(SUM(coin_cost), 0)
   FROM redemption_logs WHERE child_id = p.id AND status = 'delivered') AS gastos_resgates,

  -- Gastos: tropeços
  (SELECT COALESCE(SUM(coins_deducted), 0)
   FROM demerit_logs WHERE child_id = p.id)                        AS gastos_tropecos,

  -- Calculado: ganhos - gastos
  (SELECT COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0)
   FROM mission_logs ml JOIN missions m ON m.id = ml.mission_id
   WHERE ml.child_id = p.id AND ml.status = 'approved')
  + (SELECT COALESCE(SUM(bonus_coins), 0) FROM streak_bonus_logs WHERE child_id = p.id)
  - (SELECT COALESCE(SUM(coin_cost), 0) FROM redemption_logs WHERE child_id = p.id AND status = 'delivered')
  - (SELECT COALESCE(SUM(coins_deducted), 0) FROM demerit_logs WHERE child_id = p.id)
                                                                    AS saldo_calculado,

  -- Diferença a compensar (positivo = faltam coins; negativo = está a mais)
  (
    (SELECT COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0)
     FROM mission_logs ml JOIN missions m ON m.id = ml.mission_id
     WHERE ml.child_id = p.id AND ml.status = 'approved')
    + (SELECT COALESCE(SUM(bonus_coins), 0) FROM streak_bonus_logs WHERE child_id = p.id)
    - (SELECT COALESCE(SUM(coin_cost), 0) FROM redemption_logs WHERE child_id = p.id AND status = 'delivered')
    - (SELECT COALESCE(SUM(coins_deducted), 0) FROM demerit_logs WHERE child_id = p.id)
  ) - p.kidcoins                                                    AS diferenca_a_compensar

FROM profiles p
WHERE p.display_name ILIKE '%rafael%'
LIMIT 1;

-- ─── ETAPA 2: APLICAR (descomente SOMENTE após confirmar diagnóstico) ────

/*
UPDATE profiles p
SET kidcoins = (
  (SELECT COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0)
   FROM mission_logs ml JOIN missions m ON m.id = ml.mission_id
   WHERE ml.child_id = p.id AND ml.status = 'approved')
  + (SELECT COALESCE(SUM(bonus_coins), 0) FROM streak_bonus_logs WHERE child_id = p.id)
  - (SELECT COALESCE(SUM(coin_cost), 0) FROM redemption_logs WHERE child_id = p.id AND status = 'delivered')
  - (SELECT COALESCE(SUM(coins_deducted), 0) FROM demerit_logs WHERE child_id = p.id)
)
WHERE display_name ILIKE '%rafael%';
*/

-- ─── ETAPA 3: VERIFICAÇÃO ────────────────────────────────────────────────
SELECT display_name, kidcoins, xp, streak
FROM profiles
WHERE display_name ILIKE '%rafael%';
