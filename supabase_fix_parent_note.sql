-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: parent_check_mission usa coluna parent_note (não review_note)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-24
-- Contexto: Chrome Claude descobriu que a coluna de nota do responsável em
--           mission_logs é parent_note, não review_note.
--           parent_check_mission estava inserindo na coluna errada.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.parent_check_mission(
  p_child_id   UUID,
  p_mission_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_family UUID;
  v_child_family  UUID;
  v_coins         INT;
  v_xp            INT;
  v_frequency     TEXT;
  v_today         DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_cutoff        DATE;
BEGIN
  SELECT family_id INTO v_caller_family
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller_family IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT family_id INTO v_child_family
  FROM profiles WHERE id = p_child_id AND role = 'child';

  IF v_child_family IS NULL OR v_child_family <> v_caller_family THEN
    RAISE EXCEPTION 'Filho não pertence à sua família';
  END IF;

  SELECT coins_reward, xp_reward, frequency
  INTO v_coins, v_xp, v_frequency
  FROM missions
  WHERE id = p_mission_id AND family_id = v_caller_family AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada ou inativa';
  END IF;

  v_cutoff := CASE v_frequency
    WHEN 'weekly'   THEN v_today - 6
    WHEN 'biweekly' THEN v_today - 13
    WHEN 'monthly'  THEN v_today - 29
    ELSE v_today
  END;

  IF EXISTS (
    SELECT 1 FROM mission_logs
    WHERE child_id   = p_child_id
      AND mission_id = p_mission_id
      AND due_date   >= v_cutoff
      AND status     IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'Missão já registrada neste período';
  END IF;

  INSERT INTO mission_logs
    (child_id, mission_id, family_id, due_date, status, reviewed_by, parent_note)
  VALUES
    (p_child_id, p_mission_id, v_caller_family, v_today, 'approved', auth.uid(), 'Marcado pelo responsável ✅');

  UPDATE profiles
  SET xp       = xp + v_xp,
      kidcoins = kidcoins + v_coins
  WHERE id = p_child_id;

  -- Streak: usa v_today (horário Brasil) — sem mismatch de fuso
  UPDATE profiles
  SET streak = CASE
        WHEN EXISTS (
          SELECT 1 FROM mission_logs
          WHERE child_id = p_child_id AND status = 'approved' AND due_date::date = v_today - 1
        ) THEN streak + 1
        ELSE 1
      END
  WHERE id = p_child_id;

  PERFORM check_and_grant_achievements(p_child_id);
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Verificar:
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'parent_check_mission';
