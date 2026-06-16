-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fase 2B: Missão de duração (▶️ Iniciar + cronômetro)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-15
-- Uma missão pode ter duração (min). Na tela da criança vira ▶️ Iniciar: ao
-- terminar a contagem, a missão é enviada sozinha para aprovação (submit_mission).
-- 100% ADITIVO: só adiciona 1 coluna + 1 função. NÃO toca em submit_mission,
-- create_mission, mission_logs nem em nada existente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Schema ──────────────────────────────────────────────────────────────
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS duration_minutes INT;

-- ─── 2. Definir duração de uma missão (sem tocar no create_mission vivo) ─────
CREATE OR REPLACE FUNCTION public.set_mission_duration(p_mission_id UUID, p_minutes INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fam UUID;
BEGIN
  SELECT family_id INTO v_fam FROM profiles WHERE id = auth.uid() AND role IN ('parent','admin');
  IF v_fam IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE missions
     SET duration_minutes = NULLIF(GREATEST(COALESCE(p_minutes,0),0), 0)
   WHERE id = p_mission_id AND family_id = v_fam;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
 WHERE table_name='missions' AND column_name='duration_minutes';
SELECT proname FROM pg_proc WHERE proname = 'set_mission_duration';
