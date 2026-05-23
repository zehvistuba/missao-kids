-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Contas QA para Testes Automatizados v2
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- CORREÇÃO: raw_app_meta_data adicionado — obrigatório para GoTrue autenticar
-- ═══════════════════════════════════════════════════════════════════════════
-- IMPORTANTE: Se as contas já existem (7 linhas no BLOCO 3), pule para o
-- BLOCO 4 abaixo — ele corrige apenas o raw_app_meta_data sem recriar nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: Corrigir raw_app_meta_data nas contas já existentes (RODAR PRIMEIRO)
-- Resolve o erro "Database error querying schema" no login via GoTrue
-- ══════════════════════════════════════════════════════════════════════

UPDATE auth.users
SET raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb
WHERE email IN (
  'qa-free-pai@rotinup.test',
  'qa-free-filho@rotinup.test',
  'qa-premium-pai1@rotinup.test',
  'qa-premium-pai2@rotinup.test',
  'qa-premium-filho1@rotinup.test',
  'qa-premium-filho2@rotinup.test',
  'qa-premium-filho3@rotinup.test'
)
AND (raw_app_meta_data IS NULL OR raw_app_meta_data = '{}'::jsonb);

-- Verificar resultado (deve retornar 7 linhas com provider=email):
SELECT email, raw_app_meta_data
FROM auth.users
WHERE email LIKE 'qa-%@rotinup.test'
ORDER BY email;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: Criar usuários auth para família FREE BASIC
-- (só execute se BLOCO 3 retornou 0 linhas)
-- ══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_parent_id UUID := gen_random_uuid();
  v_child_id  UUID := gen_random_uuid();
  v_family_id UUID := gen_random_uuid();
BEGIN
  -- Pai FREE
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, role, aud,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at
  ) VALUES (
    v_parent_id, '00000000-0000-0000-0000-000000000000',
    'qa-free-pai@rotinup.test',
    crypt('QAFree2026!', gen_salt('bf')),
    NOW(), 'authenticated', 'authenticated',
    '{"display_name":"QA Pai Free"}',
    '{"provider":"email","providers":["email"]}',
    NOW(), NOW()
  ) ON CONFLICT (email) DO NOTHING;

  -- Filho FREE
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, role, aud,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at
  ) VALUES (
    v_child_id, '00000000-0000-0000-0000-000000000000',
    'qa-free-filho@rotinup.test',
    crypt('QAChild2026!', gen_salt('bf')),
    NOW(), 'authenticated', 'authenticated',
    '{"display_name":"QA Filho Free"}',
    '{"provider":"email","providers":["email"]}',
    NOW(), NOW()
  ) ON CONFLICT (email) DO NOTHING;

  -- Família FREE
  INSERT INTO public.families (id, name, plan, max_co_parents)
  VALUES (v_family_id, 'QA Free Basic', 'free', 1)
  ON CONFLICT DO NOTHING;

  -- Perfil pai
  INSERT INTO public.profiles (id, family_id, display_name, role, xp, kidcoins, streak)
  VALUES (v_parent_id, v_family_id, 'QA Pai Free', 'parent', 0, 0, 0)
  ON CONFLICT (id) DO UPDATE SET family_id = v_family_id, role = 'parent';

  -- Perfil filho
  INSERT INTO public.profiles (id, family_id, display_name, role, xp, kidcoins, streak, age)
  VALUES (v_child_id, v_family_id, 'QA Filho Free', 'child', 0, 100, 3, 10)
  ON CONFLICT (id) DO UPDATE SET family_id = v_family_id, role = 'child';

  -- Missões para a família FREE (exatamente 5 — no limite)
  INSERT INTO public.missions (family_id, title, emoji, frequency, coins_reward, xp_reward, is_active)
  VALUES
    (v_family_id, 'Arrumar a cama', '🛏️', 'daily', 20, 15, true),
    (v_family_id, 'Escovar os dentes', '🦷', 'daily', 10, 8, true),
    (v_family_id, 'Fazer o dever', '📚', 'daily', 30, 25, true),
    (v_family_id, 'Organizar o quarto', '🧹', 'weekly', 50, 40, true),
    (v_family_id, 'Ler 15 minutos', '📖', 'daily', 25, 20, true)
  ON CONFLICT DO NOTHING;

  -- Recompensas (exatamente 3 — no limite)
  INSERT INTO public.rewards (family_id, title, emoji, coin_cost, is_active)
  VALUES
    (v_family_id, '30min de tela extra', '📱', 60, true),
    (v_family_id, 'Escolher o jantar', '🍕', 100, true),
    (v_family_id, 'Dormir mais tarde', '🌙', 80, true)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'QA Free Basic criado: family_id=%, pai=%, filho=%', v_family_id, v_parent_id, v_child_id;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: Criar usuários auth para família PREMIUM LARGE
