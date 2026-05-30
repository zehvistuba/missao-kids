-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: compensação histórica de coins do Rafael
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-28
-- Contexto:
--   Bug BUG-C4-05: review_mission usava COALESCE(coins_earned=0, coins_reward)
--   → creditava 0 coins. Fix + compensação retroativa (+596) aplicados em Mai/2026.
--   RLS faltando em mission_logs impedia diagnóstico correto até hoje.
--   Este script calcula o saldo correto e aplica a diferença residual.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. DIAGNÓSTICO — ver o gap antes de aplicar
WITH rafael AS (
  SELECT id, display_name, kidcoins
  FROM profiles
  WHERE display_name ILIKE '%rafael%'
  LIMIT 1
),
ganhos AS (
  SELECT
    COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0) AS missoes,
    COALESCE((
      SELECT SUM(bonus_coins)
      FROM streak_bonus_logs sbl
      WHERE sbl.child_id = (SELECT id FROM rafael)
    ), 0) AS streak
  FROM mission_logs ml
  JOIN missions m ON m.id = ml.mission_id
  WHERE ml.child_id = (SELECT id FROM rafael)
    AND ml.status = 'approved'
),
gastos AS (
  SELECT
    COALESCE(SUM(CASE WHEN rl.status = 'delivered' THEN rl.coin_cost ELSE 0 END), 0) AS resgates,
    COALESCE(SUM(dl.coins_deducted), 0) AS tropecos
  FROM rafael r
  LEFT JOIN redemption_logs rl ON rl.child_id = r.id
  LEFT JOIN demerit_logs dl ON dl.child_id = r.id
)
SELECT
  r.display_name,
  r.kidcoins                              AS saldo_atual,
  g.missoes + g.streak                    AS total_ganhos,
  gs.resgates + gs.tropecos              AS total_gastos,
  (g.missoes + g.streak) - (gs.resgates + gs.tropecos)  AS saldo_calculado,
  ((g.missoes + g.streak) - (gs.resgates + gs.tropecos)) - r.kidcoins AS diferenca_a_compensar
FROM rafael r, ganhos g, gastos gs;

-- ─────────────────────────────────────────────────────────
-- 2. APLICAR COMPENSAÇÃO
-- Execute a linha abaixo SOMENTE após confirmar a diferença acima.
-- Substitui o saldo por: ganhos - gastos (calculado acima)
-- ─────────────────────────────────────────────────────────

/*
WITH rafael AS (
  SELECT id FROM profiles WHERE display_name ILIKE '%rafael%' LIMIT 1
),
ganhos AS (
  SELECT
    COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0) +
    COALESCE((SELECT SUM(bonus_coins) FROM streak_bonus_logs WHERE child_id = (SELECT id FROM rafael)), 0)
    AS total
  FROM mission_logs ml
  JOIN missions m ON m.id = ml.mission_id
  WHERE ml.child_id = (SELECT id FROM rafael) AND ml.status = 'approved'
),
gastos AS (
  SELECT
    COALESCE(SUM(CASE WHEN rl.status = 'delivered' THEN rl.coin_cost ELSE 0 END), 0) +
    COALESCE((SELECT SUM(coins_deducted) FROM demerit_logs WHERE child_id = (SELECT id FROM rafael)), 0)
    AS total
  FROM redemption_logs rl WHERE rl.child_id = (SELECT id FROM rafael)
)
UPDATE profiles
SET kidcoins = (SELECT total FROM ganhos) - (SELECT total FROM gastos)
WHERE id = (SELECT id FROM rafael);
*/

-- 3. VERIFICAÇÃO
SELECT display_name, kidcoins, xp, streak
FROM profiles
WHERE display_name ILIKE '%rafael%';
