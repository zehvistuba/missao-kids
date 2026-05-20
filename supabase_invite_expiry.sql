-- RotinUp: Expiração de código de convite (anti-pirataria)
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-19
-- ATENÇÃO: Executar DEPOIS de supabase_recovery_and_limits.sql

-- ── 1. Adiciona coluna de expiração em families ──────────────────────────────
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ DEFAULT NULL;

-- ── 2. generate_invite_code — código expira em 72 horas ─────────────────────
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
  v_code      TEXT;
  v_exists    BOOLEAN;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;

  LOOP
    v_code := upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM families WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  -- Código válido por 72 horas
  UPDATE families
  SET invite_code       = v_code,
      invite_expires_at = now() + INTERVAL '72 hours'
  WHERE id = v_family_id;

  RETURN v_code;
END;
$$;

-- ── 3. get_invite_code — retorna código e validade ───────────────────────────
CREATE OR REPLACE FUNCTION get_invite_code()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id  UUID;
  v_code       TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN RETURN NULL; END IF;

  SELECT invite_code, invite_expires_at
  INTO v_code, v_expires_at
  FROM families WHERE id = v_family_id;

  IF v_code IS NULL THEN RETURN NULL; END IF;

  -- Se expirado, limpa automaticamente
  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    UPDATE families SET invite_code = NULL, invite_expires_at = NULL WHERE id = v_family_id;
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'code',       v_code,
    'expires_at', v_expires_at
  );
END;
$$;

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
