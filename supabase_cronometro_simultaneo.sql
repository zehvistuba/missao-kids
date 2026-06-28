-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Cronômetro: timers INDEPENDENTES (pode rodar vários ao mesmo tempo)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-19
-- Ajuste sobre o cronometro_pausar: REMOVE a regra "um por vez". Agora cada timer
-- é independente — dá pra rodar 1h de celular + 1h de videogame ao mesmo tempo,
-- e pausar um não mexe nos outros. (Entrega continua deixando 'idle'/parado; só
-- liga quando aperta ▶️, então 2x a MESMA recompensa não queima sozinha.)
-- 100% ADITIVO: só substitui a função start_reward_timer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.start_reward_timer(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE; v_log redemption_logs%ROWTYPE; v_secs INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_log FROM redemption_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Resgate nao encontrado'; END IF;
  -- dono (a propria crianca) OU responsavel da familia
  IF NOT (v_log.child_id = auth.uid()
          OR (v_caller.role IN ('parent','admin') AND v_caller.family_id = v_log.family_id)) THEN
    RAISE EXCEPTION 'Sem permissao'; END IF;
  IF v_log.status <> 'delivered' OR COALESCE(v_log.duration_minutes,0) <= 0 THEN
    RAISE EXCEPTION 'Cronometro indisponivel'; END IF;
  IF COALESCE(v_log.timer_state,'') = 'done' THEN RAISE EXCEPTION 'Tempo ja encerrado'; END IF;

  v_secs := COALESCE(v_log.timer_remaining_seconds, v_log.duration_minutes * 60);
  IF v_secs <= 0 THEN RAISE EXCEPTION 'Sem tempo restante'; END IF;

  -- TIMERS INDEPENDENTES: não pausa os outros — vários podem correr ao mesmo tempo.
  UPDATE redemption_logs
     SET timer_state = 'running',
         timer_ends_at = now() + make_interval(secs => v_secs),
         timer_warned = false
   WHERE id = p_log_id;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'start_reward_timer';
