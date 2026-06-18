-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix: RLS mission_logs — leitura pelo responsável
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-28  ✅ APLICADO
-- Problema:
--   Política "mission_logs: parent reads all" usava my_family_id() e my_role()
--   — funções customizadas que não funcionavam corretamente para todos os casos.
--   ExtratoModal consulta mission_logs com auth do responsável → retornava [].
--   Resultado: extrato mostrava 0 missões (Ganhos = 135 em vez de 996).
-- Solução:
--   Nova política usando auth.uid() diretamente (padrão Supabase confiável).
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "family_read_mission_logs" ON public.mission_logs;
CREATE POLICY "family_read_mission_logs" ON public.mission_logs
  FOR SELECT USING (
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

-- Verificação
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'mission_logs' AND cmd = 'SELECT';
-- Esperado: family_read_mission_logs + mission_logs: child reads own + mission_logs: parent reads all
