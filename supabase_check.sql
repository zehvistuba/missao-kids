-- ─── Check geral: editar e excluir filhos, editar responsável ───

-- 1. Adiciona coluna birth_date na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE DEFAULT NULL;

-- 2. Recria add_child aceitando birth_date
CREATE OR REPLACE FUNCTION add_child(
  p_display_name TEXT,
  p_age          INTEGER DEFAULT NULL,
  p_avatar_emoji TEXT    DEFAULT '👦',
  p_birth_date   DATE    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_child_id  UUID := gen_random_uuid();
  v_age       INTEGER;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role = 'parent';

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;

  v_age := CASE
    WHEN p_birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(p_birth_date))::INTEGER
    ELSE p_age
  END;

  INSERT INTO profiles (id, family_id, role, display_name, age, birth_date, avatar_emoji, xp, kidcoins, streak)
  VALUES (v_child_id, v_family_id, 'child', p_display_name, v_age, p_birth_date, p_avatar_emoji, 0, 0, 0);

  RETURN v_child_id;
END;
$$;

-- 3. Atualizar dados de uma criança
CREATE OR REPLACE FUNCTION update_child(
  p_child_id     UUID,
  p_display_name TEXT DEFAULT NULL,
  p_birth_date   DATE DEFAULT NULL,
  p_avatar_emoji TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role = 'parent';

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_child_id AND family_id = v_family_id AND role = 'child'
  ) THEN
    RAISE EXCEPTION 'Criança não encontrada ou sem permissão';
  END IF;

  UPDATE profiles SET
    display_name = COALESCE(p_display_name, display_name),
    birth_date   = COALESCE(p_birth_date, birth_date),
    age          = CASE
                     WHEN p_birth_date IS NOT NULL
                     THEN EXTRACT(YEAR FROM AGE(p_birth_date))::INTEGER
                     ELSE age
                   END,
    avatar_emoji = COALESCE(p_avatar_emoji, avatar_emoji)
  WHERE id = p_child_id;
END;
$$;

-- 4. Excluir uma criança
CREATE OR REPLACE FUNCTION delete_child(p_child_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role = 'parent';

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_child_id AND family_id = v_family_id AND role = 'child'
  ) THEN
    RAISE EXCEPTION 'Criança não encontrada ou sem permissão';
  END IF;

  DELETE FROM mission_logs      WHERE child_id = p_child_id;
  DELETE FROM child_achievements WHERE child_id = p_child_id;
  DELETE FROM profiles           WHERE id = p_child_id;
END;
$$;

-- 5. Atualizar nome do responsável logado
CREATE OR REPLACE FUNCTION update_display_name(p_display_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(trim(p_display_name)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;
  UPDATE profiles SET display_name = trim(p_display_name) WHERE id = auth.uid();
END;
$$;
