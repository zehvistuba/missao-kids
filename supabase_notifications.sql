-- ─── Notificações Push + Frequência de Missões + Foto de Prova ──────────────

-- 1. Frequência nas missões (diária, semanal, quinzenal, mensal)
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'daily'
  CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly'));

-- 2. Foto de prova nos logs de missão
ALTER TABLE mission_logs
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 3. Atualizar a view pending_approvals para incluir photo_url
-- (recria a view com photo_url)
CREATE OR REPLACE VIEW pending_approvals AS
SELECT
  ml.id               AS log_id,
  ml.photo_url,
  m.title             AS mission_title,
  m.emoji             AS mission_emoji,
  m.coins_reward,
  m.xp_reward,
  p.display_name      AS child_name,
  p.avatar_emoji      AS child_avatar,
  p.id                AS child_id,
  ml.submitted_at
FROM mission_logs ml
JOIN missions m ON m.id = ml.mission_id
JOIN profiles p ON p.id = ml.child_id
JOIN profiles parent ON parent.family_id = p.family_id AND parent.role = 'parent'
WHERE ml.status = 'pending'
  AND parent.id = auth.uid();

-- 4. Tabela de subscriptions para Push Notifications (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_sub_own" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- 5. RPC para salvar/atualizar subscription (segurança extra)
CREATE OR REPLACE FUNCTION upsert_push_subscription(p_subscription JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO push_subscriptions (user_id, subscription, updated_at)
  VALUES (auth.uid(), p_subscription, NOW())
  ON CONFLICT (user_id) DO UPDATE SET subscription = p_subscription, updated_at = NOW();
END;
$$;

-- 6. RPC para buscar subscriptions de uma família (usado pelo Edge Function push-notify)
CREATE OR REPLACE FUNCTION get_family_push_subscriptions(p_family_id UUID)
RETURNS TABLE (subscription JSONB, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ps.subscription, ps.user_id
  FROM push_subscriptions ps
  JOIN profiles pr ON pr.id = ps.user_id
  WHERE pr.family_id = p_family_id;
END;
$$;

-- 7. Storage bucket mission-photos (rodar no dashboard Supabase Storage, não via SQL)
-- Crie o bucket "mission-photos" com acesso público
-- Ou execute via CLI: supabase storage create mission-photos --public

-- 8. Reload PostgREST
NOTIFY pgrst, 'reload schema';
