-- Fix: admin users têm acesso completo às RPCs de família
-- Root cause: múltiplas RPCs e a view pending_approvals checavam role = 'parent',
-- excluindo usuários com role = 'admin' (criadores de família).

-- ── 1. parent_check_mission ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION parent_check_mission(p_child_id UUID, p_mission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_family UUID;
  v_child_family  UUID;
  v_coins         INT;
  v_xp            INT;
  v_frequency     TEXT;
  v_today         DATE := CURRENT_DATE;
  v_cutoff        DATE;
BEGIN
  SELECT family_id INTO v_caller_family
    FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');
  IF v_caller_family IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  SELECT family_id INTO v_child_family
    FROM profiles WHERE id = p_child_id AND role = 'child';
  IF v_child_family IS NULL OR v_child_family <> v_caller_family THEN
    RAISE EXCEPTION 'Filho não pertence à sua família';
  END IF;

  SELECT coins_reward, xp_reward, frequency
    INTO v_coins, v_xp, v_frequency
    FROM missions
   WHERE id = p_mission_id AND family_id = v_caller_family AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missão não encontrada ou inativa';
  END IF;

  v_cutoff := CASE v_frequency
    WHEN 'weekly'   THEN v_today - 6
    WHEN 'biweekly' THEN v_today - 13
    WHEN 'monthly'  THEN v_today - 29
    ELSE v_today
  END;

  IF EXISTS (
    SELECT 1 FROM mission_logs
     WHERE child_id = p_child_id
       AND mission_id = p_mission_id
       AND due_date >= v_cutoff
       AND status IN ('pending','approved')
  ) THEN
    RAISE EXCEPTION 'Missão já registrada neste período';
  END IF;

  INSERT INTO mission_logs (child_id, mission_id, family_id, due_date, status, reviewed_by, review_note)
  VALUES (p_child_id, p_mission_id, v_caller_family, v_today, 'approved', auth.uid(), 'Marcado pelo responsável ✅');

  UPDATE profiles
     SET xp        = xp + v_xp,
         kidcoins  = kidcoins + v_coins
   WHERE id = p_child_id;

  UPDATE profiles
     SET streak = CASE
           WHEN EXISTS (
             SELECT 1 FROM mission_logs
              WHERE child_id = p_child_id AND status = 'approved' AND due_date = v_today - 1
           ) THEN streak + 1
           ELSE 1
         END
   WHERE id = p_child_id;
END;
$$;

-- ── 2. pending_approvals view ─────────────────────────────────────────────────
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
JOIN profiles parent ON parent.family_id = p.family_id AND parent.role IN ('parent', 'admin')
WHERE ml.status = 'pending'
  AND parent.id = auth.uid();

-- ── 3. add_child ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_child(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.add_child(TEXT, INTEGER, TEXT, DATE);
DROP FUNCTION IF EXISTS public.add_child(TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION add_child(
  p_display_name TEXT,
  p_age          INTEGER DEFAULT NULL,
  p_avatar_emoji TEXT    DEFAULT '👦',
  p_birth_date   DATE    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_child_id  UUID := gen_random_uuid();
  v_age       INTEGER;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada. Crie uma família primeiro.';
  END IF;

  v_age := CASE
    WHEN p_birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(p_birth_date))::INTEGER
    ELSE p_age
  END;

  INSERT INTO profiles (id, family_id, role, display_name, age, birth_date, avatar_emoji, xp, kidcoins, streak)
  VALUES (v_child_id, v_family_id, 'child', p_display_name, v_age, p_birth_date, p_avatar_emoji, 0, 0, 0);

  RETURN v_child_id;
END;
$$;

-- ── 4. update_child ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_child(
  p_child_id     UUID,
  p_display_name TEXT DEFAULT NULL,
  p_birth_date   DATE DEFAULT NULL,
  p_avatar_emoji TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_child_id AND family_id = v_family_id AND role = 'child'
  ) THEN
    RAISE EXCEPTION 'Criança não encontrada ou sem permissão';
  END IF;

  UPDATE profiles SET
    display_name = COALESCE(p_display_name, display_name),
    birth_date   = COALESCE(p_birth_date, birth_date),
    age          = CASE
                     WHEN p_birth_date IS NOT NULL
                     THEN EXTRACT(YEAR FROM AGE(p_birth_date))::INTEGER
                     ELSE age
                   END,
    avatar_emoji = COALESCE(p_avatar_emoji, avatar_emoji)
  WHERE id = p_child_id;
END;
$$;

-- ── 5. delete_child ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_child(p_child_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_child_id AND family_id = v_family_id AND role = 'child'
  ) THEN
    RAISE EXCEPTION 'Criança não encontrada ou sem permissão';
  END IF;

  DELETE FROM mission_logs      WHERE child_id = p_child_id;
  DELETE FROM child_achievements WHERE child_id = p_child_id;
  DELETE FROM profiles           WHERE id = p_child_id;
END;
$$;

-- ── 6. generate_invite_code ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;

  LOOP
    v_code := upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM families WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  UPDATE families SET invite_code = v_code WHERE id = v_family_id;
  RETURN v_code;
END;
$$;

-- ── 7. get_invite_code ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id UUID;
  v_code TEXT;
BEGIN
  SELECT family_id INTO v_family_id
  FROM profiles WHERE id = auth.uid() AND role IN ('parent', 'admin');

  IF v_family_id IS NULL THEN RETURN NULL; END IF;

  SELECT invite_code INTO v_code FROM families WHERE id = v_family_id;
  RETURN v_code;
END;
$$;

-- ── 8. update_display_name ────────────────────────────────────────────────────
-- Já não tem restrição de role, mas confirmar que funciona para admin
CREATE OR REPLACE FUNCTION update_display_name(p_display_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(trim(p_display_name)) < 2 THEN
    RAISE EXCEPTION 'Nome muito curto';
  END IF;
  UPDATE profiles SET display_name = trim(p_display_name) WHERE id = auth.uid();
END;
$$;

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
