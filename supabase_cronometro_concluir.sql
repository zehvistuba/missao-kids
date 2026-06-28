-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Cronômetro: CONCLUIR antes da hora (encerrar manualmente)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- Permite encerrar um cronômetro (correndo/pausado/parado) antes de zerar.
-- O app pergunta "Faltam X, deseja concluir?" e chama esta função no SIM.
-- Pode ser feito pela criança (dona) ou pelo responsável da família. Aditivo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.finish_reward_timer(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE; v_log redemption_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_log FROM redemption_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Resgate nao encontrado'; END IF;
  IF NOT (v_log.child_id = auth.uid()
          OR (v_caller.role IN ('parent','admin') AND v_caller.family_id = v_log.family_id)) THEN
    RAISE EXCEPTION 'Sem permissao'; END IF;
  UPDATE redemption_logs
     SET timer_state = 'done', timer_done = true, timer_remaining_seconds = 0, timer_ends_at = NULL
   WHERE id = p_log_id AND timer_state IN ('idle','paused','running');
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'finish_reward_timer';
