-- RotinUp: Exclusão de conta (LGPD)
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20
-- ATENÇÃO: A exclusão do registro em auth.users é feita no frontend via
--          supabase.auth.admin.deleteUser() com service role (não pode ser feita
--          dentro de uma SECURITY DEFINER function por limitação do Supabase Auth).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller     profiles%ROWTYPE;
  v_family     families%ROWTYPE;
  v_parent_cnt INT;
  v_was_owner  BOOLEAN := false;
  v_fam_deleted BOOLEAN := false;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  -- ── CRIANÇA ────────────────────────────────────────────────────────────────
  IF v_caller.role = 'child' THEN
    DELETE FROM mission_logs      WHERE child_id = auth.uid();
    DELETE FROM child_achievements WHERE child_id = auth.uid();
    DELETE FROM redemption_logs   WHERE child_id = auth.uid();
    DELETE FROM demerit_logs      WHERE child_id = auth.uid();
    DELETE FROM profiles          WHERE id = auth.uid();

    RETURN jsonb_build_object('deleted', true, 'was_owner', false, 'family_deleted', false);
  END IF;

  -- ── RESPONSÁVEL / ADMIN ───────────────────────────────────────────────────
  IF v_caller.family_id IS NOT NULL THEN
    SELECT * INTO v_family FROM families WHERE id = v_caller.family_id;

    v_was_owner := (v_family.owner_id = auth.uid());

    SELECT COUNT(*) INTO v_parent_cnt
    FROM profiles
    WHERE family_id = v_caller.family_id AND role IN ('parent', 'admin') AND id <> auth.uid();

    -- Dono e único responsável → apaga família inteira
    IF v_was_owner AND v_parent_cnt = 0 THEN
      DELETE FROM demerit_logs   WHERE family_id = v_caller.family_id;
      DELETE FROM redemption_logs WHERE family_id = v_caller.family_id;
      DELETE FROM mission_logs   WHERE child_id IN (
        SELECT id FROM profiles WHERE family_id = v_caller.family_id
      );
      DELETE FROM child_achievements WHERE child_id IN (
        SELECT id FROM profiles WHERE family_id = v_caller.family_id
      );
      DELETE FROM push_subscriptions WHERE user_id IN (
        SELECT id FROM profiles WHERE family_id = v_caller.family_id
      );
      DELETE FROM missions WHERE family_id = v_caller.family_id;
      DELETE FROM rewards  WHERE family_id = v_caller.family_id;
      DELETE FROM profiles WHERE family_id = v_caller.family_id;
      DELETE FROM families WHERE id = v_caller.family_id;

      v_fam_deleted := true;
    ELSE
      -- Co-responsável ou dono com outros responsáveis → só desvincula
      UPDATE profiles SET family_id = NULL WHERE id = auth.uid();
      DELETE FROM profiles WHERE id = auth.uid();
    END IF;
  ELSE
    DELETE FROM profiles WHERE id = auth.uid();
  END IF;

  RETURN jsonb_build_object('deleted', true, 'was_owner', v_was_owner, 'family_deleted', v_fam_deleted);
END;
$$;

NOTIFY pgrst, 'reload schema';
