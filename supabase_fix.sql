-- ============================================================
-- FIX: handle_new_user trigger + backfill orphaned users
-- Cole este script no SQL Editor do Supabase dashboard
-- ============================================================

-- 1. Remove o trigger antigo (evita conflito)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Recria a função com search_path correto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public        -- ESSENCIAL: resolve o erro de search_path
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''),
      'parent'
    )
  )
  ON CONFLICT (id) DO NOTHING;   -- seguro: ignora se já existir
  RETURN NEW;
END;
$$;

-- 3. Recria o trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Backfill: cria perfis para usuários órfãos (registrados antes do fix)
--    Inclui o usuário de teste criado pelo diagnóstico (diagtest_delete@test.invalid)
INSERT INTO public.profiles (id, display_name, role)
SELECT
  au.id,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'display_name'), ''),
    split_part(au.email, '@', 1)
  ) AS display_name,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'role'), ''),
    'parent'
  ) AS role
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 5. Remove o usuário de teste criado pelo diagnóstico
--    (diagtest_delete@test.invalid — pode remover pelo dashboard se preferir)
DELETE FROM auth.users WHERE email = 'diagtest_delete@test.invalid';
