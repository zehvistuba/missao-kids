-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: Bugs Críticos QA Ciclo 2
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-24
-- Corrige: BUG-01 apply_demerit, BUG-02 request_redemption_bulk,
--          BUG-03 check_and_grant_achievements, BUG-11 streak guarda
-- Rodar TUDO de uma vez (ou bloco a bloco na ordem)
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: apply_demerit — BUG-01
-- Colunas corretas: coins_deducted (não "coins"), created_by (não "applied_by")
-- Também adiciona guarda role IN ('parent','admin')
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_demerit(
  p_child_id UUID,
  p_title    TEXT,
  p_emoji    TEXT DEFAULT '⚠️',
  p_coins    INT  DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_child  public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_child  FROM public.profiles WHERE id = p_child_id;

  IF v_caller.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Apenas responsáveis podem aplicar tropeços';
  END IF;

  IF v_caller.family_id IS DISTINCT FROM v_child.family_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_coins < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  UPDATE public.profiles
  SET kidcoins = GREATEST(0, COALESCE(kidcoins, 0) - p_coins)
  WHERE id = p_child_id;

  INSERT INTO public.demerit_logs (child_id, family_id, title, emoji, coins_deducted, created_by)
  VALUES (p_child_id, v_child.family_id, p_title, p_emoji, p_coins, auth.uid());
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: request_redemption_bulk — BUG-02
-- Colunas corretas: coin_cost (não "coins_cost"), kidcoins (não "coins")
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_redemption_bulk(
  p_reward_id UUID,
  p_quantity  INT DEFAULT 1
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child    public.profiles%ROWTYPE;
  v_reward   public.rewards%ROWTYPE;
  v_total    INT;
  v_log_ids  UUID[] := '{}';
  v_log_id   UUID;
  i          INT;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Quantidade inválida (1-20)';
  END IF;

  SELECT * INTO v_child FROM public.profiles WHERE id = auth.uid() AND role = 'child';
  IF v_child.id IS NULL THEN
    RAISE EXCEPTION 'Apenas crianças podem solicitar resgates';
  END IF;

  SELECT * INTO v_reward FROM public.rewards
  WHERE id = p_reward_id
    AND is_active = true
    AND family_id = v_child.family_id;

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou inativa';
  END IF;

  v_total := v_reward.coin_cost * p_quantity;

  IF COALESCE(v_child.kidcoins, 0) < v_total THEN
    RAISE EXCEPTION 'KidCoins insuficientes (precisa de % 🪙)', v_total;
  END IF;

  UPDATE public.profiles
  SET kidcoins = kidcoins - v_total
  WHERE id = auth.uid();

  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.redemption_logs
      (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
    VALUES
      (auth.uid(), v_child.family_id, p_reward_id,
       v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
    RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;

  RETURN v_log_ids;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: check_and_grant_achievements — BUG-03
-- Garante que a versão com suporte a bonus_coins de streak está no banco.
-- Se o banco estava na versão antiga (supabase_fix_achievements_trigger.sql)
-- sem bonus_coins, esta versão substitui e credita corretamente.
-- ══════════════════════════════════════════════════════════════════════

-- 3a. Garantir coluna bonus_coins na tabela achievements
ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS bonus_coins INTEGER NOT NULL DEFAULT 0;

-- 3b. Atualizar marcos de streak com ON CONFLICT DO NOTHING (idempotente)
INSERT INTO public.achievements
  (emoji, name, description, condition_key, condition_val, bonus_coins)
VALUES
  ('🔥', '1 Semana Incrível!',   '7 dias seguidos completando missões',  'streak_days',  7,   50),
  ('⚡', '2 Semanas Imparável!', '14 dias seguidos completando missões', 'streak_days', 14,  100),
  ('🌟', '3 Semanas Lendário!',  '21 dias seguidos completando missões', 'streak_days', 21,  150),
  ('🏆', '1 Mês Campeão!',       '30 dias seguidos completando missões', 'streak_days', 30,  200),
  ('💎', '2 Meses Supremo!',     '60 dias seguidos completando missões', 'streak_days', 60,  400),
  ('👑', '3 Meses Lendário!',    '90 dias seguidos completando missões', 'streak_days', 90,  600)
ON CONFLICT DO NOTHING;

-- 3c. Se as conquistas já existem mas com bonus_coins = 0 (foram inseridas antes
--     da coluna existir), atualizar os valores corretos
UPDATE public.achievements SET bonus_coins = 50  WHERE condition_key = 'streak_days' AND condition_val = 7  AND bonus_coins = 0;
UPDATE public.achievements SET bonus_coins = 100 WHERE condition_key = 'streak_days' AND condition_val = 14 AND bonus_coins = 0;
UPDATE public.achievements SET bonus_coins = 150 WHERE condition_key = 'streak_days' AND condition_val = 21 AND bonus_coins = 0;
UPDATE public.achievements SET bonus_coins = 200 WHERE condition_key = 'streak_days' AND condition_val = 30 AND bonus_coins = 0;
UPDATE public.achievements SET bonus_coins = 400 WHERE condition_key = 'streak_days' AND condition_val = 60 AND bonus_coins = 0;
UPDATE public.achievements SET bonus_coins = 600 WHERE condition_key = 'streak_days' AND condition_val = 90 AND bonus_coins = 0;

-- 3d. Recriar check_and_grant_achievements com suporte completo a bonus_coins
CREATE OR REPLACE FUNCTION public.check_and_grant_achievements(p_child_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_missions INTEGER;
  v_xp             INTEGER;
  v_streak         INTEGER;
  v_family_id      UUID;
  v_ach            RECORD;
BEGIN
  SELECT
    COALESCE(xp, 0),
    COALESCE(streak, 0),
    family_id
  INTO v_xp, v_streak, v_family_id
  FROM profiles WHERE id = p_child_id;

  SELECT COUNT(*) INTO v_total_missions
  FROM mission_logs WHERE child_id = p_child_id AND status = 'approved';

  FOR v_ach IN SELECT * FROM achievements LOOP
    IF EXISTS (
      SELECT 1 FROM child_achievements
      WHERE child_id = p_child_id AND achievement_id = v_ach.id
    ) THEN
      CONTINUE;
    END IF;

    IF v_ach.condition_key = 'missions_total' AND v_total_missions >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

    ELSIF v_ach.condition_key = 'xp' AND v_xp >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

    ELSIF v_ach.condition_key = 'streak_days' AND v_streak >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

      IF COALESCE(v_ach.bonus_coins, 0) > 0 THEN
        UPDATE profiles SET kidcoins = kidcoins + v_ach.bonus_coins WHERE id = p_child_id;
        INSERT INTO streak_bonus_logs
          (child_id, family_id, achievement_id, coins_awarded, streak_days)
        VALUES
          (p_child_id, v_family_id, v_ach.id, v_ach.bonus_coins, v_ach.condition_val)
        ON CONFLICT DO NOTHING;
      END IF;

    ELSIF v_ach.condition_key = 'level_reached' AND v_xp >= (
      SELECT xp_min FROM (VALUES (1,0),(2,100),(3,300),(4,600),(5,1000),(6,1500)) AS lvls(lvl, xp_min)
      WHERE lvl = v_ach.condition_val LIMIT 1
    ) THEN
      INSERT INTO child_achievements (child_id, achievement_id)
      VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 3e. Recriar trigger_check_achievements ligada à função acima
CREATE OR REPLACE FUNCTION public.trigger_check_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'mission_logs' THEN
    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
      PERFORM check_and_grant_achievements(NEW.child_id);
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.xp IS DISTINCT FROM OLD.xp OR NEW.streak IS DISTINCT FROM OLD.streak THEN
      PERFORM check_and_grant_achievements(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_on_mission ON mission_logs;
DROP TRIGGER IF EXISTS trg_achievements_on_profile ON profiles;

CREATE TRIGGER trg_achievements_on_mission
AFTER INSERT OR UPDATE ON mission_logs
FOR EACH ROW EXECUTE FUNCTION trigger_check_achievements();

CREATE TRIGGER trg_achievements_on_profile
AFTER UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION trigger_check_achievements();


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: parent_check_mission — BUG-11
-- Streak só incrementa uma vez por dia (na primeira missão aprovada)
-- Corrige race condition: marcar N missões num dia incrementava N vezes
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.parent_check_mission(
  p_child_id   UUID,
  p_mission_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_family UUID;
  v_child_family  UUID;
  v_coins         INT;
  v_xp            INT;
  v_frequency     TEXT;
  v_today         DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_cutoff        DATE;
  v_approved_today INT;
BEGIN
  SELECT family_id INTO v_caller_family
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_caller_family IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT family_id INTO v_child_family
  FROM profiles WHERE id = p_child_id AND role = 'child';

  IF v_child_family IS NULL OR v_child_family <> v_caller_family THEN
    RAISE EXCEPTION 'Filho não pertence à sua família';
  END IF;

  SELECT coins_reward, xp_reward, frequency
  INTO v_coins, v_xp, v_frequency
  FROM missions
  WHERE id = p_mission_id AND family_id = v_caller_family AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada ou inativa';
  END IF;

  v_cutoff := CASE v_frequency
    WHEN 'weekly'   THEN v_today - 6
    WHEN 'biweekly' THEN v_today - 13
    WHEN 'monthly'  THEN v_today - 29
    ELSE v_today
  END;

  IF EXISTS (
    SELECT 1 FROM mission_logs
    WHERE child_id   = p_child_id
      AND mission_id = p_mission_id
      AND due_date   >= v_cutoff
      AND status     IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'Missão já registrada neste período';
  END IF;

  INSERT INTO mission_logs
    (child_id, mission_id, family_id, due_date, status, reviewed_by, parent_note)
  VALUES
    (p_child_id, p_mission_id, v_caller_family, v_today, 'approved', auth.uid(), 'Marcado pelo responsável ✅');

  UPDATE profiles
  SET xp       = xp + v_xp,
      kidcoins = kidcoins + v_coins
  WHERE id = p_child_id;

  -- Contar quantas missões aprovadas existem HOJE para este filho
  -- (inclui o INSERT acima; se = 1 é a primeira do dia → atualiza streak)
  SELECT COUNT(*) INTO v_approved_today
  FROM mission_logs
  WHERE child_id = p_child_id AND status = 'approved' AND due_date = v_today;

  IF v_approved_today = 1 THEN
    -- Primeira missão aprovada hoje → atualizar streak
    UPDATE profiles
    SET streak = CASE
          WHEN EXISTS (
            SELECT 1 FROM mission_logs
            WHERE child_id = p_child_id AND status = 'approved' AND due_date = v_today - 1
          ) THEN streak + 1
          ELSE 1
        END
    WHERE id = p_child_id;
  END IF;
  -- v_approved_today > 1 → streak já foi contado hoje, não mexer

  PERFORM check_and_grant_achievements(p_child_id);
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════════
-- VERIFICAÇÕES FINAIS
-- ══════════════════════════════════════════════════════════════════════

-- 1. Confirmar que as RPCs existem
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'apply_demerit', 'request_redemption_bulk',
    'check_and_grant_achievements', 'parent_check_mission'
  )
ORDER BY routine_name;
-- Deve retornar 4 linhas

-- 2. Confirmar conquistas de streak com bonus_coins corretos
SELECT name, condition_val, bonus_coins
FROM achievements
WHERE condition_key = 'streak_days'
ORDER BY condition_val;
-- Deve mostrar: 7→50, 14→100, 21→150, 30→200, 60→400, 90→600

-- 3. Confirmar triggers
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname IN ('trg_achievements_on_mission', 'trg_achievements_on_profile');
-- Deve retornar 2 linhas com tgenabled = 'O'
