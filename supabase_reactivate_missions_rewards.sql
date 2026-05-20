-- RotinUp: Reativar missões e recompensas desativadas
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20

CREATE OR REPLACE FUNCTION public.reactivate_mission(p_mission_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Apenas responsáveis podem reativar missões';
  END IF;

  UPDATE missions
  SET is_active = true
  WHERE id = p_mission_id AND family_id = v_caller.family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada ou sem permissão';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_reward(p_reward_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Apenas responsáveis podem reativar recompensas';
  END IF;

  UPDATE rewards
  SET is_active = true
  WHERE id = p_reward_id AND family_id = v_caller.family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou sem permissão';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
