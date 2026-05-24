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
  INSERT INTO mission_logs (child_id, mission_id, family_id, due_date, status)
  VALUES (v_child.id, v_mission_id, v_child.family_id, p_due_date, 'pending')
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- NOTA: review_mission NÃO está neste arquivo.
-- A versão em produção (deployada pelo Chrome Claude em 23/05/2026) usa parent_note
-- e insere em coin_transactions — é mais completa. Não sobrescrever daqui.

-- ══════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO: confirmar que submit_surprise_mission existe
-- ══════════════════════════════════════════════════════════════════════

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'submit_surprise_mission';
-- Deve retornar 1 linha
