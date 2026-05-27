-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: constraint mission_logs para suportar occurrence
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-27
-- Causa: BUG-C4-01 / BUG-C4-02
--   A constraint UNIQUE(child_id, mission_id, due_date) impede inserir
--   uma 2ª ocorrência da mesma missão no mesmo dia.
--   Solução: incluir occurrence na constraint.
-- ═══════════════════════════════════════════════════════════════════════════

-- Remover constraint antiga
ALTER TABLE public.mission_logs
  DROP CONSTRAINT IF EXISTS mission_logs_unique_per_day;

-- Nova constraint: cada occurrence é única, mas 1ª e 2ª ocorrência coexistem
ALTER TABLE public.mission_logs
  ADD CONSTRAINT mission_logs_unique_per_occurrence
  UNIQUE (child_id, mission_id, due_date, occurrence);

NOTIFY pgrst, 'reload schema';

-- Verificação
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'mission_logs'::regclass
  AND conname IN ('mission_logs_unique_per_day', 'mission_logs_unique_per_occurrence');
-- Esperado: apenas mission_logs_unique_per_occurrence presente
