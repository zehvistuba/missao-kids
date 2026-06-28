-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fixes da auditoria (Codex) — P1 que não dependem do banco vivo
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- (1) cancel_redemption: estorno ATÔMICO (sem corrida / duplo estorno).
-- (2) start_reward_timer: IDEMPOTENTE — re-chamada em timer já 'running' não estende.
-- 100% ADITIVO (CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── (1) Cancelar/recusar resgate sem corrida ───────────────────────────────
-- Faz o UPDATE com guarda de status na própria query (lock de linha) e só estorna
-- se ESTA chamada mudou a linha. Duas chamadas simultâneas → só uma estorna.
CREATE OR REPLACE FUNCTION public.cancel_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE; v_log redemption_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  UPDATE redemption_logs
     SET status = 'cancelled'
   WHERE id = p_log_id
     AND family_id = v_caller.family_id
     AND status IN ('requested','approved')
     AND (v_caller.role IN ('parent','admin') OR child_id = auth.uid())
   RETURNING * INTO v_log;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada, sem permissao ou ja processada';
  END IF;

  -- estorna exatamente uma vez (só quem efetivou o cancelamento chega aqui)
  UPDATE profiles SET kidcoins = kidcoins + v_log.coin_cost WHERE id = v_log.child_id;
END; $$;

-- ─── (2) Iniciar/retomar timer — idempotente em 'running' ───────────────────
CREATE OR REPLACE FUNCTION public.start_reward_timer(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE; v_log redemption_logs%ROWTYPE; v_secs INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_log FROM redemption_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Resgate nao encontrado'; END IF;
  IF NOT (v_log.child_id = auth.uid()
          OR (v_caller.role IN ('parent','admin') AND v_caller.family_id = v_log.family_id)) THEN
    RAISE EXCEPTION 'Sem permissao'; END IF;
  IF v_log.status <> 'delivered' OR COALESCE(v_log.duration_minutes,0) <= 0 THEN
    RAISE EXCEPTION 'Cronometro indisponivel'; END IF;
  IF COALESCE(v_log.timer_state,'') = 'done' THEN RAISE EXCEPTION 'Tempo ja encerrado'; END IF;
  -- JÁ está correndo: nada a fazer (não reinicia/estende)
  IF COALESCE(v_log.timer_state,'') = 'running' THEN RETURN; END IF;

  v_secs := COALESCE(v_log.timer_remaining_seconds, v_log.duration_minutes * 60);
  IF v_secs <= 0 THEN RAISE EXCEPTION 'Sem tempo restante'; END IF;

  -- enquanto corre, a verdade é timer_ends_at; zera remaining p/ não reusar valor velho
  UPDATE redemption_logs
     SET timer_state = 'running',
         timer_ends_at = now() + make_interval(secs => v_secs),
         timer_remaining_seconds = NULL,
         timer_warned = false
   WHERE id = p_log_id;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname IN ('cancel_redemption','start_reward_timer');
