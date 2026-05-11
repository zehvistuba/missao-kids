-- ─── Criar função add_child ──────────────────────────────────
-- Passo 1: Remove o FK de profiles.id → auth.users (se existir)
-- Isso é necessário para criar perfis de filhos sem conta de login
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Passo 2: Cria a função add_child
CREATE OR REPLACE FUNCTION add_child(
  p_display_name TEXT,
  p_age          INTEGER DEFAULT NULL,
  p_avatar_emoji TEXT    DEFAULT '👦'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_child_id  UUID := gen_random_uuid();
BEGIN
  -- Pega a família do responsável logado
  SELECT family_id INTO v_family_id
  FROM profiles
  WHERE id = auth.uid() AND role = 'parent';

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada. Crie uma família primeiro.';
  END IF;

  -- Insere o perfil do filho (sem conta de login)
  INSERT INTO profiles (id, family_id, role, display_name, age, avatar_emoji, xp, kidcoins, streak)
  VALUES (v_child_id, v_family_id, 'child', p_display_name, p_age, p_avatar_emoji, 0, 0, 0);

  RETURN v_child_id;
END;
$$;
