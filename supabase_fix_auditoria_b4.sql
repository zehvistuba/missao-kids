-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fix auditoria B4: join_family_by_code preserva o papel
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- ANTES: entrar por código forçava role='parent' — uma CRIANÇA (ChildJoin) virava
-- responsável; e o limite de co-responsáveis bloqueava a criança numa família free.
-- AGORA: preserva o papel existente (responsável continua responsável; criança
-- continua criança), e o limite de co-responsáveis só vale para quem entra como
-- responsável. Mantém todo o resto (lookup por código, "já pertence a família").
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.join_family_by_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_family_id UUID;
  v_family_name TEXT;
  v_max_co_parents INT;
  v_parent_count INT;
  v_my_role TEXT;
BEGIN
  SELECT id, name, COALESCE(max_co_parents, 2)
    INTO v_family_id, v_family_name, v_max_co_parents
    FROM families
   WHERE invite_code = upper(trim(p_code));

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Codigo de convite invalido ou expirado';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Voce ja pertence a uma familia';
  END IF;

  -- papel atual de quem está entrando (responsável vs criança)
  SELECT role::text INTO v_my_role FROM profiles WHERE id = auth.uid();

  -- limite de co-responsáveis só se aplica a quem entra como RESPONSÁVEL
  IF v_my_role = 'parent' THEN
    SELECT COUNT(*) INTO v_parent_count
      FROM profiles
     WHERE family_id = v_family_id AND role = 'parent';
    IF v_parent_count >= v_max_co_parents THEN
      RAISE EXCEPTION 'Limite de responsaveis atingido para esta familia';
    END IF;
  END IF;

  -- PRESERVA o papel (não força mais 'parent')
  UPDATE profiles SET family_id = v_family_id WHERE id = auth.uid();

  RETURN jsonb_build_object('family_id', v_family_id, 'family_name', v_family_name);
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT (pg_get_functiondef(oid) ILIKE '%role = ''parent'' WHERE id = auth.uid()%') AS ainda_forca_parent,
       (pg_get_functiondef(oid) ILIKE '%v_my_role = ''parent''%') AS tem_limite_condicional
FROM pg_proc WHERE proname = 'join_family_by_code';
-- esperado: ainda_forca_parent = false | tem_limite_condicional = true
