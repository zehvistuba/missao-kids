-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: review_mission completo
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-27
-- Problemas corrigidos:
--   BUG-N2: longest_streak nunca atualizado no fluxo filho-submete→pai-aprova
--   BUG-N3: last_active_date nunca atualizado neste fluxo
--   EXTRA:  streak_guard 1x/dia aplicado (igual ao parent_check_mission)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.review_mission(
  p_log_id  UUID,
  p_approve BOOLEAN,
  p_note    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log          mission_logs%ROWTYPE;
  v_mission      missions%ROWTYPE;
  v_caller_fam   UUID;
  v_child_fam    UUID;
  v_due_date     DATE;
  v_approved_on_date INT;
BEGIN
  SELECT family_id INTO v_caller_fam
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');
  IF v_caller_fam IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;

  SELECT * INTO v_log FROM mission_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Log não encontrado'; END IF;
  IF v_log.status <> 'pending' THEN RAISE EXCEPTION 'Log já foi revisado'; END IF;

  SELECT family_id INTO v_child_fam FROM profiles WHERE id = v_log.child_id;
  IF v_child_fam IS NULL OR v_child_fam <> v_caller_fam THEN
    RAISE EXCEPTION 'Sem permissão para revisar esta missão';
  END IF;

  SELECT * INTO v_mission FROM missions WHERE id = v_log.mission_id;

  v_due_date := v_log.due_date::DATE;

  IF p_approve THEN
    UPDATE mission_logs
    SET status      = 'approved',
        reviewed_by = auth.uid(),
        parent_note = COALESCE(p_note, 'Ótimo trabalho! 🎉'),
        reviewed_at = NOW()
    WHERE id = p_log_id;

    -- Creditar XP e KidCoins + atualizar last_active_date
    UPDATE profiles
    SET xp             = xp + COALESCE(v_log.xp_earned, v_mission.xp_reward, 0),
        kidcoins       = kidcoins + COALESCE(v_log.coins_earned, v_mission.coins_reward, 0),
        last_active_date = v_due_date
    WHERE id = v_log.child_id;

    -- Streak: incrementa só na 1ª aprovação deste due_date
    SELECT COUNT(*) INTO v_approved_on_date
    FROM mission_logs
    WHERE child_id = v_log.child_id AND status = 'approved' AND due_date::date = v_due_date;

    IF v_approved_on_date = 1 THEN
      UPDATE profiles
      SET streak = CASE
            WHEN EXISTS (
              SELECT 1 FROM mission_logs
              WHERE child_id = v_log.child_id AND status = 'approved' AND due_date::date = v_due_date - 1
            ) THEN streak + 1
            ELSE 1
          END
      WHERE id = v_log.child_id;

      -- BUG-N2: longest_streak atualizado
      UPDATE profiles
      SET longest_streak = GREATEST(COALESCE(longest_streak, 0), streak)
      WHERE id = v_log.child_id;
    END IF;

    PERFORM check_and_grant_achievements(v_log.child_id);

  ELSE
    UPDATE mission_logs
    SET status      = 'rejected',
        reviewed_by = auth.uid(),
        parent_note = COALESCE(p_note, 'Tente novamente!'),
        reviewed_at = NOW()
    WHERE id = p_log_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Verificação
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'review_mission';
-- Deve retornar 1 linha com a função atualizada
