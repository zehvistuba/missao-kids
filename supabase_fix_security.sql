-- RotinUp: Correções de segurança críticas
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-19

-- ── 1. apply_demerit — somente responsável/admin pode aplicar ────────────────
CREATE OR REPLACE FUNCTION public.apply_demerit(
  p_child_id UUID,
  p_title    TEXT,
  p_emoji    TEXT DEFAULT '⚠️',
  p_coins    INT  DEFAULT 0
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_child  public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_child  FROM public.profiles WHERE id = p_child_id;

  -- Somente responsável ou admin pode aplicar tropeço
  IF v_caller.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Apenas responsáveis podem aplicar tropeços';
  END IF;

  IF v_caller.family_id IS DISTINCT FROM v_child.family_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_coins < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  UPDATE public.profiles
  SET kidcoins = GREATEST(0, COALESCE(kidcoins, 0) - p_coins)
  WHERE id = p_child_id;

  INSERT INTO public.demerit_logs (child_id, family_id, title, emoji, coins_deducted, created_by)
  VALUES (p_child_id, v_child.family_id, p_title, p_emoji, p_coins, auth.uid());
END;
$$;

-- ── 2. confirm_redemption — somente responsável/admin confirma entrega ────────
CREATE OR REPLACE FUNCTION public.confirm_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();

  IF v_caller.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Apenas responsáveis podem confirmar resgates';
  END IF;

  UPDATE public.redemption_logs
  SET status = 'delivered', delivered_at = now()
  WHERE id = p_log_id
    AND family_id = v_caller.family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resgate não encontrado ou sem permissão';
  END IF;
END;
$$;

-- ── 3. cancel_redemption — responsável cancela qualquer resgate;
--       criança só pode cancelar o PRÓPRIO resgate pendente ───────────────────
CREATE OR REPLACE FUNCTION public.cancel_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_log    public.redemption_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_log
  FROM public.redemption_logs
  WHERE id = p_log_id
    AND family_id = v_caller.family_id;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou sem permissão';
  END IF;

  -- Criança só pode cancelar o próprio resgate
  IF v_caller.role = 'child' AND v_log.child_id <> auth.uid() THEN
    RAISE EXCEPTION 'Você só pode cancelar seus próprios resgates';
  END IF;

  IF v_log.status <> 'pending' THEN
    RAISE EXCEPTION 'Só é possível cancelar solicitações pendentes';
  END IF;

  UPDATE public.redemption_logs
  SET status = 'cancelled'
  WHERE id = p_log_id;

  UPDATE public.profiles
  SET kidcoins = kidcoins + v_log.coin_cost
  WHERE id = v_log.child_id;
END;
$$;

-- ── 4. request_redemption — garante que recompensa pertence à família ─────────
CREATE OR REPLACE FUNCTION public.request_redemption(p_reward_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_child     public.profiles%ROWTYPE;
  v_reward    public.rewards%ROWTYPE;
  v_log_id    UUID;
BEGIN
  SELECT * INTO v_child  FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards
   WHERE id = p_reward_id
     AND is_active = true
     AND family_id = v_child.family_id;  -- NOVO: garante mesma família

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou inativa';
  END IF;

  IF COALESCE(v_child.kidcoins, 0) < v_reward.coin_cost THEN
    RAISE EXCEPTION 'KidCoins insuficientes';
  END IF;

  UPDATE public.profiles
  SET kidcoins = kidcoins - v_reward.coin_cost
  WHERE id = auth.uid();

  INSERT INTO public.redemption_logs
    (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
  VALUES
    (auth.uid(), v_child.family_id, p_reward_id,
     v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ── 5. admin_get_families — usa role='admin' em vez de email hardcoded ────────
CREATE OR REPLACE FUNCTION public.admin_get_families()
RETURNS TABLE (
  family_id    UUID,
  family_name  TEXT,
  plan         TEXT,
  parent_name  TEXT,
  parent_email TEXT,
  child_count  BIGINT,
  created_at   TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.plan,
    MIN(p.display_name),
    MIN(u.email),
    COUNT(DISTINCT c.id),
    f.created_at
  FROM public.families f
  LEFT JOIN public.profiles p ON p.family_id = f.id AND p.role IN ('parent', 'admin')
  LEFT JOIN auth.users u       ON u.id = p.id
  LEFT JOIN public.profiles c ON c.family_id = f.id AND c.role = 'child'
  GROUP BY f.id, f.name, f.plan, f.created_at
  ORDER BY f.created_at DESC;
END;
$$;

-- ── 6. claim_child_profile — somente crianças podem reivindicar ──────────────
CREATE OR REPLACE FUNCTION claim_child_profile(p_orphan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id     UUID := auth.uid();
  v_caller    profiles%ROWTYPE;
  v_family_id UUID;
  v_orphan    profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = v_my_id;

  -- Somente crianças podem reivindicar um perfil órfão
  IF v_caller.role <> 'child' THEN
    RAISE EXCEPTION 'Apenas crianças podem reivindicar perfis';
  END IF;

  v_family_id := v_caller.family_id;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  SELECT * INTO v_orphan FROM profiles
  WHERE id = p_orphan_id AND role = 'child' AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado ou sem permissão';
  END IF;

  UPDATE profiles SET
    display_name   = v_orphan.display_name,
    avatar_emoji   = COALESCE(v_orphan.avatar_emoji, avatar_emoji),
    birth_date     = COALESCE(v_orphan.birth_date, birth_date),
    age            = COALESCE(v_orphan.age, age),
    xp             = xp + v_orphan.xp,
    kidcoins       = kidcoins + v_orphan.kidcoins,
    streak         = GREATEST(streak, v_orphan.streak),
    longest_streak = GREATEST(longest_streak, v_orphan.longest_streak)
  WHERE id = v_my_id;

  UPDATE mission_logs SET child_id = v_my_id WHERE child_id = p_orphan_id;

  UPDATE child_achievements SET child_id = v_my_id
  WHERE child_id = p_orphan_id
    AND NOT EXISTS (
      SELECT 1 FROM child_achievements
      WHERE child_id = v_my_id AND achievement_id = child_achievements.achievement_id
    );

  DELETE FROM profiles WHERE id = p_orphan_id;
END;
$$;
