-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Resgatar recompensa EM NOME DO FILHO (criança sem celular)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-19
-- O responsável escolhe uma recompensa e resgata para o filho. Debita os KidCoins
-- do FILHO e cria o resgate já como 'approved' (responsável é quem pede+aprova) —
-- aparece em "🎁 Aguardando entrega" pra ele dar o "Entreguei".
-- 100% ADITIVO: só adiciona 1 função nova. Não altera nada existente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.redeem_for_child(p_child_id UUID, p_reward_id UUID, p_quantity INT DEFAULT 1)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller profiles%ROWTYPE; v_child profiles%ROWTYPE; v_reward rewards%ROWTYPE; v_total INT;
  v_log_ids UUID[] := '{}'; v_log_id UUID; i INT;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'Quantidade inválida (1-20)'; END IF;

  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.role NOT IN ('parent','admin') THEN
    RAISE EXCEPTION 'Apenas responsáveis podem resgatar pelo filho';
  END IF;

  -- o filho precisa ser da mesma família e ser criança
  SELECT * INTO v_child FROM profiles
   WHERE id = p_child_id AND family_id = v_caller.family_id AND role = 'child';
  IF v_child.id IS NULL THEN RAISE EXCEPTION 'Filho não encontrado na sua família'; END IF;

  SELECT * INTO v_reward FROM rewards
   WHERE id = p_reward_id AND is_active = true AND family_id = v_caller.family_id;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'Recompensa não encontrada ou inativa'; END IF;

  v_total := v_reward.coin_cost * p_quantity;

  -- debita os coins do FILHO de forma atômica (anti-saldo-negativo)
  UPDATE profiles SET kidcoins = kidcoins - v_total
   WHERE id = p_child_id AND COALESCE(kidcoins, 0) >= v_total;
  IF NOT FOUND THEN RAISE EXCEPTION 'KidCoins insuficientes (precisa de % 🪙)', v_total; END IF;

  FOR i IN 1..p_quantity LOOP
    INSERT INTO redemption_logs
      (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name, status, duration_minutes)
    VALUES
      (p_child_id, v_caller.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost,
       v_child.display_name, 'approved', v_reward.duration_minutes)
    RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;

  RETURN v_log_ids;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc WHERE proname = 'redeem_for_child';
