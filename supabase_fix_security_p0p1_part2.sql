-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fixes de Auditoria P0/P1 — Parte 2
-- HISTORICO - NAO REAPLICAR: add_child usa limite Premium antigo de 20.
-- Fonte vigente para limites: supabase_fix_plan_limits_canonical.sql.
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-02
-- Origem: relatório do Claude Chrome (add_child quebrado, surprise mission ausente,
--         coins negativos) cruzado com a auditoria de código.
-- Rodar DEPOIS de supabase_fix_security_p0p1.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- P0 (Chrome #5) — add_child retornava "null value in column id".
-- Causa provável: overload antigo de add_child sem gen_random_uuid ainda no banco;
--   o PostgREST resolvia para a versão quebrada. Os DROPs anteriores só removiam
--   assinaturas específicas, deixando permutações órfãs.
-- Solução: derrubar TODAS as versões de add_child e recriar UMA canônica.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'add_child' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE FUNCTION public.add_child(
  p_display_name TEXT,
  p_age          INTEGER DEFAULT NULL,
  p_avatar_emoji TEXT    DEFAULT '👦',
  p_birth_date   DATE    DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    profiles%ROWTYPE;
  v_fam       families%ROWTYPE;
  v_child_id  UUID := gen_random_uuid();   -- id SEMPRE gerado no servidor
  v_child_cnt INT;
  v_max_kids  INT;
  v_age       INTEGER;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid() AND role IN ('parent','admin');
  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada. Crie uma família primeiro.';
  END IF;

  IF length(trim(COALESCE(p_display_name,''))) < 1 THEN
    RAISE EXCEPTION 'Nome da criança é obrigatório';
  END IF;

  SELECT * INTO v_fam FROM families WHERE id = v_caller.family_id;
  v_max_kids := CASE WHEN v_fam.plan = 'premium' THEN 20 ELSE 1 END;

  SELECT COUNT(*) INTO v_child_cnt
  FROM profiles WHERE family_id = v_caller.family_id AND role = 'child';

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
  VALUES (v_child_id, v_caller.family_id, 'child', trim(p_display_name), v_age, p_birth_date, COALESCE(p_avatar_emoji,'👦'), 0, 0, 0);

  RETURN v_child_id;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- P1 (Chrome #7 + auditoria P1-3) — submit_surprise_mission não existia
--   (assinatura local era SQL inválido: parâmetro sem default depois de um com
--    default → CREATE falhava → PGRST202 em produção).
-- Solução: criar com assinatura VÁLIDA (obrigatórios primeiro) + gate premium +
--   role=child + CAP server-side em coins/xp (a criança controla os valores).
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_surprise_mission(TEXT, TEXT, INT, INT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.submit_surprise_mission(TEXT, TEXT, INT, INT, DATE, TEXT);

CREATE FUNCTION public.submit_surprise_mission(
  p_title       TEXT,
  p_emoji       TEXT,
  p_coins       INT,
  p_xp          INT,
  p_due_date    DATE,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child       profiles%ROWTYPE;
  v_family_plan TEXT;
  v_mission_id  UUID;
  v_log_id      UUID;
  v_coins       INT;
  v_xp          INT;
BEGIN
  SELECT * INTO v_child FROM profiles WHERE id = auth.uid() AND role = 'child';
  IF v_child.id IS NULL THEN
    RAISE EXCEPTION 'Apenas crianças podem enviar missões surpresa';
  END IF;

  SELECT plan INTO v_family_plan FROM families WHERE id = v_child.family_id;
  IF v_family_plan <> 'premium' THEN
    RAISE EXCEPTION 'premium_required';
  END IF;

  -- CAP: a criança controla p_coins/p_xp via cliente → limitar no servidor.
  v_coins := LEAST(GREATEST(COALESCE(p_coins, 0), 0), 50);
  v_xp    := LEAST(GREATEST(COALESCE(p_xp, 0), 0), 50);

  IF length(trim(COALESCE(p_title,''))) < 2 THEN
    RAISE EXCEPTION 'Título inválido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM mission_logs ml JOIN missions m ON m.id = ml.mission_id
    WHERE ml.child_id = v_child.id AND ml.due_date = p_due_date
      AND ml.status IN ('pending','approved') AND m.title = p_title
  ) THEN
    RAISE EXCEPTION 'Missão surpresa já enviada hoje';
  END IF;

  INSERT INTO missions (family_id, title, emoji, frequency, coins_reward, xp_reward, is_active, description)
  VALUES (v_child.family_id, trim(p_title), p_emoji, 'daily', v_coins, v_xp, false, p_description)
  RETURNING id INTO v_mission_id;

  INSERT INTO mission_logs (child_id, mission_id, family_id, due_date, status)
  VALUES (v_child.id, v_mission_id, v_child.family_id, p_due_date, 'pending')
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- P1 (Chrome #2 + auditoria P2-2) — coins_reward/xp_reward negativos aceitos.
-- Missão com recompensa negativa subtrai coins ao ser aprovada (débito invisível).
-- Solução: CHECK na tabela + validação no create/update_mission.
-- ───────────────────────────────────────────────────────────────────────────
-- Higieniza qualquer dado negativo pré-existente antes da constraint
UPDATE public.missions SET coins_reward = 0 WHERE coins_reward < 0;
UPDATE public.missions SET xp_reward    = 0 WHERE xp_reward    < 0;

ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_coins_nonneg;
ALTER TABLE public.missions ADD  CONSTRAINT missions_coins_nonneg
  CHECK (coins_reward >= 0 AND coins_reward <= 1000 AND xp_reward >= 0 AND xp_reward <= 1000);

-- update_mission: validação explícita (mensagem amigável antes do CHECK)
CREATE OR REPLACE FUNCTION public.update_mission(
  p_mission_id   UUID,
  p_title        TEXT,
  p_emoji        TEXT,
  p_coins_reward INTEGER,
  p_xp_reward    INTEGER,
  p_frequency    TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent','admin');
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF length(trim(COALESCE(p_title,''))) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;
  IF p_coins_reward < 0 OR p_coins_reward > 1000 OR p_xp_reward < 0 OR p_xp_reward > 1000 THEN
    RAISE EXCEPTION 'Valores de recompensa devem estar entre 0 e 1000';
  END IF;

  UPDATE missions
  SET title = trim(p_title), emoji = p_emoji,
      coins_reward = p_coins_reward, xp_reward = p_xp_reward, frequency = p_frequency
  WHERE id = p_mission_id AND family_id = v_family_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;
END;
$$;

-- create_mission: mesma validação + mantém limite FREE
CREATE OR REPLACE FUNCTION public.create_mission(
  p_title        TEXT,
  p_emoji        TEXT    DEFAULT '⭐',
  p_coins_reward INTEGER DEFAULT 20,
  p_xp_reward    INTEGER DEFAULT 15,
  p_frequency    TEXT    DEFAULT 'daily'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID; v_plan TEXT; v_count INT; v_id UUID := gen_random_uuid();
BEGIN
  SELECT p.family_id, f.plan INTO v_family_id, v_plan
  FROM profiles p JOIN families f ON f.id = p.family_id
  WHERE p.id = auth.uid() AND p.role IN ('parent','admin');
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF length(trim(COALESCE(p_title,''))) < 2 THEN RAISE EXCEPTION 'Nome muito curto'; END IF;
  IF p_coins_reward < 0 OR p_coins_reward > 1000 OR p_xp_reward < 0 OR p_xp_reward > 1000 THEN
    RAISE EXCEPTION 'Valores de recompensa devem estar entre 0 e 1000';
  END IF;

  IF v_plan = 'free' THEN
    SELECT COUNT(*) INTO v_count FROM missions WHERE family_id = v_family_id AND is_active = true;
    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Limite de 5 missões ativas no plano gratuito. Faça upgrade para o Premium! 🚀';
    END IF;
  END IF;

  INSERT INTO missions (id, family_id, created_by, title, emoji, coins_reward, xp_reward, frequency, is_active)
  VALUES (v_id, v_family_id, auth.uid(), trim(p_title), p_emoji, p_coins_reward, p_xp_reward, p_frequency, true);
  RETURN v_id;
END;
$$;


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- add_child existe em uma única versão:
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'add_child';
-- submit_surprise_mission existe:
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'submit_surprise_mission';
-- constraint criada:
SELECT conname FROM pg_constraint WHERE conname = 'missions_coins_nonneg';
