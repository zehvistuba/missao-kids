-- RotinUp: Fluxo de aprovação de resgates pelo responsável
-- Executar no SQL Editor do Supabase: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- 1. Tabela de logs de resgate
CREATE TABLE IF NOT EXISTS public.redemption_logs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id    UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  reward_id    UUID REFERENCES public.rewards(id) ON DELETE SET NULL,
  reward_title TEXT NOT NULL,
  reward_emoji TEXT NOT NULL DEFAULT '🎁',
  coin_cost    INT NOT NULL,
  child_name   TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'delivered')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE public.redemption_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_redemptions_select" ON public.redemption_logs;
CREATE POLICY "family_redemptions_select" ON public.redemption_logs
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "child_insert_redemption" ON public.redemption_logs;
CREATE POLICY "child_insert_redemption" ON public.redemption_logs
  FOR INSERT WITH CHECK (child_id = auth.uid());

DROP POLICY IF EXISTS "parent_update_redemption" ON public.redemption_logs;
CREATE POLICY "parent_update_redemption" ON public.redemption_logs
  FOR UPDATE USING (
    family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())
  );

-- 2. RPC: criança solicita resgate — debita coins e cria log pendente
CREATE OR REPLACE FUNCTION public.request_redemption(p_reward_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_child     public.profiles%ROWTYPE;
  v_reward    public.rewards%ROWTYPE;
  v_log_id    UUID;
BEGIN
  SELECT * INTO v_child  FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards  WHERE id = p_reward_id AND is_active = true;

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou inativa';
  END IF;

  IF COALESCE(v_child.kidcoins, 0) < v_reward.coin_cost THEN
    RAISE EXCEPTION 'KidCoins insuficientes';
  END IF;

  -- Debita coins imediatamente
  UPDATE public.profiles
  SET kidcoins = kidcoins - v_reward.coin_cost
  WHERE id = auth.uid();

  -- Registra o resgate como pendente de entrega
  INSERT INTO public.redemption_logs
    (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
  VALUES
    (auth.uid(), v_child.family_id, p_reward_id,
     v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- 3. RPC: responsável confirma entrega
CREATE OR REPLACE FUNCTION public.confirm_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.redemption_logs
  SET status = 'delivered', delivered_at = now()
  WHERE id = p_log_id
    AND family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resgate não encontrado ou sem permissão';
  END IF;
END;
$$;
