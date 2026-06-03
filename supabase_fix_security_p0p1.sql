-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fixes de Auditoria P0 / P1
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-02
-- Rodar TUDO de uma vez. Cada bloco é idempotente (CREATE OR REPLACE / IF NOT EXISTS).
-- Depois validar com os scripts S8 (escalada), S2 (isolamento) e S3 (reconciliação).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- P0-1 — Escalada de privilégio: bloquear escrita direta do cliente em colunas
--        sensíveis de profiles (role, kidcoins, xp, streak, family_id).
-- Causa: App.jsx grava profiles direto (avatar/birth_date/role-default). A RLS é
--        row-level e não protege coluna → usuário podia fazer update({role:'admin'})
--        em si mesmo e virar admin (acesso a admin_get_families / admin_set_plan).
-- Solução: trigger que, SOMENTE quando a escrita vem do cliente direto
--        (current_user = authenticated/anon), rejeita mudança nas colunas críticas.
--        RPCs SECURITY DEFINER rodam como o dono (postgres) → não são bloqueadas.
-- Mantém funcionando: avatar_emoji, birth_date, age, display_name e o
--        default de role null→parent/child (login Google sem role).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só aplica para escrita direta do cliente (PostgREST). RPCs definer passam.
  IF current_user IN ('authenticated', 'anon') THEN

    -- role: permite apenas o default inicial null → parent/child. Nunca admin,
    -- nunca trocar um papel já existente.
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NOT (OLD.role IS NULL AND NEW.role IN ('parent', 'child')) THEN
        RAISE EXCEPTION 'Alteração de papel não permitida';
      END IF;
    END IF;

    -- Colunas financeiras / de vínculo: nunca editáveis direto pelo cliente.
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
-- P1-1 — Race no resgate (TOCTOU) → saldo negativo.
-- Causa: SELECT do saldo, valida, depois UPDATE kidcoins = kidcoins - total sem
--        revalidar. Dois resgates simultâneos furam para saldo negativo.
-- Solução: débito atômico condicional (WHERE kidcoins >= total). O lock de linha
--        do UPDATE serializa; se não houver saldo, NOT FOUND → aborta.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_redemption_bulk(
  p_reward_id UUID,
  p_quantity  INT DEFAULT 1
)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child    public.profiles%ROWTYPE;
  v_reward   public.rewards%ROWTYPE;
  v_total    INT;
  v_log_ids  UUID[] := '{}';
  v_log_id   UUID;
  i          INT;
BEGIN
  IF p_quantity < 1 OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Quantidade inválida (1-20)';
  END IF;

  SELECT * INTO v_child FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards
   WHERE id = p_reward_id AND is_active = true AND family_id = v_child.family_id;

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou inativa';
  END IF;

  v_total := v_reward.coin_cost * p_quantity;

  -- Débito ATÔMICO: só desconta se houver saldo. Imune a concorrência.
  UPDATE public.profiles
     SET kidcoins = kidcoins - v_total
   WHERE id = auth.uid()
     AND COALESCE(kidcoins, 0) >= v_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KidCoins insuficientes (precisa de % 🪙)', v_total;
  END IF;

  FOR i IN 1..p_quantity LOOP
    INSERT INTO public.redemption_logs
      (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
    VALUES
      (auth.uid(), v_child.family_id, p_reward_id,
       v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
    RETURNING id INTO v_log_id;
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;

  RETURN v_log_ids;
END;
$$;

-- Mesmo fix na versão single (caso algo ainda a chame)
CREATE OR REPLACE FUNCTION public.request_redemption(p_reward_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_child  public.profiles%ROWTYPE;
  v_reward public.rewards%ROWTYPE;
  v_log_id UUID;
BEGIN
  SELECT * INTO v_child FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_reward FROM public.rewards
   WHERE id = p_reward_id AND is_active = true AND family_id = v_child.family_id;

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'Recompensa não encontrada ou inativa';
  END IF;

  UPDATE public.profiles
     SET kidcoins = kidcoins - v_reward.coin_cost
   WHERE id = auth.uid()
     AND COALESCE(kidcoins, 0) >= v_reward.coin_cost;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KidCoins insuficientes';
  END IF;

  INSERT INTO public.redemption_logs
    (child_id, family_id, reward_id, reward_title, reward_emoji, coin_cost, child_name)
  VALUES
    (auth.uid(), v_child.family_id, p_reward_id,
     v_reward.title, v_reward.emoji, v_reward.coin_cost, v_child.display_name)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- P1-2 — apply_demerit registrava o valor cheio (p_coins) mesmo deduzindo menos
--        (clamp em 0), criando gap de reconciliação.
-- Solução: logar o valor REALMENTE deduzido = LEAST(p_coins, saldo_atual).
--        Mantém o clamp (criança não fica negativa) e o extrato passa a bater.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_demerit(
  p_child_id UUID,
  p_title    TEXT,
  p_emoji    TEXT DEFAULT '⚠️',
  p_coins    INT  DEFAULT 0
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller public.profiles%ROWTYPE;
  v_child  public.profiles%ROWTYPE;
  v_before INT;
  v_actual INT;
BEGIN
  SELECT * INTO v_caller FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_child  FROM public.profiles WHERE id = p_child_id;

  IF v_caller.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Apenas responsáveis podem aplicar tropeços';
  END IF;
  IF v_caller.family_id IS DISTINCT FROM v_child.family_id THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_coins < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  v_before := COALESCE(v_child.kidcoins, 0);
  v_actual := LEAST(p_coins, v_before);   -- nunca deduz além do saldo

  UPDATE public.profiles
     SET kidcoins = v_before - v_actual
   WHERE id = p_child_id;

  INSERT INTO public.demerit_logs (child_id, family_id, title, emoji, coins_deducted, created_by)
  VALUES (p_child_id, v_child.family_id, p_title, p_emoji, v_actual, auth.uid());
END;
$$;


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Trigger criado:
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_profile_columns';
-- Esperado: 1 linha

-- 2. Teste manual de escalada (rode logado como usuário comum no app, via S8):
--    update profiles set role='admin' where id=auth.uid()  →  deve falhar.

-- 3. Reconciliação (S3) deve parar de acusar gap causado por tropeço clampado.
