-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fase 2A: Recompensa de tempo (cronômetro + avisos)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-15
-- Recompensa pode ter duração (min). Ao ENTREGAR, liga um cronômetro (timer_ends_at).
-- Um pg_cron por minuto avisa "faltam ~5 min" e "acabou" via push (mesmo app fechado).
-- Depende do fluxo de 3 etapas (supabase_resgate_3etapas.sql) já aplicado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Schema ──────────────────────────────────────────────────────────────
ALTER TABLE public.rewards          ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE public.redemption_logs  ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE public.redemption_logs  ADD COLUMN IF NOT EXISTS timer_ends_at    TIMESTAMPTZ;
ALTER TABLE public.redemption_logs  ADD COLUMN IF NOT EXISTS timer_warned     BOOLEAN DEFAULT false;
ALTER TABLE public.redemption_logs  ADD COLUMN IF NOT EXISTS timer_done       BOOLEAN DEFAULT false;

-- ─── 2. Definir duração de uma recompensa (sem tocar no create/update_reward
--        vivo, que pode ter divergido) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_reward_duration(p_reward_id UUID, p_minutes INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fam UUID;
BEGIN
  SELECT family_id INTO v_fam FROM profiles WHERE id = auth.uid() AND role IN ('parent','admin');
  IF v_fam IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE rewards
     SET duration_minutes = NULLIF(GREATEST(COALESCE(p_minutes,0),0), 0)
   WHERE id = p_reward_id AND family_id = v_fam;
END; $$;

-- ─── 3. Pedido copia a duração da recompensa para o log (snapshot) ──────────
CREATE OR REPLACE FUNCTION public.request_redemption_bulk(p_reward_id UUID, p_quantity INT DEFAULT 1)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child profiles%ROWTYPE; v_reward rewards%ROWTYPE; v_total INT;
  v_log_ids UUID[] := '{}'; v_log_id UUID; i INT;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'Quantidade inválida (1-20)'; END IF;
  SELECT * INTO v_child FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND is_active = true AND family_id = v_child.family_id;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'Recompensa não encontrada ou inativa'; END IF;
  v_total := v_reward.coin_cost * p_quantity;
  UPDATE profiles SET kidcoins = kidcoins - v_total
   WHERE id = auth.uid() AND COALESCE(kidcoins, 0) >= v_total;
  IF NOT FOUND THEN RAISE EXCEPTION 'KidCoins insuficientes (precisa de % 🪙)', v_total; END IF;
  FOR i IN 1..p_quantity LOOP
    INSERT INTO redemption_logs (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name, status, duration_minutes)
    VALUES (auth.uid(), v_child.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name, 'requested', v_reward.duration_minutes)
    RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;
  RETURN v_log_ids;
END; $$;

CREATE OR REPLACE FUNCTION public.request_redemption(p_reward_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_child profiles%ROWTYPE; v_reward rewards%ROWTYPE; v_log_id UUID;
BEGIN
  SELECT * INTO v_child FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND is_active = true AND family_id = v_child.family_id;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'Recompensa não encontrada ou inativa'; END IF;
  UPDATE profiles SET kidcoins = kidcoins - v_reward.coin_cost
   WHERE id = auth.uid() AND COALESCE(kidcoins, 0) >= v_reward.coin_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'KidCoins insuficientes'; END IF;
  INSERT INTO redemption_logs (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name, status, duration_minutes)
  VALUES (auth.uid(), v_child.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name, 'requested', v_reward.duration_minutes)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END; $$;

-- ─── 4. Entregar liga o cronômetro quando há duração ────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.role NOT IN ('parent','admin') THEN RAISE EXCEPTION 'Apenas responsáveis podem confirmar entregas'; END IF;
  UPDATE redemption_logs
     SET status = 'delivered', delivered_at = now(),
         timer_ends_at = CASE WHEN COALESCE(duration_minutes,0) > 0
                              THEN now() + make_interval(mins => duration_minutes) ELSE NULL END
   WHERE id = p_log_id AND family_id = v_caller.family_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Resgate não encontrado ou ainda não aprovado'; END IF;
END; $$;

-- ─── 5. Cron de avisos do cronômetro (a cada minuto) ────────────────────────
CREATE OR REPLACE FUNCTION public.cron_timer_alerts()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret TEXT;
  v_key TEXT := 'sb_publishable_ZfA-HSNeYtqvf7CwJ5bU5g_1gplbHPI';
  r RECORD;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='rotinup_cron_secret' LIMIT 1;

  -- Aviso "faltam ~5 min" (entre 5 min antes e o fim, uma vez)
  FOR r IN
    SELECT id, family_id, reward_title, reward_emoji FROM redemption_logs
     WHERE status='delivered' AND timer_ends_at IS NOT NULL AND NOT timer_warned
       AND now() >= timer_ends_at - interval '5 minutes' AND now() < timer_ends_at
  LOOP
    PERFORM net.http_post(
      url := 'https://intieqgjmprxatvogxkh.supabase.co/functions/v1/push-notify',
      headers := jsonb_build_object('Authorization','Bearer '||v_key,'apikey',v_key,'x-cron-secret',v_secret,'Content-Type','application/json'),
      body := jsonb_build_object('family_id', r.family_id, 'title','⏰ Faltam ~5 minutos!', 'body', (r.reward_emoji||' '||r.reward_title||' está quase acabando. Vai terminando! ⏳'), 'url','/'));
    UPDATE redemption_logs SET timer_warned = true WHERE id = r.id;
  END LOOP;

  -- Aviso "acabou o tempo"
  FOR r IN
    SELECT id, family_id, reward_title, reward_emoji FROM redemption_logs
     WHERE status='delivered' AND timer_ends_at IS NOT NULL AND NOT timer_done AND now() >= timer_ends_at
  LOOP
    PERFORM net.http_post(
      url := 'https://intieqgjmprxatvogxkh.supabase.co/functions/v1/push-notify',
      headers := jsonb_build_object('Authorization','Bearer '||v_key,'apikey',v_key,'x-cron-secret',v_secret,'Content-Type','application/json'),
      body := jsonb_build_object('family_id', r.family_id, 'title','⏱️ Acabou o tempo!', 'body', (r.reward_emoji||' '||r.reward_title||' chegou ao fim. 🏁'), 'url','/'));
    UPDATE redemption_logs SET timer_done = true WHERE id = r.id;
  END LOOP;
END; $$;

-- Agendar (a cada minuto)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rotinup-timer-alerts';
SELECT cron.schedule('rotinup-timer-alerts', '* * * * *', $$ SELECT public.cron_timer_alerts(); $$);

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
 WHERE table_name='redemption_logs' AND column_name IN ('duration_minutes','timer_ends_at','timer_warned','timer_done');
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'rotinup-timer-alerts';
SELECT proname FROM pg_proc WHERE proname IN ('set_reward_duration','cron_timer_alerts');
