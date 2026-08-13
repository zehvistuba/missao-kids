-- RotinUp - hardening canonico do onboarding create_family.
-- Preparado em 2026-08-13; ainda nao aplicado em producao.
-- Mantem a assinatura publica e o contrato funcional ja provado via API.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_family(p_family_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_family_id UUID;
  v_code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  -- Serializa chamadas concorrentes do mesmo usuario para nao criar familias orfas.
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'Usuario nao encontrado'; END IF;
  IF v_caller.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Apenas responsaveis podem criar familia';
  END IF;
  IF v_caller.family_id IS NOT NULL THEN
    RAISE EXCEPTION 'Voce ja pertence a uma familia';
  END IF;
  IF length(trim(COALESCE(p_family_name, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Nome da familia deve ter entre 2 e 80 caracteres';
  END IF;

  -- A restricao UNIQUE de families.invite_code resolve colisoes sem janela TOCTOU.
  LOOP
    v_code := upper(substring(md5(random()::text) FROM 1 FOR 6));

    INSERT INTO public.families (
      name, plan, owner_id, max_co_parents, invite_code, invite_expires_at
    )
    VALUES (
      trim(p_family_name), 'free', auth.uid(), 1, v_code, now() + interval '72 hours'
    )
    ON CONFLICT (invite_code) DO NOTHING
    RETURNING id INTO v_family_id;

    EXIT WHEN v_family_id IS NOT NULL;
  END LOOP;

  UPDATE public.profiles
  SET family_id = v_family_id
  WHERE id = auth.uid() AND family_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nao foi possivel vincular a familia ao responsavel';
  END IF;

  RETURN v_family_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_family(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_family(TEXT) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  pg_get_function_identity_arguments(p.oid) = 'p_family_name text' AS assinatura_ok,
  p.prosecdef AS security_definer_ok,
  p.proconfig @> ARRAY['search_path=pg_catalog, public'] AS search_path_ok,
  NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_sem_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_com_execute,
  pg_get_functiondef(p.oid) ILIKE '%FOR UPDATE%' AS caller_lock_ok,
  pg_get_functiondef(p.oid) ILIKE '%ON CONFLICT (invite_code) DO NOTHING%' AS convite_atomico_ok
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_family';
