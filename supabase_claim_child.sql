-- ─── RPC: criança reivindica perfil órfão criado pelo responsável ───────────
-- Quando criança entra via código de convite mas o responsável já criou
-- um perfil para ela no onboarding, esta função funde os dois perfis.

CREATE OR REPLACE FUNCTION claim_child_profile(p_orphan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id    UUID := auth.uid();
  v_family_id UUID;
  v_orphan   profiles%ROWTYPE;
BEGIN
  -- Família do usuário atual
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = v_my_id;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  -- Busca o perfil órfão
  SELECT * INTO v_orphan FROM profiles
  WHERE id = p_orphan_id AND role = 'child' AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado ou sem permissão';
  END IF;

  -- Transfere dados do órfão para o perfil autenticado
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

  -- Redireciona histórico de missões
  UPDATE mission_logs SET child_id = v_my_id WHERE child_id = p_orphan_id;

  -- Redireciona conquistas
  UPDATE child_achievements SET child_id = v_my_id
  WHERE child_id = p_orphan_id
    AND NOT EXISTS (
      SELECT 1 FROM child_achievements
      WHERE child_id = v_my_id AND achievement_id = child_achievements.achievement_id
    );

  -- Remove o perfil órfão
  DELETE FROM profiles WHERE id = p_orphan_id;
END;
$$;
