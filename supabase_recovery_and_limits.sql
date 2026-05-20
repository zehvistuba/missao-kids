-- RotinUp: Recuperação de família + limites de plano no backend
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-19

-- ── 1. Adiciona owner_id na tabela families ──────────────────────────────────
--    owner_id = quem criou a família; permite recuperação mesmo sem invite code
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- Backfill: associa famílias existentes ao primeiro responsável/admin encontrado
UPDATE public.families f
SET owner_id = (
  SELECT p.id FROM public.profiles p
  WHERE p.family_id = f.id
    AND p.role IN ('parent', 'admin')
  ORDER BY p.id
  LIMIT 1
)
WHERE f.owner_id IS NULL;

-- ── 2. Adiciona coluna max_co_parents em families ────────────────────────────
--    FREE = 2 (o dono + 1 co-responsável)
--    PREMIUM = 20 (na prática ilimitado)
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS max_co_parents INT NOT NULL DEFAULT 2;

-- Famílias premium já existentes recebem limite 20
UPDATE public.families SET max_co_parents = 20 WHERE plan = 'premium';

-- ── 3. Atualiza create_family para gravar owner_id ───────────────────────────
--    (depende de existir uma RPC create_family no banco — recria com owner_id)
CREATE OR REPLACE FUNCTION public.create_family(p_family_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller  profiles%ROWTYPE;
  v_fam_id  UUID;
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

  INSERT INTO families (name, plan, owner_id)
  VALUES (trim(p_family_name), 'free', auth.uid())
  RETURNING id INTO v_fam_id;

  UPDATE profiles SET family_id = v_fam_id WHERE id = auth.uid();

  RETURN v_fam_id;
END;
$$;

-- ── 4. RPC recover_family — reconecta responsável desvinculado ───────────────
--    Busca família onde owner_id = auth.uid() e family_id do caller está NULL
CREATE OR REPLACE FUNCTION public.recover_family()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    profiles%ROWTYPE;
  v_fam_id    UUID;
  v_fam_name  TEXT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF v_caller.family_id IS NOT NULL THEN
    RAISE EXCEPTION 'Você já está vinculado a uma família';
  END IF;

  -- Busca família onde este usuário é o dono
  SELECT id, name INTO v_fam_id, v_fam_name
  FROM families WHERE owner_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_fam_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Reconecta
  UPDATE profiles SET family_id = v_fam_id WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'found',       true,
    'family_id',   v_fam_id,
    'family_name', v_fam_name
  );
END;
$$;

-- ── 5. add_child — limites de plano no backend ───────────────────────────────
DROP FUNCTION IF EXISTS public.add_child(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_child(TEXT, INTEGER, TEXT, DATE);
DROP FUNCTION IF EXISTS public.add_child(TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION add_child(
  p_display_name TEXT,
  p_age          INTEGER DEFAULT NULL,
  p_avatar_emoji TEXT    DEFAULT '👦',
  p_birth_date   DATE    DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    profiles%ROWTYPE;
  v_fam       families%ROWTYPE;
  v_child_id  UUID := gen_random_uuid();
  v_child_cnt INT;
  v_age       INTEGER;
  v_max_kids  INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada. Crie uma família primeiro.';
  END IF;

  SELECT * INTO v_fam FROM families WHERE id = v_caller.family_id;

  -- Limite: FREE = 1 filho, PREMIUM = 20
  v_max_kids := CASE WHEN v_fam.plan = 'premium' THEN 20 ELSE 1 END;

  SELECT COUNT(*) INTO v_child_cnt
  FROM profiles
  WHERE family_id = v_caller.family_id AND role = 'child';

  IF v_child_cnt >= v_max_kids THEN
    IF v_fam.plan = 'free' THEN
      RAISE EXCEPTION 'Plano gratuito permite apenas 1 filho. Faça upgrade para Premium!';
    ELSE
      RAISE EXCEPTION 'Limite de filhos atingido para este plano.';
    END IF;
  END IF;

  v_age := CASE
    WHEN p_birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(p_birth_date))::INTEGER
    ELSE p_age
  END;

  INSERT INTO profiles (id, family_id, role, display_name, age, birth_date, avatar_emoji, xp, kidcoins, streak)
  VALUES (v_child_id, v_caller.family_id, 'child', p_display_name, v_age, p_birth_date, p_avatar_emoji, 0, 0, 0);

  RETURN v_child_id;
END;
$$;

-- ── 6. join_family_by_code — limite de co-responsáveis por plano ─────────────
CREATE OR REPLACE FUNCTION join_family_by_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    profiles%ROWTYPE;
  v_fam       families%ROWTYPE;
  v_parent_cnt INT;
  v_max_co    INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();

  IF v_caller.family_id IS NOT NULL THEN
    RAISE EXCEPTION 'Você já pertence a uma família';
  END IF;

  SELECT * INTO v_fam FROM families WHERE invite_code = upper(trim(p_code));

  IF v_fam.id IS NULL THEN
    RAISE EXCEPTION 'Código inválido ou expirado';
  END IF;

  -- Verifica expiração se existir
  IF v_fam.invite_expires_at IS NOT NULL AND v_fam.invite_expires_at < now() THEN
    RAISE EXCEPTION 'Código de convite expirado. Peça um novo código ao responsável.';
  END IF;

  -- Limite de co-responsáveis: FREE = 2, PREMIUM = 20
  v_max_co := COALESCE(v_fam.max_co_parents, CASE WHEN v_fam.plan = 'premium' THEN 20 ELSE 2 END);

  SELECT COUNT(*) INTO v_parent_cnt
  FROM profiles
  WHERE family_id = v_fam.id AND role IN ('parent', 'admin');

  IF v_parent_cnt >= v_max_co THEN
    IF v_fam.plan = 'free' THEN
      RAISE EXCEPTION 'Plano gratuito permite apenas 2 responsáveis. Peça ao responsável principal para fazer upgrade.';
    ELSE
      RAISE EXCEPTION 'Limite de responsáveis atingido para esta família.';
    END IF;
  END IF;

  UPDATE profiles SET family_id = v_fam.id, role = 'parent' WHERE id = auth.uid();

  RETURN jsonb_build_object('family_id', v_fam.id, 'family_name', v_fam.name);
END;
$$;

-- ── 7. admin_set_plan — atualiza max_co_parents junto com o plano ─────────────
CREATE OR REPLACE FUNCTION public.admin_set_plan(p_family_id UUID, p_plan TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_plan NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido — use "free" ou "premium"';
  END IF;

  UPDATE public.families
  SET plan           = p_plan,
      max_co_parents = CASE WHEN p_plan = 'premium' THEN 20 ELSE 2 END
  WHERE id = p_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;
END;
$$;

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
