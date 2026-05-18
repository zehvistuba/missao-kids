-- RotinUp: RPCs para criar/editar missões e recompensas (bypass RLS)
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- ── 1. Criar missão ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_mission(
  p_title        TEXT,
  p_emoji        TEXT    DEFAULT '⭐',
  p_coins_reward INTEGER DEFAULT 20,
  p_xp_reward    INTEGER DEFAULT 15,
  p_frequency    TEXT    DEFAULT 'daily'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
  v_id        UUID := gen_random_uuid();
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF length(trim(p_title)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;

  INSERT INTO missions (id, family_id, created_by, title, emoji, coins_reward, xp_reward, frequency, is_active)
  VALUES (v_id, v_family_id, auth.uid(), trim(p_title), p_emoji, p_coins_reward, p_xp_reward, p_frequency, true);

  RETURN v_id;
END;
$$;

-- ── 2. Editar missão ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_mission(
  p_mission_id   UUID,
  p_title        TEXT,
  p_emoji        TEXT,
  p_coins_reward INTEGER,
  p_xp_reward    INTEGER,
  p_frequency    TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE missions SET
    title        = trim(p_title),
    emoji        = p_emoji,
    coins_reward = p_coins_reward,
    xp_reward    = p_xp_reward,
    frequency    = p_frequency
  WHERE id = p_mission_id AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada';
  END IF;
END;
$$;

-- ── 3. Desativar missão ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_mission(p_mission_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE missions SET is_active = false
  WHERE id = p_mission_id AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada';
  END IF;
END;
$$;

-- ── 4. Criar recompensa ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_reward(
  p_title     TEXT,
  p_emoji     TEXT    DEFAULT '🎁',
  p_coin_cost INTEGER DEFAULT 50
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
  v_id        UUID := gen_random_uuid();
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF length(trim(p_title)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;

  IF p_coin_cost <= 0 THEN
    RAISE EXCEPTION 'Custo deve ser maior que zero';
  END IF;

  INSERT INTO rewards (id, family_id, created_by, title, emoji, coin_cost, is_active)
  VALUES (v_id, v_family_id, auth.uid(), trim(p_title), p_emoji, p_coin_cost, true);

  RETURN v_id;
END;
$$;

-- ── 5. Editar recompensa ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_reward(
  p_reward_id UUID,
  p_title     TEXT,
  p_emoji     TEXT,
  p_coin_cost INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE rewards SET
    title     = trim(p_title),
    emoji     = p_emoji,
    coin_cost = p_coin_cost
  WHERE id = p_reward_id AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recompensa não encontrada';
  END IF;
END;
$$;

-- ── 6. Desativar recompensa ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_reward(p_reward_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE rewards SET is_active = false
  WHERE id = p_reward_id AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recompensa não encontrada';
  END IF;
END;
$$;
