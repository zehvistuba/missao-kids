-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: Streak incorreto (contador ≠ calendário)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Causa: review_mission não atualizava profiles.streak +
--        parent_check_mission usava CURRENT_DATE (UTC) em vez de horário Brasil
-- ═══════════════════════════════════════════════════════════════════════════
-- Execute BLOCO 1 → BLOCO 2 → BLOCO 3 na ordem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: Diagnóstico — ver estado atual do streak do Rafael
-- (substitua o email pelo email real do Rafael)
-- ══════════════════════════════════════════════════════════════════════

SELECT
  p.display_name,
  p.streak                              AS streak_salvo,
  COUNT(DISTINCT ml.due_date::date)     AS dias_com_missao_aprovada,
  MAX(ml.due_date::date)                AS ultimo_dia_aprovado,
  (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brasil,
  ARRAY_AGG(DISTINCT ml.due_date::date ORDER BY ml.due_date::date DESC) AS dias_aprovados
FROM profiles p
LEFT JOIN mission_logs ml ON ml.child_id = p.id AND ml.status = 'approved'
WHERE p.role = 'child'
GROUP BY p.id, p.display_name, p.streak
ORDER BY p.display_name;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: Recalcular streak de TODAS as crianças com base nos logs reais
-- Algoritmo: conta dias consecutivos indo para trás a partir do dia mais recente
-- ══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_child      RECORD;
  v_streak     INT;
  v_check_date DATE;
  v_found      BOOLEAN;
BEGIN
  FOR v_child IN
    SELECT id, display_name FROM profiles WHERE role = 'child'
  LOOP
    -- Pegar o dia mais recente com missão aprovada
    SELECT MAX(due_date::date) INTO v_check_date
    FROM mission_logs
    WHERE child_id = v_child.id AND status = 'approved';

    v_streak := 0;

    -- Contar dias consecutivos indo para trás
    LOOP
      EXIT WHEN v_check_date IS NULL;

      SELECT EXISTS (
        SELECT 1 FROM mission_logs
        WHERE child_id = v_child.id
          AND status = 'approved'
          AND due_date::date = v_check_date
      ) INTO v_found;

      EXIT WHEN NOT v_found;

      v_streak     := v_streak + 1;
      v_check_date := v_check_date - 1;
    END LOOP;

    UPDATE profiles SET streak = v_streak WHERE id = v_child.id;

    RAISE NOTICE 'Streak recalculado: % → %', v_child.display_name, v_streak;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: Corrigir RPCs para não deixar o streak ficar errado novamente
-- ══════════════════════════════════════════════════════════════════════

-- 3A: review_mission — fluxo filho-envia → pai-aprova
-- FIX: usa due_date do log (data local Brasil já setada pelo frontend)
--      para calcular continuidade do streak, não CURRENT_DATE (UTC)
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
  v_log         mission_logs%ROWTYPE;
  v_mission     missions%ROWTYPE;
  v_caller_fam  UUID;
  v_child_fam   UUID;
BEGIN
  -- Verificar que o chamador é responsável ou admin
  SELECT family_id INTO v_caller_fam
  FROM profiles
  WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller_fam IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Carregar o log
  SELECT * INTO v_log FROM mission_logs WHERE id = p_log_id;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Log não encontrado';
  END IF;

  IF v_log.status <> 'pending' THEN
    RAISE EXCEPTION 'Log já foi revisado';
  END IF;

  -- Verificar que o filho pertence à família do responsável
  SELECT family_id INTO v_child_fam
  FROM profiles WHERE id = v_log.child_id;

  IF v_child_fam IS NULL OR v_child_fam <> v_caller_fam THEN
    RAISE EXCEPTION 'Sem permissão para revisar esta missão';
  END IF;

  -- Carregar missão para obter coins e xp
  SELECT * INTO v_mission FROM missions WHERE id = v_log.mission_id;

  IF p_approve THEN
    -- Aprovar: atualizar status
    UPDATE mission_logs
    SET status      = 'approved',
        reviewed_by = auth.uid(),
        review_note = COALESCE(p_note, 'Ótimo trabalho! 🎉'),
        reviewed_at = NOW()
    WHERE id = p_log_id;

    -- Creditar XP e KidCoins
    UPDATE profiles
    SET xp       = xp + COALESCE(v_log.xp_earned, v_mission.xp_reward, 0),
        kidcoins = kidcoins + COALESCE(v_log.coins_earned, v_mission.coins_reward, 0)
    WHERE id = v_log.child_id;

    -- Atualizar streak usando due_date do log (data local Brasil — não UTC do servidor)
    -- Se o dia anterior ao due_date do log também teve missão aprovada → streak + 1
    -- Caso contrário → começa nova sequência em 1
    UPDATE profiles
    SET streak = CASE
          WHEN EXISTS (
            SELECT 1 FROM mission_logs
            WHERE child_id  = v_log.child_id
              AND status    = 'approved'
              AND due_date::date = v_log.due_date::date - 1
          ) THEN streak + 1
          ELSE 1
        END
    WHERE id = v_log.child_id;

    -- Verificar conquistas
    PERFORM check_and_grant_achievements(v_log.child_id);

  ELSE
    -- Rejeitar: apenas atualizar status
    UPDATE mission_logs
    SET status      = 'rejected',
        reviewed_by = auth.uid(),
        review_note = COALESCE(p_note, 'Tente novamente!'),
        reviewed_at = NOW()
    WHERE id = p_log_id;
  END IF;
END;
$$;

-- 3B: parent_check_mission — fluxo pai marca diretamente
-- FIX: usa horário de Brasília em vez de CURRENT_DATE (UTC)
--      evita bug às 22h-23h59 BRT onde servidor já está no "amanhã"
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
    (child_id, mission_id, family_id, due_date, status, reviewed_by, review_note)
  VALUES
    (p_child_id, p_mission_id, v_caller_family, v_today, 'approved', auth.uid(), 'Marcado pelo responsável ✅');

  UPDATE profiles
  SET xp       = xp + v_xp,
      kidcoins = kidcoins + v_coins
  WHERE id = p_child_id;

  -- Streak: usa v_today (já em horário Brasil) — não haverá mais mismatch de fuso
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

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: Verificar resultado final
-- ══════════════════════════════════════════════════════════════════════

SELECT
  p.display_name,
  p.streak                          AS streak_corrigido,
  COUNT(DISTINCT ml.due_date::date) AS dias_aprovados_banco,
  MAX(ml.due_date::date)            AS ultimo_dia
FROM profiles p
LEFT JOIN mission_logs ml ON ml.child_id = p.id AND ml.status = 'approved'
WHERE p.role = 'child'
GROUP BY p.id, p.display_name, p.streak
ORDER BY p.display_name;

-- Streak corrigido deve bater com dias consecutivos mais recentes de cada criança.

NOTIFY pgrst, 'reload schema';
