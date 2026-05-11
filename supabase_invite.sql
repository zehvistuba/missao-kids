-- ─── Co-responsável: código de convite ──────────────────────

ALTER TABLE families ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE DEFAULT NULL;

-- Gera (ou regenera) o código de convite da família do usuário logado
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role = 'parent';

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;

  LOOP
    v_code := upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM families WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  UPDATE families SET invite_code = v_code WHERE id = v_family_id;
  RETURN v_code;
END;
$$;

-- Retorna o código de convite atual da família
CREATE OR REPLACE FUNCTION get_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_code TEXT;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role = 'parent';

  IF v_family_id IS NULL THEN RETURN NULL; END IF;

  SELECT invite_code INTO v_code FROM families WHERE id = v_family_id;
  RETURN v_code;
END;
$$;

-- Entra em uma família pelo código de convite
CREATE OR REPLACE FUNCTION join_family_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_family_name TEXT;
BEGIN
  SELECT id, name INTO v_family_id, v_family_name
  FROM families WHERE invite_code = upper(trim(p_code));

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Código inválido ou expirado';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Você já pertence a uma família';
  END IF;

  UPDATE profiles SET family_id = v_family_id WHERE id = auth.uid();

  RETURN jsonb_build_object('family_id', v_family_id, 'family_name', v_family_name);
END;
$$;
