-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: review_mission credita coins/XP corretos (BUG-C4-05)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-28
-- Problema:
--   coins_earned e xp_earned nos mission_logs são sempre 0 (integer, não NULL).
--   COALESCE(0, coins_reward) retorna 0 em vez de coins_reward.
--   Filho aprovado via review_mission não recebia moedas nem XP.
-- Solução: usar NULLIF para converter 0 → NULL antes do COALESCE.
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

    -- Creditar XP e KidCoins
    -- NULLIF(col, 0) converte 0 → NULL para que COALESCE alcance o fallback
    UPDATE profiles
    SET xp             = xp + COALESCE(NULLIF(v_log.xp_earned, 0), v_mission.xp_reward, 0),
        kidcoins       = kidcoins + COALESCE(NULLIF(v_log.coins_earned, 0), v_mission.coins_reward, 0),
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

-- Verificação: função atualizada
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'review_mission';
-- Esperado: 1 linha
