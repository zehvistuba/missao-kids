-- ─── Trigger: desbloquear conquistas automaticamente ───────
-- Dispara após aprovação de missão e concede conquistas elegíveis

CREATE OR REPLACE FUNCTION check_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id      UUID;
  v_total_missions INTEGER;
  v_total_xp      INTEGER;
  v_streak        INTEGER;
  v_total_coins   INTEGER;
  v_ach           RECORD;
BEGIN
  -- Só processa quando o status muda para 'approved'
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  v_child_id := NEW.child_id;

  -- Estatísticas atuais do perfil
  SELECT
    COALESCE(xp, 0),
    COALESCE(kidcoins, 0),
    COALESCE(streak, 0)
  INTO v_total_xp, v_total_coins, v_streak
  FROM profiles WHERE id = v_child_id;

  -- Total de missões aprovadas
  SELECT COUNT(*) INTO v_total_missions
  FROM mission_logs WHERE child_id = v_child_id AND status = 'approved';

  -- Verifica cada conquista
  FOR v_ach IN SELECT * FROM achievements LOOP
    -- Pula se já desbloqueada
    IF EXISTS (
      SELECT 1 FROM child_achievements
      WHERE child_id = v_child_id AND achievement_id = v_ach.id
    ) THEN
      CONTINUE;
    END IF;

    -- Confere condição
    IF    v_ach.condition_type = 'missions_completed' AND v_total_missions >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (v_child_id, v_ach.id);
    ELSIF v_ach.condition_type = 'xp_total'           AND v_total_xp       >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (v_child_id, v_ach.id);
    ELSIF v_ach.condition_type = 'streak_days'        AND v_streak          >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (v_child_id, v_ach.id);
    ELSIF v_ach.condition_type = 'kidcoins_earned'    AND v_total_coins      >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (v_child_id, v_ach.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_achievements ON mission_logs;

CREATE TRIGGER trigger_check_achievements
AFTER UPDATE ON mission_logs
FOR EACH ROW
EXECUTE FUNCTION check_achievements();
