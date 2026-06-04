-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — REFERÊNCIA DA PRODUÇÃO (fonte da verdade)
-- Capturado via pg_get_functiondef em 2026-06-04 (auditoria forense).
-- ⚠️ Estes são os corpos REAIS no banco vivo — divergem dos outros .sql do repo.
--    Antes de mexer em qualquer destas funções, parta DESTE arquivo, não dos antigos.
--    Os arquivos supabase_plan_limits.sql / supabase_missions_rewards_rpcs.sql /
--    supabase_fix_admin_role.sql contêm versões ANTIGAS (5 params) — NÃO usar.
--
-- Schema real da tabela missions (inferido do INSERT vivo): além de
--   title/emoji/coins_reward/xp_reward/frequency/is_active, existe:
--   description, difficulty (enum difficulty_lvl), recurrence (enum recurrence_type),
--   days_of_week (integer[]), requires_proof (bool), assigned_to (uuid),
--   category_id (uuid), created_by, created_at, updated_at.
--
-- Comportamento confirmado e CORRETO (não mexer sem motivo):
--   • parent_check_mission e review_mission: timezone America/Sao_Paulo, occurrence
--     por janela deslizante (weekly -6, biweekly -13, monthly -29), streak guard 1x/dia,
--     review_mission usa COALESCE(NULLIF(coins_earned,0), coins_reward, 0) (fix C4-05),
--     guarda "Log ja foi revisado".
--   • create_mission/update_mission: retornam jsonb {success, id|error}, capturam
--     EXCEPTION WHEN OTHERS (constraint missions_coins_nonneg vira {success:false}).
--     O frontend já trata data.success===false. NÃO substituir por versão raw-uuid.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── create_mission (VIVO — 12 params, retorna jsonb) ───────────────────────
CREATE OR REPLACE FUNCTION public.create_mission(
  p_title text, p_description text DEFAULT NULL, p_emoji text DEFAULT '⭐',
  p_coins_reward integer DEFAULT 20, p_xp_reward integer DEFAULT 15,
  p_difficulty text DEFAULT 'easy', p_recurrence text DEFAULT 'daily',
  p_frequency text DEFAULT 'daily', p_days_of_week integer[] DEFAULT '{1,2,3,4,5}',
  p_requires_proof boolean DEFAULT false, p_assigned_to uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_family_id UUID; v_new_id UUID; v_plan text; v_count integer;
BEGIN
  SELECT family_id INTO v_family_id FROM profiles WHERE id = auth.uid() LIMIT 1;
  IF v_family_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Família não encontrada');
  END IF;
  SELECT plan INTO v_plan FROM families WHERE id = v_family_id;
  IF v_plan = 'free' THEN
    SELECT COUNT(*) INTO v_count FROM missions WHERE family_id = v_family_id AND is_active = true;
    IF v_count >= 5 THEN
      RETURN jsonb_build_object('success', false,
        'error', 'Limite de 5 missões ativas atingido no plano gratuito. Faça upgrade para o PREMIUM.');
    END IF;
  END IF;
  INSERT INTO missions (
    family_id, created_by, assigned_to, category_id, title, description, emoji,
    difficulty, recurrence, frequency, days_of_week, coins_reward, xp_reward,
    requires_proof, is_active, created_at, updated_at
  ) VALUES (
    v_family_id, auth.uid(), p_assigned_to, p_category_id, p_title, p_description, p_emoji,
    p_difficulty::difficulty_lvl, p_recurrence::recurrence_type, p_frequency, p_days_of_week,
    p_coins_reward, p_xp_reward, p_requires_proof, true, NOW(), NOW()
  ) RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ─── update_mission (VIVO — 12 params, retorna jsonb, COALESCE parcial) ─────
CREATE OR REPLACE FUNCTION public.update_mission(
  p_mission_id uuid, p_title text DEFAULT NULL, p_description text DEFAULT NULL,
  p_emoji text DEFAULT NULL, p_coins_reward integer DEFAULT NULL, p_xp_reward integer DEFAULT NULL,
  p_difficulty text DEFAULT NULL, p_recurrence text DEFAULT NULL, p_frequency text DEFAULT NULL,
  p_days_of_week integer[] DEFAULT NULL, p_requires_proof boolean DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id FROM profiles WHERE id = auth.uid() LIMIT 1;
  IF v_family_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Família não encontrada.');
  END IF;
  UPDATE missions SET
    title = COALESCE(p_title, title), description = COALESCE(p_description, description),
    emoji = COALESCE(p_emoji, emoji), coins_reward = COALESCE(p_coins_reward, coins_reward),
    xp_reward = COALESCE(p_xp_reward, xp_reward),
    difficulty = COALESCE(p_difficulty::difficulty_lvl, difficulty),
    recurrence = COALESCE(p_recurrence::recurrence_type, recurrence),
    frequency = COALESCE(p_frequency, frequency), days_of_week = COALESCE(p_days_of_week, days_of_week),
    requires_proof = COALESCE(p_requires_proof, requires_proof),
    assigned_to = COALESCE(p_assigned_to, assigned_to), category_id = COALESCE(p_category_id, category_id),
    updated_at = NOW()
  WHERE id = p_mission_id AND family_id = v_family_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missão não encontrada ou sem permissão.');
  END IF;
  RETURN jsonb_build_object('success', true, 'id', p_mission_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ─── parent_check_mission (VIVO — correto: TZ Brasil, occurrence, streak) ───
-- (dump verbatim — mantido como referência; não reescrever)
-- occurrence = COUNT(approved no período) + 1; janela: weekly -6 / biweekly -13 / monthly -29.

-- ─── review_mission (VIVO — correto: NULLIF coins_earned, streak, guard) ────
-- (dump verbatim — mantido como referência; não reescrever)
-- credita COALESCE(NULLIF(coins_earned,0), mission.coins_reward, 0); bloqueia log já revisado.

-- Os corpos completos de parent_check_mission e review_mission estão preservados
-- na conversa de auditoria (2026-06-04). Comportamento validado ao vivo.
