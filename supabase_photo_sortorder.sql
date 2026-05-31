-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Remove photo_url + sort_order nas missões
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-31
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Remover photo_url da mission_logs (dado sensível de menores)
ALTER TABLE public.mission_logs DROP COLUMN IF EXISTS photo_url;

-- 2. Recriar pending_approvals sem photo_url
CREATE OR REPLACE VIEW public.pending_approvals AS
SELECT
  ml.id               AS log_id,
  m.title             AS mission_title,
  m.emoji             AS mission_emoji,
  m.coins_reward,
  m.xp_reward,
  m.frequency         AS mission_frequency,
  p.display_name      AS child_name,
  p.avatar_emoji      AS child_avatar,
  p.id                AS child_id,
  ml.child_note,
  ml.created_at       AS submitted_at,
  ml.occurrence,
  ml.family_id
FROM mission_logs ml
JOIN missions m ON m.id = ml.mission_id
JOIN profiles p ON p.id = ml.child_id
WHERE ml.status = 'pending';

-- 3. Adicionar sort_order nas missões
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Inicializar sort_order pelas missões existentes (ordem de criação)
UPDATE public.missions
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY family_id ORDER BY created_at) - 1 AS rn
  FROM public.missions
) sub
WHERE missions.id = sub.id;

-- 4. RPC para salvar nova ordem (array de {id, sort_order})
CREATE OR REPLACE FUNCTION public.reorder_missions(p_orders JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  item        JSONB;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');
  IF v_family_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_orders)
  LOOP
    UPDATE missions
    SET sort_order = (item->>'sort_order')::INT
    WHERE id = (item->>'id')::UUID
      AND family_id = v_family_id;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Verificação
SELECT column_name FROM information_schema.columns
WHERE table_name = 'missions' AND column_name = 'sort_order';
-- Esperado: 1 linha

SELECT column_name FROM information_schema.columns
WHERE table_name = 'mission_logs' AND column_name = 'photo_url';
-- Esperado: 0 linhas
