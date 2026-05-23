-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — RPC submit_surprise_mission
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-23
-- Corrige BUG-01: RPC ausente causando 404 ao enviar Missão Surpresa
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: Adicionar coluna description à tabela missions (se não existe)
-- A Missão Surpresa tem uma descrição gerada pela IA que merece ser salva
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: Criar RPC submit_surprise_mission
-- Fluxo: filho PREMIUM gera missão via IA → clica "Enviar para aprovação"
-- → RPC cria uma missão temporária (is_active=false) + log pendente
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_surprise_mission(
  p_title       TEXT,
  p_emoji       TEXT,
  p_coins       INT,
  p_xp          INT,
  p_description TEXT DEFAULT NULL,
  p_due_date    DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child       profiles%ROWTYPE;
  v_family_plan TEXT;
  v_mission_id  UUID;
  v_log_id      UUID;
BEGIN
  -- Apenas crianças podem enviar
  SELECT * INTO v_child FROM profiles WHERE id = auth.uid() AND role = 'child';
  IF v_child.id IS NULL THEN
    RAISE EXCEPTION 'Apenas crianças podem enviar missões surpresa';
  END IF;

  -- Apenas Premium pode usar Missão Surpresa
  SELECT plan INTO v_family_plan FROM families WHERE id = v_child.family_id;
  IF v_family_plan <> 'premium' THEN
    RAISE EXCEPTION 'premium_required';
  END IF;

  -- Evitar duplicata: mesmo título no mesmo dia
  IF EXISTS (
    SELECT 1 FROM mission_logs ml
    JOIN missions m ON m.id = ml.mission_id
    WHERE ml.child_id  = v_child.id
      AND ml.due_date  = p_due_date
      AND ml.status    IN ('pending', 'approved')
      AND m.title      = p_title
  ) THEN
    RAISE EXCEPTION 'Missão surpresa já enviada hoje';
  END IF;

  -- Criar missão temporária (is_active=false → não aparece na lista regular do pai)
  INSERT INTO missions (family_id, title, emoji, frequency, coins_reward, xp_reward, is_active, description)
  VALUES (v_child.family_id, p_title, p_emoji, 'daily', p_coins, p_xp, false, p_description)
  RETURNING id INTO v_mission_id;

  -- Criar log pendente de aprovação
  INSERT INTO mission_logs (child_id, mission_id, family_id, due_date, status, review_note)
  VALUES (v_child.id, v_mission_id, v_child.family_id, p_due_date, 'pending', '✨ Missão Surpresa — aguardando aprovação')
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: Corrigir review_mission — coluna correta é review_note (não parent_note)
-- O Chrome Claude "corrigiu" para parent_note na sessão anterior — isso está ERRADO.
-- A coluna real em mission_logs é review_note (conforme esquema original).
-- ══════════════════════════════════════════════════════════════════════

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
  SELECT family_id INTO v_caller_fam
  FROM profiles
  WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller_fam IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT * INTO v_log FROM mission_logs WHERE id = p_log_id;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Log não encontrado';
  END IF;

  IF v_log.status <> 'pending' THEN
    RAISE EXCEPTION 'Log já foi revisado';
  END IF;

  SELECT family_id INTO v_child_fam
  FROM profiles WHERE id = v_log.child_id;

  IF v_child_fam IS NULL OR v_child_fam <> v_caller_fam THEN
    RAISE EXCEPTION 'Sem permissão para revisar esta missão';
  END IF;

  SELECT * INTO v_mission FROM missions WHERE id = v_log.mission_id;

  IF p_approve THEN
    UPDATE mission_logs
    SET status      = 'approved',
        reviewed_by = auth.uid(),
        review_note = COALESCE(p_note, 'Ótimo trabalho! 🎉'),
        reviewed_at = NOW()
    WHERE id = p_log_id;

    UPDATE profiles
    SET xp       = xp + COALESCE(v_log.xp_earned, v_mission.xp_reward, 0),
        kidcoins = kidcoins + COALESCE(v_log.coins_earned, v_mission.coins_reward, 0)
    WHERE id = v_log.child_id;

    -- Streak: usa due_date do log (data local Brasil) — não UTC do servidor
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

    PERFORM check_and_grant_achievements(v_log.child_id);

  ELSE
    UPDATE mission_logs
    SET status      = 'rejected',
        reviewed_by = auth.uid(),
        review_note = COALESCE(p_note, 'Tente novamente!'),
        reviewed_at = NOW()
    WHERE id = p_log_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO: confirmar que as RPCs existem
-- ══════════════════════════════════════════════════════════════════════

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('submit_surprise_mission', 'review_mission', 'parent_check_mission')
ORDER BY routine_name;
-- Deve retornar 3 linhas
