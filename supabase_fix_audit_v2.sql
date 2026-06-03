-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fixes de Auditoria v2 (INDEPENDENTES DE ASSINATURA)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-03
-- CONTEXTO: o banco vivo divergiu do repo (ex: create_mission tem 12 params no
--   banco, 5 no .sql). Logo, estes fixes atuam em camadas que NÃO dependem da
--   assinatura das funções: trigger, default de coluna e CHECK constraint.
-- Rodar TUDO. Idempotente. Depois re-testar com o script de verificação.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- P0 — Auto-crédito / escalada via REST (BLOCO 1).
-- Causa: política UPDATE de profiles tem USING (id=auth.uid()) e WITH CHECK nulo
--        → qualquer coluna da própria linha é gravável (kidcoins=999999, role=admin).
-- Solução: trigger BEFORE UPDATE. Bloqueia colunas sensíveis SÓ quando a escrita
--        vem do cliente (current_user = authenticated/anon). RPCs SECURITY DEFINER
--        rodam como 'postgres' → passam (crédito legítimo continua funcionando).
-- Independe de qualquer assinatura de função.
-- ───────────────────────────────────────────────────────────────────────────
-- ATENÇÃO: SECURITY INVOKER (default — NÃO usar SECURITY DEFINER aqui).
--   Com SECURITY DEFINER, current_user vira 'postgres' DENTRO do trigger e a guarda
--   nunca dispara (escalada não bloqueada). Com SECURITY INVOKER, current_user
--   reflete quem disparou o UPDATE:
--     • REST direto do cliente → 'authenticated'/'anon' → BLOQUEIA
--     • RPC SECURITY DEFINER (review_mission, apply_demerit...) → 'postgres' → LIBERA
--   NÃO usar session_user: ele é sempre 'authenticator' em qualquer requisição
--   PostgREST, então bloquearia também o crédito legítimo dos RPCs.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NOT (OLD.role IS NULL AND NEW.role IN ('parent','child')) THEN
        RAISE EXCEPTION 'Alteração de papel não permitida';
      END IF;
    END IF;
    IF NEW.kidcoins       IS DISTINCT FROM OLD.kidcoins
    OR NEW.xp             IS DISTINCT FROM OLD.xp
    OR NEW.streak         IS DISTINCT FROM OLD.streak
    OR NEW.longest_streak IS DISTINCT FROM OLD.longest_streak
    OR NEW.family_id      IS DISTINCT FROM OLD.family_id THEN
      RAISE EXCEPTION 'Alteração não permitida nesta coluna';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();


-- ───────────────────────────────────────────────────────────────────────────
-- P0 — add_child: "null value in column id" (BLOCO 2).
-- Causa: profiles.id não tem DEFAULT; a função viva não atribui id.
-- Solução (independente de assinatura): default na coluna. Pais sempre passam
--   id=auth.uid() explicitamente (handle_new_user), então o default só atua para
--   filhos — exatamente o caso quebrado. Não há FK rígida de profiles.id → users
--   (filhos já existem com uuid próprio), então é seguro.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();


-- ───────────────────────────────────────────────────────────────────────────
-- P0 — Coins negativos/absurdos aceitos (BLOCO 4).
-- Causa: a função viva (12 params) não valida range.
-- Solução: CHECK na TABELA — pega qualquer INSERT/UPDATE, não importa a função.
--   NOT VALID = não revalida linhas antigas (test-data com 99999 fica), mas
--   bloqueia toda escrita NOVA fora do range. Camada à prova de divergência.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_coins_nonneg;
ALTER TABLE public.missions ADD  CONSTRAINT missions_coins_nonneg
  CHECK (coins_reward >= 0 AND coins_reward <= 1000
     AND xp_reward    >= 0 AND xp_reward    <= 1000) NOT VALID;


-- ───────────────────────────────────────────────────────────────────────────
-- P1 — Resgate atômico (race → saldo negativo). Assinaturas CONFIRMADAS no
--   BLOCO 6: request_redemption_bulk(uuid,integer) e request_redemption(uuid)
--   batem com estas → CREATE OR REPLACE substitui de fato (sem criar overload).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_redemption_bulk(
  p_reward_id UUID, p_quantity INT DEFAULT 1
) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child public.profiles%ROWTYPE; v_reward public.rewards%ROWTYPE;
  v_total INT; v_log_ids UUID[] := '{}'; v_log_id UUID; i INT;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN RAISE EXCEPTION 'Quantidade inválida (1-20)'; END IF;
  SELECT * INTO v_child FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards
   WHERE id = p_reward_id AND is_active = true AND family_id = v_child.family_id;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'Recompensa não encontrada ou inativa'; END IF;
  v_total := v_reward.coin_cost * p_quantity;

  UPDATE public.profiles SET kidcoins = kidcoins - v_total
   WHERE id = auth.uid() AND COALESCE(kidcoins,0) >= v_total;
  IF NOT FOUND THEN RAISE EXCEPTION 'KidCoins insuficientes (precisa de % 🪙)', v_total; END IF;

  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.redemption_logs
      (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
    VALUES (auth.uid(), v_child.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
    RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;
  RETURN v_log_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_redemption(p_reward_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_child public.profiles%ROWTYPE; v_reward public.rewards%ROWTYPE; v_log_id UUID;
BEGIN
  SELECT * INTO v_child FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards
   WHERE id = p_reward_id AND is_active = true AND family_id = v_child.family_id;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'Recompensa não encontrada ou inativa'; END IF;
  UPDATE public.profiles SET kidcoins = kidcoins - v_reward.coin_cost
   WHERE id = auth.uid() AND COALESCE(kidcoins,0) >= v_reward.coin_cost;
  IF NOT FOUND THEN RAISE EXCEPTION 'KidCoins insuficientes'; END IF;
  INSERT INTO public.redemption_logs
    (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
  VALUES (auth.uid(), v_child.family_id, p_reward_id, v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- P1 — apply_demerit logava p_coins cheio (clamp em 0) → gap de reconciliação.
--   Solução: logar o valor REAL deduzido = LEAST(p_coins, saldo).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_demerit(
  p_child_id UUID, p_title TEXT, p_emoji TEXT DEFAULT '⚠️', p_coins INT DEFAULT 0
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller public.profiles%ROWTYPE; v_child public.profiles%ROWTYPE; v_before INT; v_actual INT;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_child  FROM public.profiles WHERE id = p_child_id;
  IF v_caller.role NOT IN ('parent','admin') THEN RAISE EXCEPTION 'Apenas responsáveis podem aplicar tropeços'; END IF;
  IF v_caller.family_id IS DISTINCT FROM v_child.family_id THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_coins < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  v_before := COALESCE(v_child.kidcoins, 0);
  v_actual := LEAST(p_coins, v_before);
  UPDATE public.profiles SET kidcoins = v_before - v_actual WHERE id = p_child_id;
  INSERT INTO public.demerit_logs (child_id, family_id, title, emoji, coins_deducted, created_by)
  VALUES (p_child_id, v_child.family_id, p_title, p_emoji, v_actual, auth.uid());
END;
$$;


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO RÁPIDA (rodar após o NOTIFY)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_profile_columns';      -- 1 linha
SELECT column_default FROM information_schema.columns
 WHERE table_name='profiles' AND column_name='id';                               -- gen_random_uuid()
SELECT conname FROM pg_constraint WHERE conname = 'missions_coins_nonneg';        -- 1 linha
