-- RotinUp: Cancelamento de solicitações de resgate
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- 1. Adicionar status 'cancelled' ao CHECK constraint
ALTER TABLE public.redemption_logs
  DROP CONSTRAINT IF EXISTS redemption_logs_status_check;

ALTER TABLE public.redemption_logs
  ADD CONSTRAINT redemption_logs_status_check
  CHECK (status IN ('pending', 'delivered', 'cancelled'));

-- 2. RPC: responsável cancela solicitação e devolve coins à criança
CREATE OR REPLACE FUNCTION public.cancel_redemption(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_log public.redemption_logs%ROWTYPE;
BEGIN
  -- Buscar o log e garantir que pertence à família do caller
  SELECT * INTO v_log
  FROM public.redemption_logs
  WHERE id = p_log_id
    AND family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    );

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou sem permissão';
  END IF;

  IF v_log.status <> 'pending' THEN
    RAISE EXCEPTION 'Só é possível cancelar solicitações pendentes';
  END IF;

  -- Marcar como cancelado
  UPDATE public.redemption_logs
  SET status = 'cancelled'
  WHERE id = p_log_id;

  -- Devolver coins à criança
  UPDATE public.profiles
  SET kidcoins = kidcoins + v_log.coin_cost
  WHERE id = v_log.child_id;
END;
$$;
