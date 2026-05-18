-- RotinUp: Admin — Remover família
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- RPC chamada pelo painel admin para deletar uma família e todos seus dados
CREATE OR REPLACE FUNCTION public.admin_delete_family(p_family_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Verificar se o caller é admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Deletar a família (CASCADE remove profiles, missions, logs, etc.)
  DELETE FROM public.families WHERE id = p_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Família não encontrada';
  END IF;
END;
$$;
