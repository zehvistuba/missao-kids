-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Feature: Repetição de missão no mesmo período
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-26
-- Permite que filho submeta e pai aprove a mesma missão N vezes no período.
-- Cada ocorrência extra fica marcada com occurrence > 1 e aparece no card
-- do pai com badge "🔁 2ª vez hoje / na semana".
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: Adicionar coluna occurrence em mission_logs
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.mission_logs
  ADD COLUMN IF NOT EXISTS occurrence INT NOT NULL DEFAULT 1;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: submit_mission — permite repetição com occurrence correto
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_mission(
  p_mission_id UUID,
  p_due_date   DATE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    profiles%ROWTYPE;
  v_mission   missions%ROWTYPE;
  v_log_id    UUID;
  v_cutoff    DATE;
  v_count     INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid() AND role = 'child';
  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Apenas crianças podem enviar missões';
  END IF;

  SELECT * INTO v_mission FROM missions
  WHERE id = p_mission_id
    AND family_id = v_caller.family_id
    AND is_active = true;
  IF v_mission.id IS NULL THEN
    RAISE EXCEPTION 'Missão não encontrada ou inativa';
  END IF;

  -- Calcular janela do período baseada na frequência da missão
  v_cutoff := CASE v_mission.frequency
    WHEN 'weekly'   THEN p_due_date - 6
    WHEN 'biweekly' THEN p_due_date - 13
    WHEN 'monthly'  THEN p_due_date - 29
    ELSE p_due_date
  END;

  -- Bloquear se já há um pendente neste período (aguardar aprovação antes de re-enviar)
  IF EXISTS (
    SELECT 1 FROM mission_logs
    WHERE mission_id = p_mission_id
      AND child_id   = auth.uid()
      AND due_date  >= v_cutoff
      AND status     = 'pending'
  ) THEN
    RAISE EXCEPTION 'Já tem uma submissão aguardando aprovação para esta missão';
  END IF;

  -- Contar aprovações no período para definir qual ocorrência esta é
  SELECT COUNT(*) INTO v_count FROM mission_logs
  WHERE mission_id = p_mission_id
    AND child_id   = auth.uid()
    AND due_date  >= v_cutoff
    AND status     = 'approved';

  INSERT INTO mission_logs (mission_id, child_id, family_id, due_date, status, occurrence)
  VALUES (p_mission_id, auth.uid(), v_caller.family_id, p_due_date, 'pending', v_count + 1)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: parent_check_mission — permite repetição, atualiza occurrence
-- Mantém: streak só sobe 1x/dia, longest_streak, last_active_date
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
  v_count_period   INT;
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

  -- Contar aprovações no período para definir occurrence
  SELECT COUNT(*) INTO v_count_period FROM mission_logs
  WHERE child_id   = p_child_id
    AND mission_id = p_mission_id
    AND due_date  >= v_cutoff
    AND status     = 'approved';

  INSERT INTO mission_logs
    (child_id, mission_id, family_id, due_date, status, reviewed_by, parent_note, occurrence)
  VALUES
    (p_child_id, p_mission_id, v_caller_family, v_today, 'approved', auth.uid(),
     'Marcado pelo responsável ✅', v_count_period + 1);

  UPDATE profiles
  SET xp             = xp + v_xp,
      kidcoins       = kidcoins + v_coins,
      last_active_date = v_today
  WHERE id = p_child_id;

  -- Streak: incrementa só na primeira aprovação do dia (independe de occurrence)
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

    UPDATE profiles
    SET longest_streak = GREATEST(COALESCE(longest_streak, 0), streak)
    WHERE id = p_child_id;
  END IF;

  PERFORM check_and_grant_achievements(p_child_id);
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: pending_approvals — inclui occurrence e frequency para badge
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW pending_approvals AS
SELECT
  ml.id               AS log_id,
  ml.photo_url,
  ml.occurrence,
  m.title             AS mission_title,
  m.emoji             AS mission_emoji,
  m.frequency         AS mission_frequency,
  m.coins_reward,
  m.xp_reward,
  p.display_name      AS child_name,
  p.avatar_emoji      AS child_avatar,
  p.id                AS child_id,
  ml.submitted_at
FROM mission_logs ml
JOIN missions m ON m.id = ml.mission_id
JOIN profiles p ON p.id = ml.child_id
JOIN profiles parent ON parent.family_id = p.family_id AND parent.role IN ('parent', 'admin')
WHERE ml.status = 'pending'
  AND parent.id = auth.uid();

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════════
-- VERIFICAÇÕES FINAIS
-- ══════════════════════════════════════════════════════════════════════

-- 1. Confirmar coluna occurrence em mission_logs
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mission_logs' AND column_name = 'occurrence';
-- Deve retornar 1 linha: occurrence | integer | 1

-- 2. Confirmar RPCs atualizadas
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('submit_mission', 'parent_check_mission')
ORDER BY routine_name;
-- Deve retornar 2 linhas

-- 3. Confirmar view atualizada com occurrence
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pending_approvals'
ORDER BY ordinal_position;
-- Deve conter: occurrence, mission_frequency
