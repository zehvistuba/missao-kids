-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix P0: create_family (onboarding) quebrado por gen_random_bytes
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- Causa raiz: a função existia (cache do PostgREST estava velho — resolvido por
-- NOTIFY), mas o CORPO gerava invite_code com gen_random_bytes() (pgcrypto), que
-- não está disponível neste banco/search_path → erro 42883 → onboarding travado.
-- Fix: gera o código com md5(random()) (built-in, sem extensão). Mantém checagens
-- (responsável, já-tem-família, nome curto), grava owner_id, invite_code,
-- invite_expires_at e max_co_parents=1 (free = só o criador).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_family(p_family_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller profiles%ROWTYPE;
  v_fam_id UUID;
  v_code   TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'Usuario nao encontrado'; END IF;
  IF v_caller.role NOT IN ('parent','admin') THEN RAISE EXCEPTION 'Apenas responsaveis podem criar familia'; END IF;
  IF v_caller.family_id IS NOT NULL THEN RAISE EXCEPTION 'Voce ja pertence a uma familia'; END IF;
  IF p_family_name IS NULL OR length(trim(p_family_name)) < 2 THEN RAISE EXCEPTION 'Nome muito curto'; END IF;

  -- código de convite único, SEM gen_random_bytes (usa md5 built-in)
  LOOP
    v_code := upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS (SELECT 1 FROM families WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  INSERT INTO families (name, plan, owner_id, max_co_parents, invite_code, invite_expires_at)
  VALUES (trim(p_family_name), 'free', auth.uid(), 1, v_code, now() + interval '72 hours')
  RETURNING id INTO v_fam_id;

  UPDATE profiles SET family_id = v_fam_id WHERE id = auth.uid();
  RETURN v_fam_id;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname, pg_get_function_identity_arguments(oid) AS args, prorettype::regtype AS returns, prosecdef AS sec_def,
  pg_get_functiondef(oid) ILIKE '%md5(random%'     AS usa_md5,
  pg_get_functiondef(oid) NOT ILIKE '%gen_random_bytes%' AS sem_genrandombytes,
  pg_get_functiondef(oid) ILIKE '%owner_id%'        AS grava_owner,
  pg_get_functiondef(oid) ILIKE '%max_co_parents%'  AS seta_limite,
  pg_get_functiondef(oid) ILIKE '%role NOT IN%'     AS bloqueia_child
FROM pg_proc WHERE proname = 'create_family';
