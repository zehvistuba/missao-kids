-- RotinUp: Sistema de Deméritos
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- 1. Tabela de log de deméritos
CREATE TABLE IF NOT EXISTS public.demerit_logs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id      UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  emoji          TEXT NOT NULL DEFAULT '⚠️',
  coins_deducted INT NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.demerit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_demerit_select" ON public.demerit_logs;
CREATE POLICY "family_demerit_select" ON public.demerit_logs
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "parent_demerit_insert" ON public.demerit_logs;
CREATE POLICY "parent_demerit_insert" ON public.demerit_logs
  FOR INSERT WITH CHECK (
    family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())
  );

-- 2. RPC: responsável aplica demerito a um filho
CREATE OR REPLACE FUNCTION public.apply_demerit(
  p_child_id UUID,
  p_title    TEXT,
  p_emoji    TEXT DEFAULT '⚠️',
  p_coins    INT  DEFAULT 0
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_child  public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_child  FROM public.profiles WHERE id = p_child_id;

  IF v_caller.family_id IS DISTINCT FROM v_child.family_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_coins < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  -- Desconta coins (não vai abaixo de 0)
  UPDATE public.profiles
  SET kidcoins = GREATEST(0, COALESCE(kidcoins, 0) - p_coins)
  WHERE id = p_child_id;

  -- Registra o demerito
  INSERT INTO public.demerit_logs (child_id, family_id, title, emoji, coins_deducted, created_by)
  VALUES (p_child_id, v_child.family_id, p_title, p_emoji, p_coins, auth.uid());
END;
$$;
