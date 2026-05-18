-- RotinUp: Painel Admin
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- 1. Lista todas as famílias com dados do responsável (só admin pode chamar)
CREATE OR REPLACE FUNCTION public.admin_get_families()
RETURNS TABLE (
  family_id    UUID,
  family_name  TEXT,
  plan         TEXT,
  parent_name  TEXT,
  parent_email TEXT,
  child_count  BIGINT,
  created_at   TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT email FROM auth.users WHERE id = auth.uid()) != 'zehvistuba@gmail.com' THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.plan,
    MIN(p.display_name),
    MIN(u.email),
    COUNT(DISTINCT c.id),
    f.created_at
  FROM public.families f
  LEFT JOIN public.profiles p  ON p.family_id = f.id AND p.role = 'parent'
  LEFT JOIN auth.users u        ON u.id = p.id
  LEFT JOIN public.profiles c  ON c.family_id = f.id AND c.role = 'child'
  GROUP BY f.id, f.name, f.plan, f.created_at
  ORDER BY f.created_at DESC;
END;
$$;

-- 2. Altera o plano de uma família (só admin pode chamar)
CREATE OR REPLACE FUNCTION public.admin_set_plan(p_family_id UUID, p_plan TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_plan NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido — use "free" ou "premium"';
  END IF;

  UPDATE public.families SET plan = p_plan WHERE id = p_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;
END;
$$;
