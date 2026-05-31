-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Compensação final Rafael (+387 coins históricos)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-28  ✅ APLICAR
-- Diagnóstico confirmado:
--   saldo_atual=12 | saldo_calculado=399 | diferenca=+387
--   Causa: missões aprovadas via review_mission antes do fix BUG-C4-05
--   não creditavam coins. Compensação retroativa anterior (+596) não cobriu tudo.
-- ═══════════════════════════════════════════════════════════════════════════

-- APLICAR compensação
UPDATE profiles
SET kidcoins = (
  (SELECT COALESCE(SUM(GREATEST(m.coins_reward, 0)), 0)
   FROM mission_logs ml JOIN missions m ON m.id = ml.mission_id
   WHERE ml.child_id = profiles.id AND ml.status = 'approved')
  + (SELECT COALESCE(SUM(bonus_coins), 0)
     FROM streak_bonus_logs WHERE child_id = profiles.id)
  - (SELECT COALESCE(SUM(coin_cost), 0)
     FROM redemption_logs WHERE child_id = profiles.id AND status = 'delivered')
  - (SELECT COALESCE(SUM(coins_deducted), 0)
     FROM demerit_logs WHERE child_id = profiles.id)
)
WHERE display_name ILIKE '%rafael%';

-- Verificação
SELECT display_name, kidcoins, xp, streak
FROM profiles
WHERE display_name ILIKE '%rafael%';
-- Esperado: kidcoins = 399
