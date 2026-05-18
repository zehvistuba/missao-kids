-- RotinUp: Desativação de missões e recompensas via RPC (contorna RLS)
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- RPC: desativa missão (verifica que pertence à família do caller)
CREATE OR REPLACE FUNCTION public.deactivate_mission(p_mission_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM public.profiles
  WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.missions
  SET is_active = false
  WHERE id = p_mission_id AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada';
  END IF;
END;
$$;

-- RPC: desativa recompensa (verifica que pertence à família do caller)
CREATE OR REPLACE FUNCTION public.deactivate_reward(p_reward_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM public.profiles
  WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.rewards
  SET is_active = false
  WHERE id = p_reward_id AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recompensa não encontrada';
  END IF;
END;
$$;
