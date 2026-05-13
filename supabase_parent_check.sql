-- RPC: responsável marca missão como concluída diretamente para um filho
CREATE OR REPLACE FUNCTION parent_check_mission(p_child_id UUID, p_mission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_family UUID;
  v_child_family  UUID;
  v_coins         INT;
  v_xp            INT;
  v_frequency     TEXT;
  v_today         DATE := CURRENT_DATE;
  v_cutoff        DATE;
BEGIN
  -- Verificar que o chamador é responsável
  SELECT family_id INTO v_caller_family
    FROM profiles WHERE id = auth.uid() AND role = 'parent';
  IF v_caller_family IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Verificar que o filho pertence à mesma família
  SELECT family_id INTO v_child_family
    FROM profiles WHERE id = p_child_id AND role = 'child';
  IF v_child_family IS NULL OR v_child_family <> v_caller_family THEN
    RAISE EXCEPTION 'Filho não pertence à sua família';
  END IF;

  -- Obter recompensas e frequência da missão
  SELECT coins_reward, xp_reward, frequency
    INTO v_coins, v_xp, v_frequency
    FROM missions
   WHERE id = p_mission_id AND family_id = v_caller_family AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada ou inativa';
  END IF;

  -- Calcular janela de tempo pela frequência
  v_cutoff := CASE v_frequency
    WHEN 'weekly'   THEN v_today - 6
    WHEN 'biweekly' THEN v_today - 13
    WHEN 'monthly'  THEN v_today - 29
    ELSE v_today
  END;

  -- Verificar se já existe log no período
  IF EXISTS (
    SELECT 1 FROM mission_logs
     WHERE child_id = p_child_id
       AND mission_id = p_mission_id
       AND due_date >= v_cutoff
       AND status IN ('pending','approved')
  ) THEN
    RAISE EXCEPTION 'Missão já registrada neste período';
  END IF;

  -- Inserir log aprovado diretamente
  INSERT INTO mission_logs (child_id, mission_id, family_id, due_date, status, reviewed_by, review_note)
  VALUES (p_child_id, p_mission_id, v_caller_family, v_today, 'approved', auth.uid(), 'Marcado pelo responsável ✅');

  -- Creditar XP e KidCoins
  UPDATE profiles
     SET xp        = xp + v_xp,
         kidcoins  = kidcoins + v_coins
   WHERE id = p_child_id;

  -- Atualizar streak: se ontem também tinha log aprovado, incrementa; senão reseta para 1
  UPDATE profiles
     SET streak = CASE
           WHEN EXISTS (
             SELECT 1 FROM mission_logs
              WHERE child_id = p_child_id AND status = 'approved' AND due_date = v_today - 1
           ) THEN streak + 1
           ELSE 1
         END
   WHERE id = p_child_id;
END;
$$;
