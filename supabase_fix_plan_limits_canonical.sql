-- RotinUp - contrato canonico de limites Free/Premium.
-- Data: 2026-08-12
-- FREE: 1 filho, 1 responsavel, 5 missoes e 3 recompensas ativas.
-- PREMIUM: 10 filhos, 10 responsaveis, missoes/recompensas ilimitadas.
--
-- Aplicar somente depois de conferir as assinaturas vivas. O script nao remove
-- filhos/responsaveis existentes; apenas impede novas inclusoes acima do limite.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_child(
  p_display_name TEXT,
  p_age INTEGER DEFAULT NULL,
  p_avatar_emoji TEXT DEFAULT '👦',
  p_birth_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_family public.families%ROWTYPE;
  v_child_id UUID := gen_random_uuid();
  v_child_count INT;
  v_max_children INT;
  v_age INT;
BEGIN
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller.id IS NULL OR v_caller.family_id IS NULL THEN
    RAISE EXCEPTION 'Familia nao encontrada. Crie uma familia primeiro.';
  END IF;
  IF length(trim(COALESCE(p_display_name, ''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Nome da crianca deve ter entre 1 e 80 caracteres';
  END IF;
  IF p_birth_date IS NOT NULL AND p_birth_date >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Data de nascimento invalida';
  END IF;
  IF p_age IS NOT NULL AND p_age NOT BETWEEN 0 AND 17 THEN
    RAISE EXCEPTION 'Idade invalida';
  END IF;

  -- Trava a familia para duas inclusoes simultaneas nao furarem o limite.
  SELECT * INTO v_family
  FROM public.families
  WHERE id = v_caller.family_id
  FOR UPDATE;

  IF v_family.id IS NULL THEN RAISE EXCEPTION 'Familia nao encontrada'; END IF;
  v_max_children := CASE WHEN v_family.plan = 'premium' THEN 10 ELSE 1 END;

  SELECT count(*) INTO v_child_count
  FROM public.profiles
  WHERE family_id = v_caller.family_id AND role = 'child';

  IF v_child_count >= v_max_children THEN
    IF v_family.plan = 'free' THEN
      RAISE EXCEPTION 'Plano gratuito permite apenas 1 filho. Faca upgrade para Premium!';
    END IF;
    RAISE EXCEPTION 'Plano Premium permite ate 10 filhos';
  END IF;

  v_age := CASE
    WHEN p_birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(p_birth_date))::INT
    ELSE p_age
  END;
  IF v_age IS NULL OR v_age NOT BETWEEN 0 AND 17 THEN
    RAISE EXCEPTION 'A crianca deve ter entre 0 e 17 anos';
  END IF;

  INSERT INTO public.profiles (
    id, family_id, role, display_name, age, birth_date, avatar_emoji,
    xp, kidcoins, streak
  ) VALUES (
    v_child_id, v_caller.family_id, 'child', trim(p_display_name), v_age,
    p_birth_date, COALESCE(NULLIF(trim(p_avatar_emoji), ''), '👦'), 0, 0, 0
  );

  RETURN v_child_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_child(TEXT, INTEGER, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_child(TEXT, INTEGER, TEXT, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_family_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family_id UUID;
  v_family_name TEXT;
  v_max_co_parents INT;
  v_parent_count INT;
  v_my_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF NULLIF(trim(p_code), '') IS NULL THEN RAISE EXCEPTION 'Codigo de convite invalido'; END IF;

  SELECT id, name, COALESCE(max_co_parents, CASE WHEN plan = 'premium' THEN 10 ELSE 1 END)
  INTO v_family_id, v_family_name, v_max_co_parents
  FROM public.families
  WHERE invite_code = upper(trim(p_code))
    AND (invite_expires_at IS NULL OR invite_expires_at > now())
  FOR UPDATE;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Codigo de convite invalido ou expirado';
  END IF;

  SELECT role::text INTO v_my_role
  FROM public.profiles
  WHERE id = auth.uid() AND family_id IS NULL;

  IF v_my_role IS NULL THEN
    RAISE EXCEPTION 'Usuario nao encontrado ou ja pertence a uma familia';
  END IF;
  IF v_my_role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Convite disponivel apenas para responsaveis';
  END IF;

  SELECT count(*) INTO v_parent_count
  FROM public.profiles
  WHERE family_id = v_family_id AND role IN ('parent', 'admin');
  IF v_parent_count >= v_max_co_parents THEN
    RAISE EXCEPTION 'Limite de responsaveis atingido para esta familia';
  END IF;

  UPDATE public.profiles
  SET family_id = v_family_id
  WHERE id = auth.uid() AND family_id IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Nao foi possivel entrar na familia'; END IF;
  RETURN jsonb_build_object('family_id', v_family_id, 'family_name', v_family_name);
END;
$$;

REVOKE ALL ON FUNCTION public.join_family_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_family_by_code(TEXT) TO authenticated;

UPDATE public.families
SET max_co_parents = CASE WHEN plan = 'premium' THEN 10 ELSE 1 END
WHERE max_co_parents IS DISTINCT FROM CASE WHEN plan = 'premium' THEN 10 ELSE 1 END;

ALTER TABLE public.families ALTER COLUMN max_co_parents SET DEFAULT 1;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  pg_get_functiondef('public.add_child(text,integer,text,date)'::regprocedure) ILIKE '%THEN 10 ELSE 1%' AS add_child_limite_ok,
  pg_get_functiondef('public.add_child(text,integer,text,date)'::regprocedure) ILIKE '%FOR UPDATE%' AS add_child_lock_ok,
  pg_get_functiondef('public.join_family_by_code(text)'::regprocedure) ILIKE '%invite_expires_at > now()%' AS convite_expira_ok,
  pg_get_functiondef('public.join_family_by_code(text)'::regprocedure) ILIKE '%FOR UPDATE%' AS convite_lock_ok;
