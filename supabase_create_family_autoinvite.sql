-- RotinUp: create_family — auto-gera código de convite na criação
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20

CREATE OR REPLACE FUNCTION public.create_family(p_family_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller  profiles%ROWTYPE;
  v_fam_id  UUID;
  v_code    TEXT;
  v_exists  BOOLEAN;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF v_caller.family_id IS NOT NULL THEN
    RAISE EXCEPTION 'Você já pertence a uma família';
  END IF;

  IF length(trim(p_family_name)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;

  -- Gerar código único de convite
  LOOP
    v_code := upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM families WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  INSERT INTO families (name, plan, owner_id, invite_code, invite_expires_at)
  VALUES (trim(p_family_name), 'free', auth.uid(), v_code, now() + INTERVAL '72 hours')
  RETURNING id INTO v_fam_id;

  UPDATE profiles SET family_id = v_fam_id WHERE id = auth.uid();

  RETURN v_fam_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
