-- RotinUp - limites atomicos ao reativar missoes e recompensas.
-- PREPARADO, NAO APLICADO. Diagnosticar o banco vivo antes de executar.
-- Free: 5 missoes ativas e 3 recompensas ativas. Premium: ilimitado.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_active_catalog_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_plan TEXT;
  v_active_count INTEGER;
BEGIN
  IF NEW.family_id IS NULL THEN RAISE EXCEPTION 'Familia obrigatoria'; END IF;
  IF NEW.is_active IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.is_active IS TRUE
    AND OLD.family_id IS NOT DISTINCT FROM NEW.family_id
  THEN
    RETURN NEW;
  END IF;

  SELECT family.plan::TEXT
  INTO v_plan
  FROM public.families AS family
  WHERE family.id = NEW.family_id
  FOR UPDATE;

  IF v_plan IS NULL THEN RAISE EXCEPTION 'Familia nao encontrada'; END IF;
  IF v_plan = 'premium' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'missions' THEN
    SELECT count(*)
    INTO v_active_count
    FROM public.missions AS mission
    WHERE mission.family_id = NEW.family_id
      AND mission.is_active = true
      AND (TG_OP = 'INSERT' OR mission.id <> NEW.id);

    IF v_active_count >= 5 THEN
      RAISE EXCEPTION 'Limite de 5 missoes ativas atingido no plano gratuito';
    END IF;
  ELSIF TG_TABLE_NAME = 'rewards' THEN
    SELECT count(*)
    INTO v_active_count
    FROM public.rewards AS reward
    WHERE reward.family_id = NEW.family_id
      AND reward.is_active = true
      AND (TG_OP = 'INSERT' OR reward.id <> NEW.id);

    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'Limite de 3 recompensas ativas atingido no plano gratuito';
    END IF;
  ELSE
    RAISE EXCEPTION 'Catalogo nao suportado';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_mission(p_mission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family_id UUID;
  v_plan TEXT;
  v_active_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT profile.family_id
  INTO v_family_id
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid()
    AND profile.role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT family.plan::TEXT
  INTO v_plan
  FROM public.families AS family
  WHERE family.id = v_family_id
  FOR UPDATE;

  IF v_plan IS NULL THEN RAISE EXCEPTION 'Familia nao encontrada'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.missions AS mission
    WHERE mission.id = p_mission_id
      AND mission.family_id = v_family_id
      AND mission.is_active = false
  ) THEN
    RAISE EXCEPTION 'Missao nao encontrada, ja ativa ou sem permissao';
  END IF;

  IF v_plan <> 'premium' THEN
    SELECT count(*)
    INTO v_active_count
    FROM public.missions AS mission
    WHERE mission.family_id = v_family_id
      AND mission.is_active = true;

    IF v_active_count >= 5 THEN
      RAISE EXCEPTION 'Limite de 5 missoes ativas atingido no plano gratuito';
    END IF;
  END IF;

  UPDATE public.missions
  SET is_active = true
  WHERE id = p_mission_id
    AND family_id = v_family_id
    AND is_active = false;

  IF NOT FOUND THEN RAISE EXCEPTION 'Nao foi possivel reativar a missao'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_reward(p_reward_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family_id UUID;
  v_plan TEXT;
  v_active_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT profile.family_id
  INTO v_family_id
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid()
    AND profile.role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT family.plan::TEXT
  INTO v_plan
  FROM public.families AS family
  WHERE family.id = v_family_id
  FOR UPDATE;

  IF v_plan IS NULL THEN RAISE EXCEPTION 'Familia nao encontrada'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.rewards AS reward
    WHERE reward.id = p_reward_id
      AND reward.family_id = v_family_id
      AND reward.is_active = false
  ) THEN
    RAISE EXCEPTION 'Recompensa nao encontrada, ja ativa ou sem permissao';
  END IF;

  IF v_plan <> 'premium' THEN
    SELECT count(*)
    INTO v_active_count
    FROM public.rewards AS reward
    WHERE reward.family_id = v_family_id
      AND reward.is_active = true;

    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'Limite de 3 recompensas ativas atingido no plano gratuito';
    END IF;
  END IF;

  UPDATE public.rewards
  SET is_active = true
  WHERE id = p_reward_id
    AND family_id = v_family_id
    AND is_active = false;

  IF NOT FOUND THEN RAISE EXCEPTION 'Nao foi possivel reativar a recompensa'; END IF;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_mission_limit ON public.missions;
CREATE TRIGGER enforce_active_mission_limit
BEFORE INSERT OR UPDATE OF is_active, family_id ON public.missions
FOR EACH ROW EXECUTE FUNCTION public.enforce_active_catalog_limit();

DROP TRIGGER IF EXISTS enforce_active_reward_limit ON public.rewards;
CREATE TRIGGER enforce_active_reward_limit
BEFORE INSERT OR UPDATE OF is_active, family_id ON public.rewards
FOR EACH ROW EXECUTE FUNCTION public.enforce_active_catalog_limit();

REVOKE ALL ON FUNCTION public.enforce_active_catalog_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reactivate_mission(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reactivate_reward(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_mission(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_reward(UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificacao somente leitura depois da aplicacao.
SELECT
  pg_get_functiondef('public.enforce_active_catalog_limit()'::regprocedure) ILIKE '%FOR UPDATE%' AS trigger_lock_ok,
  pg_get_functiondef('public.reactivate_mission(uuid)'::regprocedure) ILIKE '%FOR UPDATE%' AS mission_lock_ok,
  pg_get_functiondef('public.reactivate_mission(uuid)'::regprocedure) ILIKE '%v_active_count >= 5%' AS mission_limit_ok,
  pg_get_functiondef('public.reactivate_reward(uuid)'::regprocedure) ILIKE '%v_active_count >= 3%' AS reward_limit_ok,
  has_function_privilege('anon', 'public.reactivate_mission(uuid)', 'EXECUTE') AS anon_mission_execute,
  has_function_privilege('anon', 'public.reactivate_reward(uuid)', 'EXECUTE') AS anon_reward_execute,
  has_function_privilege('authenticated', 'public.reactivate_mission(uuid)', 'EXECUTE') AS authenticated_mission_execute,
  has_function_privilege('authenticated', 'public.reactivate_reward(uuid)', 'EXECUTE') AS authenticated_reward_execute;

SELECT
  trigger.tgname,
  trigger.tgenabled
FROM pg_catalog.pg_trigger AS trigger
WHERE trigger.tgrelid IN ('public.missions'::regclass, 'public.rewards'::regclass)
  AND trigger.tgname IN ('enforce_active_mission_limit', 'enforce_active_reward_limit')
  AND NOT trigger.tgisinternal
ORDER BY trigger.tgname;
