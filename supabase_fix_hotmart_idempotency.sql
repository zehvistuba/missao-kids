-- RotinUp - Hotmart idempotente, ordenado e com multiplos direitos ativos.
-- Data: 2026-08-12
--
-- Ordem de deploy:
--   1. Aplicar este SQL no banco vivo e executar a verificacao final.
--   2. Publicar supabase/functions/hotmart-webhook.
--   3. Enviar eventos sandbox fora de ordem e repetidos (matriz abaixo).
--
-- O script e transacional e preserva hotmart_events existentes. O payload novo
-- e minimizado na Edge Function para nao persistir documento/endereco do comprador.

BEGIN;

ALTER TABLE public.hotmart_events
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS event_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transaction_code TEXT,
  ADD COLUMN IF NOT EXISTS subscription_code TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS hotmart_events_event_id_uidx
  ON public.hotmart_events (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hotmart_events_buyer_order_idx
  ON public.hotmart_events (lower(buyer_email), event_created_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hotmart_entitlements (
  entitlement_key   TEXT PRIMARY KEY,
  buyer_email       TEXT NOT NULL,
  family_id         UUID REFERENCES public.families(id) ON DELETE SET NULL,
  status            TEXT NOT NULL CHECK (status IN ('premium', 'free')),
  event_created_at  TIMESTAMPTZ NOT NULL,
  event_priority    SMALLINT NOT NULL DEFAULT 0,
  source_event_id   TEXT NOT NULL,
  transaction_code  TEXT,
  subscription_code TEXT,
  access_until      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hotmart_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_entitlements
  ADD COLUMN IF NOT EXISTS event_priority SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_until TIMESTAMPTZ;

REVOKE ALL ON TABLE public.hotmart_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hotmart_entitlements TO service_role;

CREATE INDEX IF NOT EXISTS hotmart_entitlements_buyer_status_idx
  ON public.hotmart_entitlements (lower(buyer_email), status);
CREATE INDEX IF NOT EXISTS hotmart_entitlements_family_status_idx
  ON public.hotmart_entitlements (family_id, status);

-- Converte o historico para o novo modelo. Quando o payload antigo nao possui
-- transacao/assinatura, preserva a semantica anterior: ultimo evento por email.
WITH source AS (
  SELECT
    lower(trim(he.buyer_email)) AS buyer_email,
    he.family_id,
    he.event,
    CASE
      WHEN COALESCE(he.payload->>'creation_date', '') ~ '^[0-9]{10,16}$'
        THEN to_timestamp((he.payload->>'creation_date')::double precision / 1000.0)
      ELSE he.created_at
    END AS event_time,
    COALESCE(NULLIF(he.payload->>'id', ''), 'legacy:' || he.id::text) AS source_event_id,
    NULLIF(he.payload#>>'{data,purchase,transaction}', '') AS transaction_code,
    COALESCE(
      NULLIF(he.payload#>>'{data,subscription,subscriber,code}', ''),
      NULLIF(he.payload#>>'{data,subscription,subscriber_code}', ''),
      NULLIF(he.payload#>>'{data,subscriber,code}', ''),
      NULLIF(he.payload#>>'{data,subscription,id}', '')
    ) AS subscription_code,
    CASE
      WHEN he.event = 'SUBSCRIPTION_CANCELLATION'
       AND COALESCE(he.payload#>>'{data,date_next_charge}', '') ~ '^[0-9]{10,16}$'
        THEN to_timestamp((he.payload#>>'{data,date_next_charge}')::double precision / 1000.0)
      ELSE NULL
    END AS access_until
  FROM public.hotmart_events he
  WHERE he.event IN (
    'PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'PURCHASE_CANCELED',
    'PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'SUBSCRIPTION_CANCELLATION'
  )
    AND NULLIF(trim(he.buyer_email), '') IS NOT NULL
), normalized AS (
  SELECT
    COALESCE(
      'subscriber:' || NULLIF(subscription_code, ''),
      'transaction:' || NULLIF(transaction_code, ''),
      'legacy-email:' || buyer_email
    ) AS entitlement_key,
    buyer_email,
    family_id,
    CASE WHEN event IN ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE')
      THEN 'premium' ELSE 'free' END AS status,
    CASE WHEN event IN ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE')
      THEN 1 ELSE 2 END AS event_priority,
    event_time,
    source_event_id,
    transaction_code,
    subscription_code,
    access_until
  FROM source
), latest AS (
  SELECT DISTINCT ON (entitlement_key) *
  FROM normalized
  ORDER BY entitlement_key, event_time DESC, event_priority DESC, source_event_id DESC
)
INSERT INTO public.hotmart_entitlements (
  entitlement_key, buyer_email, family_id, status, event_created_at, event_priority,
  source_event_id, transaction_code, subscription_code, access_until
)
SELECT
  entitlement_key, buyer_email, family_id, status, event_time, event_priority,
  source_event_id, transaction_code, subscription_code, access_until
FROM latest
ON CONFLICT (entitlement_key) DO UPDATE
SET buyer_email = EXCLUDED.buyer_email,
    family_id = COALESCE(EXCLUDED.family_id, hotmart_entitlements.family_id),
    status = EXCLUDED.status,
    event_created_at = EXCLUDED.event_created_at,
    event_priority = EXCLUDED.event_priority,
    source_event_id = EXCLUDED.source_event_id,
    transaction_code = EXCLUDED.transaction_code,
    subscription_code = EXCLUDED.subscription_code,
    access_until = EXCLUDED.access_until,
    updated_at = now()
WHERE (EXCLUDED.event_created_at, EXCLUDED.event_priority, EXCLUDED.source_event_id) >
      (hotmart_entitlements.event_created_at, hotmart_entitlements.event_priority, hotmart_entitlements.source_event_id);

CREATE OR REPLACE FUNCTION public.process_hotmart_event(
  p_event_id TEXT,
  p_event TEXT,
  p_buyer_email TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_entitlement_key TEXT,
  p_new_plan TEXT,
  p_transaction_code TEXT DEFAULT NULL,
  p_subscription_code TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_buyer_email));
  v_log_id UUID;
  v_family_id UUID;
  v_effective_plan TEXT;
  v_applied BOOLEAN := false;
  v_access_until TIMESTAMPTZ;
BEGIN
  IF NULLIF(trim(p_event_id), '') IS NULL
     OR NULLIF(trim(p_entitlement_key), '') IS NULL
     OR NULLIF(v_email, '') IS NULL
     OR p_event_created_at IS NULL THEN
    RAISE EXCEPTION 'Evento Hotmart incompleto';
  END IF;
  IF p_new_plan NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano Hotmart invalido';
  END IF;
  IF (p_event IN ('PURCHASE_APPROVED', 'PURCHASE_COMPLETE') AND p_new_plan <> 'premium')
     OR (p_event IN ('PURCHASE_CANCELED', 'PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'SUBSCRIPTION_CANCELLATION') AND p_new_plan <> 'free')
     OR p_event NOT IN (
       'PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'PURCHASE_CANCELED',
       'PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'SUBSCRIPTION_CANCELLATION'
     ) THEN
    RAISE EXCEPTION 'Evento/plano Hotmart inconsistente';
  END IF;

  -- Serializa eventos do mesmo comprador e elimina corrida entre assinaturas.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  INSERT INTO public.hotmart_events (
    event_id, event, buyer_email, payload, event_created_at,
    transaction_code, subscription_code, processing_status
  ) VALUES (
    trim(p_event_id), p_event, v_email, COALESCE(p_payload, '{}'::jsonb),
    p_event_created_at, p_transaction_code, p_subscription_code, 'received'
  )
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'eventId', p_event_id
    );
  END IF;

  SELECT f.id INTO v_family_id
  FROM public.families f
  WHERE lower(f.hotmart_buyer_email) = v_email
  ORDER BY f.created_at
  LIMIT 1;

  IF v_family_id IS NULL THEN
    SELECT p.family_id INTO v_family_id
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE lower(u.email) = v_email
      AND p.role IN ('parent', 'admin')
      AND p.family_id IS NOT NULL
    ORDER BY p.created_at
    LIMIT 1;
  END IF;

  v_access_until := CASE
    WHEN p_event = 'SUBSCRIPTION_CANCELLATION'
     AND COALESCE(p_payload#>>'{data,date_next_charge}', '') ~ '^[0-9]{10,16}$'
      THEN to_timestamp((p_payload#>>'{data,date_next_charge}')::double precision / 1000.0)
    ELSE NULL
  END;

  INSERT INTO public.hotmart_entitlements (
    entitlement_key, buyer_email, family_id, status, event_created_at, event_priority,
    source_event_id, transaction_code, subscription_code, access_until
  ) VALUES (
    trim(p_entitlement_key), v_email, v_family_id, p_new_plan, p_event_created_at,
    CASE WHEN p_new_plan = 'free' THEN 2 ELSE 1 END,
    trim(p_event_id), p_transaction_code, p_subscription_code, v_access_until
  )
  ON CONFLICT (entitlement_key) DO UPDATE
  SET buyer_email = EXCLUDED.buyer_email,
      family_id = COALESCE(EXCLUDED.family_id, hotmart_entitlements.family_id),
      status = EXCLUDED.status,
      event_created_at = EXCLUDED.event_created_at,
      event_priority = EXCLUDED.event_priority,
      source_event_id = EXCLUDED.source_event_id,
      transaction_code = EXCLUDED.transaction_code,
      subscription_code = EXCLUDED.subscription_code,
      access_until = EXCLUDED.access_until,
      updated_at = now()
  WHERE (EXCLUDED.event_created_at, EXCLUDED.event_priority, EXCLUDED.source_event_id) >
        (hotmart_entitlements.event_created_at, hotmart_entitlements.event_priority, hotmart_entitlements.source_event_id)
  RETURNING source_event_id = trim(p_event_id) INTO v_applied;

  v_applied := COALESCE(v_applied, false);

  IF v_family_id IS NOT NULL THEN
    UPDATE public.hotmart_entitlements
    SET family_id = v_family_id, updated_at = now()
    WHERE lower(buyer_email) = v_email AND family_id IS NULL;

    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM public.hotmart_entitlements e
      WHERE (e.status = 'premium' OR (e.status = 'free' AND e.access_until > now()))
        AND (e.family_id = v_family_id OR lower(e.buyer_email) = v_email)
    ) THEN 'premium' ELSE 'free' END
    INTO v_effective_plan;

    UPDATE public.families
    SET plan = v_effective_plan,
        hotmart_buyer_email = v_email,
        max_co_parents = CASE WHEN v_effective_plan = 'premium' THEN 10 ELSE 1 END
    WHERE id = v_family_id;
  END IF;

  UPDATE public.hotmart_events
  SET family_id = v_family_id,
      processing_status = CASE
        WHEN NOT v_applied THEN 'ignored_stale'
        WHEN v_family_id IS NULL THEN 'unlinked'
        ELSE 'processed'
      END,
      processed_at = now()
  WHERE id = v_log_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'applied', v_applied,
    'linked', v_family_id IS NOT NULL,
    'familyId', v_family_id,
    'plan', v_effective_plan,
    'eventId', p_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_hotmart_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_hotmart_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_premium_by_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email TEXT;
  v_family_id UUID;
  v_entitlement_count INT;
  v_effective_plan TEXT;
BEGIN
  SELECT lower(u.email), p.family_id
  INTO v_email, v_family_id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid()
    AND p.role IN ('parent', 'admin');

  IF v_family_id IS NULL OR v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sem_familia');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  UPDATE public.hotmart_entitlements
  SET family_id = v_family_id, updated_at = now()
  WHERE lower(buyer_email) = v_email AND family_id IS NULL;

  SELECT count(*), CASE WHEN bool_or(
    status = 'premium' OR (status = 'free' AND access_until > now())
  ) THEN 'premium' ELSE 'free' END
  INTO v_entitlement_count, v_effective_plan
  FROM public.hotmart_entitlements
  WHERE family_id = v_family_id OR lower(buyer_email) = v_email;

  IF v_entitlement_count > 0 THEN
    UPDATE public.families
    SET plan = v_effective_plan,
        hotmart_buyer_email = v_email,
        max_co_parents = CASE WHEN v_effective_plan = 'premium' THEN 10 ELSE 1 END
    WHERE id = v_family_id;

    RETURN jsonb_build_object(
      'ok', v_effective_plan = 'premium',
      'plan', v_effective_plan,
      'reason', CASE WHEN v_effective_plan = 'premium' THEN NULL ELSE 'sem_compra_ativa' END
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'sem_compra_ativa');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_premium_by_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_premium_by_email() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificacao: todos devem retornar true/valores coerentes.
SELECT
  to_regclass('public.hotmart_entitlements') IS NOT NULL AS entitlement_table_ok,
  to_regprocedure('public.process_hotmart_event(text,text,text,timestamptz,text,text,text,text,jsonb)') IS NOT NULL AS processor_ok,
  has_function_privilege('anon', 'public.process_hotmart_event(text,text,text,timestamptz,text,text,text,text,jsonb)', 'EXECUTE') AS anon_execute_deve_ser_false,
  has_function_privilege('authenticated', 'public.process_hotmart_event(text,text,text,timestamptz,text,text,text,text,jsonb)', 'EXECUTE') AS authenticated_execute_deve_ser_false,
  has_function_privilege('service_role', 'public.process_hotmart_event(text,text,text,timestamptz,text,text,text,text,jsonb)', 'EXECUTE') AS service_execute_deve_ser_true;

-- QA obrigatorio apos deploy:
-- 1. APPROVED novo => premium; repetir mesmo id => duplicate=true.
-- 2. CANCELED mais novo => free; reenviar APPROVED antigo => ignored_stale.
-- 3. Duas entitlement_key premium; cancelar uma => familia continua premium.
-- 4. Compra antes da conta => linked=false; claim apos cadastro => premium.
-- 5. SUBSCRIPTION_CANCELLATION com date_next_charge futuro => premium ate a data;
--    claim apos a data => free. REFUND/CHARGEBACK continuam imediatos.
