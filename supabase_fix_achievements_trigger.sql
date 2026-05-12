-- ─── Fix: trigger conquistas usava condition_type, coluna real é condition_key ─

CREATE OR REPLACE FUNCTION check_and_grant_achievements(p_child_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_missions INTEGER;
  v_xp             INTEGER;
  v_streak         INTEGER;
  v_ach            RECORD;
BEGIN
  -- Estatísticas atuais do filho
  SELECT
    COALESCE(xp, 0),
    COALESCE(streak, 0)
  INTO v_xp, v_streak
  FROM profiles WHERE id = p_child_id;

  -- Total de missões aprovadas
  SELECT COUNT(*) INTO v_total_missions
  FROM mission_logs WHERE child_id = p_child_id AND status = 'approved';

  -- Para cada conquista, verificar se o filho é elegível
  FOR v_ach IN SELECT * FROM achievements LOOP
    -- Pula se já desbloqueada
    IF EXISTS (
      SELECT 1 FROM child_achievements
      WHERE child_id = p_child_id AND achievement_id = v_ach.id
    ) THEN
      CONTINUE;
    END IF;

    -- condition_key é o nome real da coluna na tabela achievements
    IF    v_ach.condition_key = 'missions_total'  AND v_total_missions >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    ELSIF v_ach.condition_key = 'xp'              AND v_xp             >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    ELSIF v_ach.condition_key = 'streak_days'     AND v_streak          >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    ELSIF v_ach.condition_key = 'level_reached'   AND v_xp              >= (
      SELECT xp_min FROM (VALUES (1,0),(2,100),(3,300),(4,600),(5,1000),(6,1500)) AS lvls(lvl, xp_min)
      WHERE lvl = v_ach.condition_val LIMIT 1
    ) THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Recria a função de trigger (chama a helper acima)
CREATE OR REPLACE FUNCTION trigger_check_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dispara ao aprovar missão
  IF TG_TABLE_NAME = 'mission_logs' THEN
    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM check_and_grant_achievements(NEW.child_id);
    END IF;
  END IF;

  -- Dispara ao atualizar XP ou streak no perfil
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.xp IS DISTINCT FROM OLD.xp OR NEW.streak IS DISTINCT FROM OLD.streak THEN
      PERFORM check_and_grant_achievements(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recriar os triggers (DROP + CREATE para garantir ligação com a função nova)
DROP TRIGGER IF EXISTS trg_achievements_on_mission  ON mission_logs;
DROP TRIGGER IF EXISTS trg_achievements_on_profile  ON profiles;

CREATE TRIGGER trg_achievements_on_mission
AFTER INSERT OR UPDATE ON mission_logs
FOR EACH ROW EXECUTE FUNCTION trigger_check_achievements();

CREATE TRIGGER trg_achievements_on_profile
AFTER UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION trigger_check_achievements();
