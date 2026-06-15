-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Resgate em 3 etapas: solicitar → aprovar → entregar
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-14
-- Opção A: coins saem no PEDIDO (reservados). Recusar/cancelar estorna.
-- Status: requested (aguardando aprovação) → approved (aguardando entrega)
--         → delivered (entregue) | cancelled (estornado)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. CHECK de status + migração dos pendentes atuais ─────────────────────
ALTER TABLE public.redemption_logs DROP CONSTRAINT IF EXISTS redemption_logs_status_check;
ALTER TABLE public.redemption_logs ADD  CONSTRAINT redemption_logs_status_check
  CHECK (status IN ('requested','approved','delivered','cancelled','pending'));

-- No modelo antigo, 'pending' = aguardando entrega (já passou a "aprovação" implícita).
-- Migramos os pendentes atuais (1h videogame, etc.) para 'approved' = aguardando entrega.
UPDATE public.redemption_logs SET status = 'approved' WHERE status = 'pending';

-- ─── 2. Pedido da criança → nasce 'requested' (coins reservados) ────────────
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
    INSERT INTO redemption_logs (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name, status)
    VALUES (auth.uid(), v_child.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name, 'requested')
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
  INSERT INTO redemption_logs (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name, status)
  VALUES (auth.uid(), v_child.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name, 'requested')
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END; $$;

-- ─── 3. Adulto APROVA: requested → approved ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.role NOT IN ('parent','admin') THEN RAISE EXCEPTION 'Apenas responsáveis podem aprovar resgates'; END IF;
  UPDATE redemption_logs SET status = 'approved'
   WHERE id = p_log_id AND family_id = v_caller.family_id AND status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada ou já processada'; END IF;
END; $$;

-- ─── 4. Adulto ENTREGA: approved → delivered ────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.role NOT IN ('parent','admin') THEN RAISE EXCEPTION 'Apenas responsáveis podem confirmar entregas'; END IF;
  UPDATE redemption_logs SET status = 'delivered', delivered_at = now()
   WHERE id = p_log_id AND family_id = v_caller.family_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Resgate não encontrado ou ainda não aprovado'; END IF;
END; $$;

-- ─── 5. Cancelar/Recusar: requested OU approved → cancelled (estorna) ────────
CREATE OR REPLACE FUNCTION public.cancel_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller profiles%ROWTYPE; v_log redemption_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_log FROM redemption_logs WHERE id = p_log_id AND family_id = v_caller.family_id;
  IF v_log.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada ou sem permissão'; END IF;
  IF v_caller.role = 'child' AND v_log.child_id <> auth.uid() THEN
    RAISE EXCEPTION 'Você só pode cancelar seus próprios resgates';
  END IF;
  IF v_log.status NOT IN ('requested','approved') THEN
    RAISE EXCEPTION 'Só é possível cancelar solicitações pendentes ou aprovadas';
  END IF;
  UPDATE redemption_logs SET status = 'cancelled' WHERE id = p_log_id;
  UPDATE profiles SET kidcoins = kidcoins + v_log.coin_cost WHERE id = v_log.child_id;
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT status, COUNT(*) FROM redemption_logs GROUP BY status ORDER BY status;
SELECT proname FROM pg_proc WHERE proname IN ('approve_redemption','confirm_redemption','cancel_redemption','request_redemption_bulk');