-- (só execute se BLOCO 3 retornou 0 linhas)
-- ══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_parent1_id UUID := gen_random_uuid();
  v_parent2_id UUID := gen_random_uuid();
  v_child1_id  UUID := gen_random_uuid();
  v_child2_id  UUID := gen_random_uuid();
  v_child3_id  UUID := gen_random_uuid();
  v_family_id  UUID := gen_random_uuid();
BEGIN
  -- Pai 1 PREMIUM
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, role, aud,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at
  ) VALUES (
    v_parent1_id, '00000000-0000-0000-0000-000000000000',
    'qa-premium-pai1@rotinup.test',
    crypt('QAPremium2026!', gen_salt('bf')),
    NOW(), 'authenticated', 'authenticated',
    '{"display_name":"QA Pai Premium 1"}',
    '{"provider":"email","providers":["email"]}',
    NOW(), NOW()
  ) ON CONFLICT (email) DO NOTHING;

  -- Pai 2 (co-responsável) PREMIUM
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, role, aud,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at
  ) VALUES (
    v_parent2_id, '00000000-0000-0000-0000-000000000000',
    'qa-premium-pai2@rotinup.test',
    crypt('QAPremium2026!', gen_salt('bf')),
    NOW(), 'authenticated', 'authenticated',
    '{"display_name":"QA Mae Premium"}',
    '{"provider":"email","providers":["email"]}',
    NOW(), NOW()
  ) ON CONFLICT (email) DO NOTHING;

  -- Filhos PREMIUM
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, role, aud,
    raw_user_meta_data, raw_app_meta_data, created_at, updated_at
  ) VALUES
    (v_child1_id, '00000000-0000-0000-0000-000000000000',
     'qa-premium-filho1@rotinup.test',
     crypt('QAChild2026!', gen_salt('bf')),
     NOW(), 'authenticated', 'authenticated',
     '{"display_name":"QA Filho Premium 1"}',
     '{"provider":"email","providers":["email"]}',
     NOW(), NOW()),
    (v_child2_id, '00000000-0000-0000-0000-000000000000',
     'qa-premium-filho2@rotinup.test',
     crypt('QAChild2026!', gen_salt('bf')),
     NOW(), 'authenticated', 'authenticated',
     '{"display_name":"QA Filha Premium 2"}',
     '{"provider":"email","providers":["email"]}',
     NOW(), NOW()),
    (v_child3_id, '00000000-0000-0000-0000-000000000000',
     'qa-premium-filho3@rotinup.test',
     crypt('QAChild2026!', gen_salt('bf')),
     NOW(), 'authenticated', 'authenticated',
     '{"display_name":"QA Filho Premium 3"}',
     '{"provider":"email","providers":["email"]}',
     NOW(), NOW())
  ON CONFLICT (email) DO NOTHING;

  -- Família PREMIUM
  INSERT INTO public.families (id, name, plan, max_co_parents, hotmart_buyer_email)
  VALUES (v_family_id, 'QA Premium Large', 'premium', 10, 'qa-premium-pai1@rotinup.test')
  ON CONFLICT DO NOTHING;

  -- Perfis
  INSERT INTO public.profiles (id, family_id, display_name, role, xp, kidcoins, streak)
  VALUES
    (v_parent1_id, v_family_id, 'QA Pai Premium 1', 'parent', 0, 0, 0),
    (v_parent2_id, v_family_id, 'QA Mae Premium', 'parent', 0, 0, 0),
    (v_child1_id,  v_family_id, 'QA Filho Premium 1', 'child', 250, 180, 5),
    (v_child2_id,  v_family_id, 'QA Filha Premium 2', 'child', 450, 320, 12),
    (v_child3_id,  v_family_id, 'QA Filho Premium 3', 'child', 80,  60, 2)
  ON CONFLICT (id) DO UPDATE
    SET family_id = EXCLUDED.family_id, role = EXCLUDED.role;

  -- Missões PREMIUM (8 missões — acima do limite free)
  INSERT INTO public.missions (family_id, title, emoji, frequency, coins_reward, xp_reward, is_active)
  VALUES
    (v_family_id, 'Arrumar a cama', '🛏️', 'daily', 20, 15, true),
    (v_family_id, 'Escovar os dentes', '🦷', 'daily', 10, 8, true),
    (v_family_id, 'Fazer o dever', '📚', 'daily', 35, 28, true),
    (v_family_id, 'Ler 20 minutos', '📖', 'daily', 30, 22, true),
    (v_family_id, 'Praticar instrumento', '🎸', 'daily', 40, 30, true),
    (v_family_id, 'Exercicio fisico', '🏃', 'daily', 45, 35, true),
    (v_family_id, 'Organizar mochila', '🎒', 'daily', 15, 10, true),
    (v_family_id, 'Ajudar com tarefas', '🧺', 'weekly', 80, 60, true)
  ON CONFLICT DO NOTHING;

  -- Recompensas PREMIUM (6 recompensas — acima do limite free)
  INSERT INTO public.rewards (family_id, title, emoji, coin_cost, is_active)
  VALUES
    (v_family_id, '1h de video game', '🎮', 80, true),
    (v_family_id, 'Escolher o filme', '🎬', 60, true),
    (v_family_id, 'Passeio especial', '🎡', 300, true),
    (v_family_id, 'Sorvete', '🍦', 40, true),
    (v_family_id, 'Dormir na casa de amigo', '🏠', 200, true),
    (v_family_id, 'Brinquedo pequeno', '🧸', 500, true)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'QA Premium Large criado: family_id=%, pai1=%, pai2=%, filhos: %, %, %',
    v_family_id, v_parent1_id, v_parent2_id, v_child1_id, v_child2_id, v_child3_id;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: Verificar criação (deve retornar 7 linhas)
-- ══════════════════════════════════════════════════════════════════════

SELECT
  f.name AS familia,
  f.plan,
  u.email,
  p.role,
  p.xp,
  p.kidcoins,
  p.streak,
  u.raw_app_meta_data->>'provider' AS auth_provider
FROM profiles p
JOIN families f ON f.id = p.family_id
JOIN auth.users u ON u.id = p.id
WHERE f.name LIKE 'QA%'
ORDER BY f.name, p.role DESC;

-- Resultado esperado: 7 linhas, todas com auth_provider = 'email'
-- FREE:    qa-free-pai@rotinup.test / QAFree2026!
--          qa-free-filho@rotinup.test / QAChild2026!
-- PREMIUM: qa-premium-pai1@rotinup.test / QAPremium2026!
--          qa-premium-pai2@rotinup.test / QAPremium2026!
--          qa-premium-filho1@rotinup.test / QAChild2026!
--          qa-premium-filho2@rotinup.test / QAChild2026!
--          qa-premium-filho3@rotinup.test / QAChild2026!
