-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Cronômetro v2: ▶️ Iniciar + ⏸️ Pausar (um por vez)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-19
-- ANTES: ao ENTREGAR uma recompensa de tempo, o cronômetro ligava sozinho — duas
-- entregas rodavam em PARALELO (2x1h acabava em 1h) e não dava pra pausar.
-- AGORA: entregar deixa o tempo DISPONÍVEL (parado). A criança/responsável aperta
-- ▶️ Iniciar quando começa, ⏸️ Pausa quando quiser, e SÓ UM corre por vez por filho.
-- Aditivo + migra os timers atuais (que estão correndo em paralelo) para PAUSADOS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Colunas de estado do cronômetro ─────────────────────────────────────
ALTER TABLE public.redemption_logs ADD COLUMN IF NOT EXISTS timer_state TEXT;             -- idle | running | paused | done
ALTER TABLE public.redemption_logs ADD COLUMN IF NOT EXISTS timer_remaining_seconds INT;  -- tempo restante quando idle/paused

-- ─── 2. Migrar timers ATUAIS (modelo antigo) → PAUSADOS com o tempo restante ──
-- Isso para o "queima em paralelo" agora mesmo; dá pra retomar um de cada vez.
UPDATE public.redemption_logs
   SET timer_remaining_seconds = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (timer_ends_at - now())))::int),
       timer_state = 'paused',
       timer_ends_at = NULL
 WHERE status = 'delivered'
   AND timer_ends_at IS NOT NULL
   AND COALESCE(timer_done, false) = false
   AND timer_state IS NULL;

-- timers que já tinham acabado ficam como done
UPDATE public.redemption_logs
   SET timer_state = 'done'
 WHERE status = 'delivered' AND COALESCE(timer_done, false) = true AND timer_state IS NULL;

-- ─── 3. Entregar = deixa DISPONÍVEL (idle), NÃO liga sozinho ─────────────────
CREATE OR REPLACE FUNCTION public.confirm_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.role NOT IN ('parent','admin') THEN RAISE EXCEPTION 'Apenas responsaveis podem confirmar entregas'; END IF;
  UPDATE redemption_logs
     SET status = 'delivered', delivered_at = now(),
         timer_state = CASE WHEN COALESCE(duration_minutes,0) > 0 THEN 'idle' ELSE NULL END,
         timer_remaining_seconds = CASE WHEN COALESCE(duration_minutes,0) > 0 THEN duration_minutes * 60 ELSE NULL END,
         timer_ends_at = NULL
   WHERE id = p_log_id AND family_id = v_caller.family_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Resgate nao encontrado ou ainda nao aprovado'; END IF;
END; $$;

-- ─── 4. ▶️ Iniciar/Retomar (pausa os outros do mesmo filho — um por vez) ─────
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

  -- um por vez: pausa qualquer outro 'running' do MESMO filho
  UPDATE redemption_logs
     SET timer_state = 'paused',
         timer_remaining_seconds = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (timer_ends_at - now())))::int),
         timer_ends_at = NULL
   WHERE child_id = v_log.child_id AND timer_state = 'running' AND id <> p_log_id;

  -- liga este
  UPDATE redemption_logs
     SET timer_state = 'running',
         timer_ends_at = now() + make_interval(secs => v_secs),
         timer_warned = false
   WHERE id = p_log_id;
END; $$;

-- ─── 5. ⏸️ Pausar (guarda o tempo restante) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_reward_timer(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE; v_log redemption_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_log FROM redemption_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Resgate nao encontrado'; END IF;
  IF NOT (v_log.child_id = auth.uid()
          OR (v_caller.role IN ('parent','admin') AND v_caller.family_id = v_log.family_id)) THEN
    RAISE EXCEPTION 'Sem permissao'; END IF;
  IF COALESCE(v_log.timer_state,'') <> 'running' THEN RETURN; END IF;
  UPDATE redemption_logs
     SET timer_state = 'paused',
         timer_remaining_seconds = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (timer_ends_at - now())))::int),
         timer_ends_at = NULL
   WHERE id = p_log_id;
END; $$;

-- ─── 6. Cron de avisos — agora SÓ para 'running' ────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_timer_alerts()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret TEXT;
  v_key TEXT := 'sb_publishable_ZfA-HSNeYtqvf7CwJ5bU5g_1gplbHPI';
  r RECORD;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='rotinup_cron_secret' LIMIT 1;

  -- Aviso "faltam ~5 min" (só timers correndo)
  FOR r IN
    SELECT id, family_id, reward_title, reward_emoji FROM redemption_logs
     WHERE status='delivered' AND timer_state='running' AND timer_ends_at IS NOT NULL AND NOT timer_warned
       AND now() >= timer_ends_at - interval '5 minutes' AND now() < timer_ends_at
  LOOP
    PERFORM net.http_post(
      url := 'https://intieqgjmprxatvogxkh.supabase.co/functions/v1/push-notify',
      headers := jsonb_build_object('Authorization','Bearer '||v_key,'apikey',v_key,'x-cron-secret',v_secret,'Content-Type','application/json'),
      body := jsonb_build_object('family_id', r.family_id, 'title','⏰ Faltam ~5 minutos!', 'body', (r.reward_emoji||' '||r.reward_title||' está quase acabando. Vai terminando! ⏳'), 'url','/'));
    UPDATE redemption_logs SET timer_warned = true WHERE id = r.id;
  END LOOP;

  -- Aviso "acabou o tempo" (só timers correndo) + marca done
  FOR r IN
    SELECT id, family_id, reward_title, reward_emoji FROM redemption_logs
     WHERE status='delivered' AND timer_state='running' AND timer_ends_at IS NOT NULL AND now() >= timer_ends_at
  LOOP
    PERFORM net.http_post(
      url := 'https://intieqgjmprxatvogxkh.supabase.co/functions/v1/push-notify',
      headers := jsonb_build_object('Authorization','Bearer '||v_key,'apikey',v_key,'x-cron-secret',v_secret,'Content-Type','application/json'),
      body := jsonb_build_object('family_id', r.family_id, 'title','⏱️ Acabou o tempo!', 'body', (r.reward_emoji||' '||r.reward_title||' chegou ao fim. 🏁'), 'url','/'));
    UPDATE redemption_logs SET timer_done = true, timer_state = 'done', timer_remaining_seconds = 0 WHERE id = r.id;
  END LOOP;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
 WHERE table_name='redemption_logs' AND column_name IN ('timer_state','timer_remaining_seconds');
SELECT proname FROM pg_proc WHERE proname IN ('start_reward_timer','pause_reward_timer','confirm_redemption','cron_timer_alerts');
-- estado atual dos timers (os de Rafa devem ter virado 'paused')
SELECT reward_title, timer_state, timer_remaining_seconds FROM redemption_logs
 WHERE status='delivered' AND timer_state IS NOT NULL ORDER BY created_at DESC LIMIT 10;
