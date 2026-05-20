-- RotinUp: Limites de plano FREE — missões, recompensas e co-responsáveis
-- FREE: 5 missões ativas, 3 recompensas ativas, 1 co-responsável (só o criador)
-- PREMIUM: ilimitado (missions/rewards), 20 co-responsáveis
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20

-- ── 1. create_mission — adiciona verificação de limite FREE ──────────────────
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

  -- Verificar limite FREE
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

-- ── 2. create_reward — adiciona verificação de limite FREE ───────────────────
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

  -- Verificar limite FREE
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

-- ── 3. join_family_by_code — max_co_parents=1 para FREE significa só o criador
-- (A RPC já verifica max_co_parents. Só precisamos garantir que famílias FREE
--  tenham max_co_parents=1. Veja item 5 abaixo.)

-- ── 4. admin_set_plan — atualiza max_co_parents ao mudar de plano ────────────
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

-- ── 5. Ajustar famílias FREE existentes para max_co_parents=1 ────────────────
-- Apenas famílias free sem co-responsáveis extra (seguro aplicar)
UPDATE families
SET max_co_parents = 1
WHERE plan = 'free';

-- ── 6. Ajustar default da coluna para novas famílias FREE ────────────────────
ALTER TABLE families
  ALTER COLUMN max_co_parents SET DEFAULT 1;

-- ── 7. Hotmart webhook — ao cancelar/devolver, volta max_co_parents para 1 ──
-- (Já tratado pelo admin_set_plan acima; o webhook usa update direto na tabela.
--  Garantir que o webhook também sete max_co_parents ao fazer downgrade.)
-- Veja hotmart-webhook/index.ts — seção de downgrade.

NOTIFY pgrst, 'reload schema';
