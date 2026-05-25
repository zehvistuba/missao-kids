-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: Bugs QA Ciclo 3
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-25
-- Corrige: BUG-12 streak_bonus_logs colunas, BUG-15 longest_streak,
--          BUG-16 last_active_date (base para reset de streak)
-- Rodar TUDO de uma vez
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: Preparar last_active_date em profiles — BUG-16
-- Necessário para o frontend calcular se o streak está ativo
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_date DATE;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: Corrigir constraint de streak_bonus_logs — BUG-12
-- A constraint antiga referenciava achievement_id (coluna inexistente)
-- A nova usa (child_id, streak_days) que é a chave natural correta
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.streak_bonus_logs
  DROP CONSTRAINT IF EXISTS streak_bonus_logs_child_achievement_unique;

ALTER TABLE public.streak_bonus_logs
  DROP CONSTRAINT IF EXISTS streak_bonus_logs_child_streak_unique;

ALTER TABLE public.streak_bonus_logs
  ADD CONSTRAINT streak_bonus_logs_child_streak_unique
  UNIQUE (child_id, streak_days);


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: check_and_grant_achievements — BUG-12
-- Usa colunas corretas da tabela streak_bonus_logs:
--   bonus_coins (não coins_awarded) e sem achievement_id
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_and_grant_achievements(p_child_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_missions INTEGER;
  v_xp             INTEGER;
  v_streak         INTEGER;
  v_family_id      UUID;
  v_ach            RECORD;
BEGIN
  SELECT
    COALESCE(xp, 0),
    COALESCE(streak, 0),
    family_id
  INTO v_xp, v_streak, v_family_id
  FROM profiles WHERE id = p_child_id;

  SELECT COUNT(*) INTO v_total_missions
  FROM mission_logs WHERE child_id = p_child_id AND status = 'approved';

  FOR v_ach IN SELECT * FROM achievements LOOP
    IF EXISTS (
      SELECT 1 FROM child_achievements
      WHERE child_id = p_child_id AND achievement_id = v_ach.id
    ) THEN
      CONTINUE;
    END IF;

    IF v_ach.condition_key = 'missions_total' AND v_total_missions >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

    ELSIF v_ach.condition_key = 'xp' AND v_xp >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

    ELSIF v_ach.condition_key = 'streak_days' AND v_streak >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

      IF COALESCE(v_ach.bonus_coins, 0) > 0 THEN
        UPDATE profiles SET kidcoins = kidcoins + v_ach.bonus_coins WHERE id = p_child_id;
        -- Usa colunas reais da tabela: bonus_coins (não coins_awarded), sem achievement_id
        INSERT INTO streak_bonus_logs
          (child_id, family_id, streak_days, bonus_coins)
        VALUES
          (p_child_id, v_family_id, v_ach.condition_val, v_ach.bonus_coins)
        ON CONFLICT (child_id, streak_days) DO NOTHING;
      END IF;

    ELSIF v_ach.condition_key = 'level_reached' AND v_xp >= (
      SELECT xp_min FROM (VALUES (1,0),(2,100),(3,300),(4,600),(5,1000),(6,1500)) AS lvls(lvl, xp_min)
      WHERE lvl = v_ach.condition_val LIMIT 1
    ) THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: parent_check_mission — BUG-15 + BUG-16
-- Adiciona: longest_streak atualizado + last_active_date gravado
-- ══════════════════════════════════════════════════════════════════════

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
  v_caller_family  UUID;
  v_child_family   UUID;
  v_coins          INT;
  v_xp             INT;
  v_frequency      TEXT;
  v_today          DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_cutoff         DATE;
  v_approved_today INT;
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

  -- Creditar XP e coins; gravar last_active_date para reset de streak no frontend
  UPDATE profiles
  SET xp             = xp + v_xp,
      kidcoins       = kidcoins + v_coins,
      last_active_date = v_today
  WHERE id = p_child_id;

  -- Streak: incrementa apenas na primeira missão aprovada do dia
  SELECT COUNT(*) INTO v_approved_today
  FROM mission_logs
  WHERE child_id = p_child_id AND status = 'approved' AND due_date = v_today;

  IF v_approved_today = 1 THEN
    UPDATE profiles
    SET streak = CASE
          WHEN EXISTS (
            SELECT 1 FROM mission_logs
            WHERE child_id = p_child_id AND status = 'approved' AND due_date = v_today - 1
          ) THEN streak + 1
          ELSE 1
        END
    WHERE id = p_child_id;

    -- BUG-15: atualizar longest_streak se o streak atual o superar
    UPDATE profiles
    SET longest_streak = GREATEST(COALESCE(longest_streak, 0), streak)
    WHERE id = p_child_id;
  END IF;

  PERFORM check_and_grant_achievements(p_child_id);
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════════
-- VERIFICAÇÕES FINAIS
-- ══════════════════════════════════════════════════════════════════════

-- 1. Confirmar coluna last_active_date em profiles
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_active_date';
-- Deve retornar 1 linha

-- 2. Confirmar constraint correta em streak_bonus_logs
SELECT conname FROM pg_constraint
WHERE conrelid = 'streak_bonus_logs'::regclass AND conname LIKE '%streak%';
-- Deve retornar: streak_bonus_logs_child_streak_unique

-- 3. Confirmar RPCs atualizadas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('check_and_grant_achievements', 'parent_check_mission')
ORDER BY routine_name;
-- Deve retornar 2 linhas
