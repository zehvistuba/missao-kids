-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: streak_bonus_logs unique constraint (A-01)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-28
-- Problema: sem constraint, check_and_grant_achievements pode inserir o mesmo
--   milestone de streak (ex: 7 dias) duas vezes para a mesma criança.
-- Solução: UNIQUE(child_id, streak_days) — cada marco é concedido uma só vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- Verificar duplicatas antes de criar a constraint
SELECT child_id, streak_days, COUNT(*) AS total
FROM streak_bonus_logs
GROUP BY child_id, streak_days
HAVING COUNT(*) > 1;
-- Se retornar linhas, há duplicatas a limpar antes de continuar.
-- Se retornar vazio, pode prosseguir diretamente.

-- Remover duplicatas (mantém o registro mais antigo de cada par):
DELETE FROM streak_bonus_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (child_id, streak_days) id
  FROM streak_bonus_logs
  ORDER BY child_id, streak_days, granted_at ASC
);

-- Criar constraint
ALTER TABLE public.streak_bonus_logs
  ADD CONSTRAINT streak_bonus_logs_unique_milestone
  UNIQUE (child_id, streak_days);

NOTIFY pgrst, 'reload schema';

-- Verificação
SELECT conname FROM pg_constraint
WHERE conrelid = 'streak_bonus_logs'::regclass
  AND conname = 'streak_bonus_logs_unique_milestone';
-- Esperado: 1 linha
