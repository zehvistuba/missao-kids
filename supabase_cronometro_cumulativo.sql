-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Cronômetro CUMULATIVO para a MESMA recompensa
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- 3x "1h de videogame" agora viram UM cronômetro de 3h (soma), em vez de 3 timers.
-- Recompensas DIFERENTES (celular + videogame) seguem separadas/simultâneas.
-- Como: ao ENTREGAR uma recompensa de tempo, se já existe um timer ATIVO da mesma
-- recompensa pro mesmo filho, soma a duração nele; senão, vira um timer novo.
-- O log somado fica 'merged' (não aparece como timer separado). 100% ADITIVO.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   profiles%ROWTYPE;
  v_log      redemption_logs%ROWTYPE;
  v_existing redemption_logs%ROWTYPE;
  v_add      INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.role NOT IN ('parent','admin') THEN
    RAISE EXCEPTION 'Apenas responsaveis podem confirmar entregas';
  END IF;

  -- marca como entregue
  UPDATE redemption_logs SET status = 'delivered', delivered_at = now()
   WHERE id = p_log_id AND family_id = v_caller.family_id AND status = 'approved'
   RETURNING * INTO v_log;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Resgate nao encontrado ou ainda nao aprovado'; END IF;

  -- sem duração: nada de cronômetro
  IF COALESCE(v_log.duration_minutes,0) <= 0 THEN RETURN; END IF;
  v_add := v_log.duration_minutes * 60;

  -- já existe timer ATIVO da MESMA recompensa pro MESMO filho? então ACUMULA
  SELECT * INTO v_existing FROM redemption_logs
   WHERE child_id = v_log.child_id AND reward_id = v_log.reward_id AND id <> v_log.id
     AND status = 'delivered' AND timer_state IN ('idle','paused','running')
   ORDER BY created_at LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.timer_state = 'running' THEN
      -- correndo: estende o fim
      UPDATE redemption_logs SET timer_ends_at = timer_ends_at + make_interval(secs => v_add)
       WHERE id = v_existing.id;
    ELSE
      -- idle/paused: soma no tempo restante
      UPDATE redemption_logs SET timer_remaining_seconds = COALESCE(timer_remaining_seconds,0) + v_add
       WHERE id = v_existing.id;
    END IF;
    -- este log foi somado ao outro: não vira timer próprio
    UPDATE redemption_logs SET timer_state = 'merged', timer_remaining_seconds = NULL, timer_ends_at = NULL
     WHERE id = v_log.id;
  ELSE
    -- primeiro: vira o timer (disponível, parado)
    UPDATE redemption_logs SET timer_state = 'idle', timer_remaining_seconds = v_add, timer_ends_at = NULL
     WHERE id = v_log.id;
  END IF;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'confirm_redemption';
