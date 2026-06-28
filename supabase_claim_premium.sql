-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Pagamento: reconciliar Premium por e-mail (claim)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- Problema: quem paga no Hotmart ANTES de ter conta (ou cujo e-mail de login só
-- existe depois) não recebe Premium automático — o webhook não acha a família.
-- Solução: o app chama claim_premium_by_email (ao abrir e no botão "Já assinei").
-- A função olha hotmart_events pelo e-mail do usuário e ativa Premium se a última
-- movimentação for uma compra aprovada (e não cancelada/reembolsada depois).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_premium_by_email()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email  TEXT;
  v_family UUID;
  v_latest TEXT;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  SELECT family_id INTO v_family FROM profiles WHERE id = auth.uid() AND role IN ('parent','admin');
  IF v_family IS NULL OR v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sem_familia');
  END IF;

  -- evento mais recente de compra/cancelamento desse e-mail
  SELECT event INTO v_latest
    FROM hotmart_events
   WHERE lower(buyer_email) = v_email
     AND event IN ('PURCHASE_APPROVED','PURCHASE_COMPLETE',
                   'PURCHASE_CANCELED','PURCHASE_REFUNDED','PURCHASE_CHARGEBACK','SUBSCRIPTION_CANCELLATION')
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_latest IN ('PURCHASE_APPROVED','PURCHASE_COMPLETE') THEN
    UPDATE families
       SET plan = 'premium', hotmart_buyer_email = v_email, max_co_parents = 10
     WHERE id = v_family;
    RETURN jsonb_build_object('ok', true, 'plan', 'premium');
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_latest, 'sem_compra'));
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'claim_premium_by_email';
