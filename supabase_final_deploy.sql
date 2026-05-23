-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Deploy Final: Hotmart + Streak Milestones
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-21
-- Rodar tudo de uma vez (ou bloco a bloco na ordem indicada)
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- BLOCO 1: Tabela hotmart_events (log de webhooks)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.hotmart_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event        TEXT        NOT NULL,
  buyer_email  TEXT        NOT NULL,
  family_id    UUID        REFERENCES public.families(id) ON DELETE SET NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hotmart_events ENABLE ROW LEVEL SECURITY;

-- Apenas admins visualizam (edge function usa service role, ignora RLS)
CREATE POLICY IF NOT EXISTS "Admins can view hotmart events"
  ON public.hotmart_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ══════════════════════════════════════════════════════════
-- BLOCO 2: RPC get_family_id_by_email (usada pelo webhook)
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_family_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT p.family_id INTO v_family_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE LOWER(u.email) = LOWER(p_email)
    AND p.role IN ('parent', 'admin')
  LIMIT 1;

  RETURN v_family_id;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- BLOCO 3: RPC get_family_plan (usada pelo app e ai-assistant)
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_family_plan()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT f.plan INTO v_plan
  FROM public.families f
  JOIN public.profiles p ON p.family_id = f.id
  WHERE p.id = auth.uid();

  RETURN COALESCE(v_plan, 'free');
END;
$$;

-- ══════════════════════════════════════════════════════════
-- BLOCO 4: Streak Milestones — conquistas de sequência
-- ══════════════════════════════════════════════════════════

-- 4a. Coluna de bônus em achievements
ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS bonus_coins INTEGER NOT NULL DEFAULT 0;

-- 4b. Tabela de log de bônus de streak
CREATE TABLE IF NOT EXISTS public.streak_bonus_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id       UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  family_id      UUID        NOT NULL REFERENCES public.families(id)       ON DELETE CASCADE,
  achievement_id UUID        NOT NULL REFERENCES public.achievements(id),
  coins_awarded  INTEGER     NOT NULL,
  streak_days    INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.streak_bonus_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Family members can view streak bonuses"
  ON public.streak_bonus_logs FOR SELECT
  USING (family_id IN (
    SELECT family_id FROM public.profiles WHERE id = auth.uid()
  ));

-- 4c. Conquistas de sequência
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

-- 4d. Atualizar check_and_grant_achievements para creditar bônus de streak
CREATE OR REPLACE FUNCTION public.check_and_grant_achievements(p_child_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

    ELSIF v_ach.condition_key = 'xp' AND v_xp >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;

    ELSIF v_ach.condition_key = 'streak_days' AND v_streak >= v_ach.condition_val THEN
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
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
      INSERT INTO child_achievements (child_id, achievement_id) VALUES (p_child_id, v_ach.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- NOTIFY para recarregar o schema PostgREST
-- ══════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL (rode separado para confirmar)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('hotmart_events', 'streak_bonus_logs');
-- -- Deve retornar 2 linhas

-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('get_family_id_by_email', 'get_family_plan', 'check_and_grant_achievements');
-- -- Deve retornar 3 linhas

-- SELECT COUNT(*) FROM achievements WHERE condition_key = 'streak_days';
-- -- Deve retornar 6
