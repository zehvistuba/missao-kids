-- ─── Fix: remove overloads antigos de add_child e recria versão única ────────
-- O problema: supabase_add_child.sql e supabase_check.sql criaram duas versões
-- com assinaturas diferentes. PostgREST não consegue resolver qual usar.

-- 1. Remove TODAS as versões sobrecarregadas de add_child
DROP FUNCTION IF EXISTS public.add_child(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_child(TEXT, INTEGER, TEXT, DATE);
DROP FUNCTION IF EXISTS public.add_child(TEXT, TEXT, DATE);

-- 2. Recria com assinatura única e clara
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
    RAISE EXCEPTION 'Família não encontrada. Crie uma família primeiro.';
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

-- 3. Recarregar cache do PostgREST (necessário após mudança de assinatura)
NOTIFY pgrst, 'reload schema';
