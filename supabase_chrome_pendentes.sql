-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Scripts pendentes para rodar no SQL Editor do Supabase
-- HISTORICO - NAO REAPLICAR: patch de QA com limite Premium antigo de 20.
-- Fonte vigente: supabase_fix_plan_limits_canonical.sql.
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20
-- Rodar NESTA ORDEM (copiar e executar bloco a bloco, ou tudo de uma vez)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── SCRIPT 1: submit_mission com fix de fuso UTC vs Brasil ──────────────────
-- (versiona localmente a RPC + documenta o fix de due_date)

CREATE OR REPLACE FUNCTION public.submit_mission(
  p_mission_id UUID,
  p_due_date   DATE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   profiles%ROWTYPE;
  v_mission  missions%ROWTYPE;
  v_log_id   UUID;
  v_existing UUID;
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

  -- Evitar duplicata para a mesma due_date
  SELECT id INTO v_existing FROM mission_logs
  WHERE mission_id = p_mission_id
    AND child_id   = auth.uid()
    AND due_date   = p_due_date
    AND status IN ('pending', 'approved');

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Missão já enviada para esta data';
  END IF;

  INSERT INTO mission_logs (mission_id, child_id, family_id, due_date, status)
  VALUES (p_mission_id, auth.uid(), v_caller.family_id, p_due_date, 'pending')
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ── SCRIPT 2: Limites FREE — 5 missões, 3 recompensas, 1 co-responsável ────

-- 2a. create_mission com verificação de limite FREE
CREATE OR REPLACE FUNCTION public.create_mission(
  p_title        TEXT,
  p_emoji        TEXT    DEFAULT '⭐',
  p_coins_reward INTEGER DEFAULT 20,
  p_xp_reward    INTEGER DEFAULT 15,
  p_frequency    TEXT    DEFAULT 'daily'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id   UUID;
  v_plan        TEXT;
  v_count       INT;
  v_id          UUID := gen_random_uuid();
BEGIN
  SELECT p.family_id, f.plan
  INTO v_family_id, v_plan
  FROM profiles p
  JOIN families f ON f.id = p.family_id
  WHERE p.id = auth.uid() AND p.role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF length(trim(p_title)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;

  IF v_plan = 'free' THEN
    SELECT COUNT(*) INTO v_count
    FROM missions
    WHERE family_id = v_family_id AND is_active = true;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Limite de 5 missões ativas no plano gratuito. Faça upgrade para o Premium e crie missões ilimitadas! 🚀';
    END IF;
  END IF;

  INSERT INTO missions (id, family_id, created_by, title, emoji, coins_reward, xp_reward, frequency, is_active)
  VALUES (v_id, v_family_id, auth.uid(), trim(p_title), p_emoji, p_coins_reward, p_xp_reward, p_frequency, true);

  RETURN v_id;
END;
$$;

-- 2b. create_reward com verificação de limite FREE
CREATE OR REPLACE FUNCTION public.create_reward(
  p_title     TEXT,
  p_emoji     TEXT    DEFAULT '🎁',
  p_coin_cost INTEGER DEFAULT 50
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
  v_plan      TEXT;
  v_count     INT;
  v_id        UUID := gen_random_uuid();
BEGIN
  SELECT p.family_id, f.plan
  INTO v_family_id, v_plan
  FROM profiles p
  JOIN families f ON f.id = p.family_id
  WHERE p.id = auth.uid() AND p.role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF length(trim(p_title)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;

  IF p_coin_cost <= 0 THEN
    RAISE EXCEPTION 'Custo deve ser maior que zero';
  END IF;

  IF v_plan = 'free' THEN
    SELECT COUNT(*) INTO v_count
    FROM rewards
    WHERE family_id = v_family_id AND is_active = true;

    IF v_count >= 3 THEN
      RAISE EXCEPTION 'Limite de 3 recompensas ativas no plano gratuito. Faça upgrade para o Premium e crie recompensas ilimitadas! 🎁';
    END IF;
  END IF;

  INSERT INTO rewards (id, family_id, created_by, title, emoji, coin_cost, is_active)
  VALUES (v_id, v_family_id, auth.uid(), trim(p_title), p_emoji, p_coin_cost, true);

  RETURN v_id;
END;
$$;

-- 2c. admin_set_plan atualiza max_co_parents ao mudar plano
CREATE OR REPLACE FUNCTION public.admin_set_plan(
  p_family_id UUID,
  p_plan      TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_plan NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido';
  END IF;

  UPDATE families
  SET plan = p_plan,
      max_co_parents = CASE WHEN p_plan = 'premium' THEN 20 ELSE 1 END
  WHERE id = p_family_id;
END;
$$;

-- 2d. Ajustar famílias FREE existentes para max_co_parents=1
UPDATE families SET max_co_parents = 1 WHERE plan = 'free';

-- 2e. Default da coluna para novas famílias FREE
ALTER TABLE families ALTER COLUMN max_co_parents SET DEFAULT 1;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL (opcional — rode para confirmar)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('submit_mission','create_mission','create_reward','admin_set_plan');
-- -- Deve retornar 4 linhas

-- SELECT COUNT(*) FROM families WHERE plan = 'free' AND max_co_parents != 1;
-- -- Deve retornar 0
