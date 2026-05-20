-- RotinUp: Remover co-responsável da família
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20

CREATE OR REPLACE FUNCTION public.remove_co_parent(p_target_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller  profiles%ROWTYPE;
  v_target  profiles%ROWTYPE;
  v_family  families%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_target FROM profiles WHERE id = p_target_id;

  IF v_caller.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Apenas responsáveis podem remover co-responsáveis';
  END IF;

  IF v_caller.family_id IS NULL OR v_caller.family_id IS DISTINCT FROM v_target.family_id THEN
    RAISE EXCEPTION 'Usuário não pertence à sua família';
  END IF;

  IF v_target.role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Este usuário não é um co-responsável';
  END IF;

  -- Não pode remover a si mesmo
  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode remover a si mesmo. Use "Sair da família" para isso.';
  END IF;

  -- Não pode remover o dono da família
  SELECT * INTO v_family FROM families WHERE id = v_caller.family_id;
  IF v_family.owner_id = p_target_id THEN
    RAISE EXCEPTION 'O criador da família não pode ser removido';
  END IF;

  UPDATE profiles SET family_id = NULL WHERE id = p_target_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
