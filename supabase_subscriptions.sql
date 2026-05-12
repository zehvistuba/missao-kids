-- ─── Freemium: plano e assinaturas ──────────────────────────

-- 1. Coluna plan em families (free | premium)
ALTER TABLE families ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- 2. Tabela subscriptions (pronta para Stripe)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  plan                    TEXT NOT NULL DEFAULT 'premium', -- plano desta assinatura
  status                  TEXT NOT NULL DEFAULT 'active',  -- active | canceled | past_due | trialing
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT UNIQUE,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS para subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Família lê própria assinatura" ON subscriptions
  FOR SELECT USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 4. Função para ativar premium manualmente (antes do Stripe)
CREATE OR REPLACE FUNCTION set_family_plan(p_plan TEXT DEFAULT 'premium')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role = 'parent';

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;

  UPDATE families SET plan = p_plan WHERE id = v_family_id;
END;
$$;

-- 5. RPC que retorna o plano atual da família
CREATE OR REPLACE FUNCTION get_family_plan()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT f.plan INTO v_plan
  FROM families f
  JOIN profiles p ON p.family_id = f.id
  WHERE p.id = auth.uid();

  RETURN COALESCE(v_plan, 'free');
END;
$$;
