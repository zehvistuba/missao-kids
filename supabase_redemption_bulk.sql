-- RotinUp: Resgate em quantidade — substitui loop no frontend
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20

CREATE OR REPLACE FUNCTION public.request_redemption_bulk(
  p_reward_id UUID,
  p_quantity  INT DEFAULT 1
)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child    public.profiles%ROWTYPE;
  v_reward   public.rewards%ROWTYPE;
  v_total    INT;
  v_log_ids  UUID[] := '{}';
  v_log_id   UUID;
  i          INT;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Quantidade inválida (1-20)';
  END IF;

  SELECT * INTO v_child FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards
  WHERE id = p_reward_id
    AND is_active = true
    AND family_id = v_child.family_id;

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou inativa';
  END IF;

  v_total := v_reward.coin_cost * p_quantity;

  IF COALESCE(v_child.kidcoins, 0) < v_total THEN
    RAISE EXCEPTION 'KidCoins insuficientes (precisa de % 🪙)', v_total;
  END IF;

  -- Debitar tudo de uma vez
  UPDATE public.profiles
  SET kidcoins = kidcoins - v_total
  WHERE id = auth.uid();

  -- Inserir N logs em loop dentro da transação
  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.redemption_logs
      (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
    VALUES
      (auth.uid(), v_child.family_id, p_reward_id,
       v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
    RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;

  RETURN v_log_ids;
END;
$$;

NOTIFY pgrst, 'reload schema';
