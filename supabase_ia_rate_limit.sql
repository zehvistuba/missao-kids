-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — IA: rate-limit por usuário/dia (cota por plano)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- Evita custo/abuso na Gemini. A edge function ai-assistant chama ai_check_and_bump
-- antes de cada chamada; a função decide o limite pelo PLANO (servidor, não cliente).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL,
  day     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  count   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;  -- ninguém lê direto (só via RPC definer)

-- Incrementa e diz se ainda está dentro da cota. Limite decidido pelo PLANO no servidor.
CREATE OR REPLACE FUNCTION public.ai_check_and_bump()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_plan  TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('allowed', false, 'limit', 0, 'count', 0); END IF;

  SELECT f.plan INTO v_plan
    FROM profiles p JOIN families f ON f.id = p.family_id
   WHERE p.id = auth.uid();
  v_limit := CASE WHEN v_plan = 'premium' THEN 200 ELSE 40 END;  -- por dia

  INSERT INTO ai_usage (user_id, day, count) VALUES (auth.uid(), v_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1
  RETURNING count INTO v_count;

  RETURN jsonb_build_object('allowed', v_count <= v_limit, 'limit', v_limit, 'count', v_count);
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT to_regclass('public.ai_usage') AS tabela;
SELECT proname FROM pg_proc WHERE proname = 'ai_check_and_bump';
