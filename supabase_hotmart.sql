-- RotinUp: Hotmart Webhook Helper
-- Executar no SQL Editor: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql

-- RPC chamada pelo Edge Function hotmart-webhook para encontrar o family_id do comprador
CREATE OR REPLACE FUNCTION public.get_family_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_family_id UUID;
BEGIN
  SELECT p.family_id INTO v_family_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE LOWER(u.email) = LOWER(p_email)
    AND p.role = 'parent'
  LIMIT 1;

  RETURN v_family_id;
END;
$$;
