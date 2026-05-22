-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Correções Pós-Auditoria
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-22
-- Rodar bloco a bloco na ordem indicada
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: Unique constraint em streak_bonus_logs (A-01)
--   Previne crédito duplicado de bônus em race condition
-- ══════════════════════════════════════════════════════════════════════

-- Antes de adicionar constraint, deletar duplicatas existentes (se houver)
DELETE FROM public.streak_bonus_logs a
USING public.streak_bonus_logs b
WHERE a.id < b.id
  AND a.child_id = b.child_id
  AND a.achievement_id = b.achievement_id;

-- Agora adicionar constraint única
ALTER TABLE public.streak_bonus_logs
  ADD CONSTRAINT streak_bonus_logs_child_achievement_unique
  UNIQUE (child_id, achievement_id);

-- Verificar:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'streak_bonus_logs'::regclass;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: RPC submit_surprise_mission (C-04)
--   Permite que crianças (premium) submetam missões geradas por IA
--   para aprovação parental — sem necessidade de missão pré-existente
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_surprise_mission(
  p_title       TEXT,
  p_emoji       TEXT,
  p_coins       INTEGER,
  p_xp          INTEGER,
  p_description TEXT,
  p_due_date    DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id  UUID;
  v_family_id UUID;
  v_plan      TEXT;
  v_mission_id UUID;
BEGIN
  -- Verificar que chamador é criança
  SELECT p.id, p.family_id
  INTO v_child_id, v_family_id
  FROM profiles p
  WHERE p.id = auth.uid() AND p.role = 'child';

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Apenas crianças podem enviar missões surpresa';
  END IF;

  -- Verificar plano premium
  SELECT f.plan INTO v_plan FROM families f WHERE f.id = v_family_id;
  IF v_plan <> 'premium' THEN
    RAISE EXCEPTION 'premium_required';
  END IF;

  -- Sanitizar inputs
  p_title       := TRIM(LEFT(p_title, 100));
  p_emoji       := TRIM(LEFT(p_emoji, 10));
  p_description := TRIM(LEFT(p_description, 300));
  p_coins       := GREATEST(0, LEAST(p_coins, 500));
  p_xp          := GREATEST(0, LEAST(p_xp, 300));

  -- Criar missão temporária inativa (tipo surpresa)
  INSERT INTO missions (
    family_id, title, emoji, description,
    coins_reward, xp_reward, frequency,
    is_active, requires_proof
  )
  VALUES (
    v_family_id, p_title, p_emoji, '[SURPRESA IA] ' || p_description,
    p_coins, p_xp, 'daily',
    false, false
  )
  RETURNING id INTO v_mission_id;

  -- Criar log de missão como pendente
  INSERT INTO mission_logs (
    mission_id, child_id, family_id,
    due_date, status, coins_earned, xp_earned
  )
  VALUES (
    v_mission_id, v_child_id, v_family_id,
    p_due_date, 'pending', p_coins, p_xp
  )
  ON CONFLICT (mission_id, child_id, due_date) DO NOTHING;
END;
$$;

-- Verificar:
-- SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'submit_surprise_mission';


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: Corrigir usuários presos sem family_id (C-05)
--   Identifica e exibe usuários em limbo para decisão manual
-- ══════════════════════════════════════════════════════════════════════

-- 3a. Listar usuários presos (role = child sem family_id)
SELECT
  p.id,
  p.display_name,
  p.role,
  u.email,
  u.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.family_id IS NULL
ORDER BY u.created_at DESC;
-- Para cada child preso: ou vincular a família existente (UPDATE abaixo)
-- ou deletar a conta se for dado de teste

-- 3b. Vincular child preso a uma família (execute com IDs reais):
-- UPDATE public.profiles
--   SET family_id = 'UUID_DA_FAMILIA'
--   WHERE id = 'UUID_DO_CHILD_PRESO' AND role = 'child';

-- 3c. Deletar contas de teste obsoletas (execute com emails reais):
-- DELETE FROM auth.users WHERE email IN ('diagtest_delete@test.invalid', 'lucas.filho.test@email.com');
-- (profiles serão deletados em cascata se ON DELETE CASCADE estiver configurado)


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: Corrigir enforcement de limite FREE após downgrade (C-06)
--   Famílias em FREE não devem ter mais de 5 missões ativas.
--   Esta query identifica violações — a desativação é manual/consciente.
-- ══════════════════════════════════════════════════════════════════════

-- 4a. Identificar famílias FREE com mais de 5 missões ativas
SELECT
  f.id AS family_id,
  f.name,
  COUNT(m.id) AS missoes_ativas
FROM families f
JOIN missions m ON m.family_id = f.id AND m.is_active = true
WHERE f.plan = 'free'
GROUP BY f.id, f.name
HAVING COUNT(m.id) > 5
ORDER BY missoes_ativas DESC;

-- 4b. Para a família violadora, desativar missões excedentes
--   (mantendo as 5 mais recentes ativas)
-- UPDATE public.missions
--   SET is_active = false
--   WHERE family_id = 'FAMILY_ID_VIOLADORA'
--     AND id NOT IN (
--       SELECT id FROM public.missions
--       WHERE family_id = 'FAMILY_ID_VIOLADORA' AND is_active = true
--       ORDER BY created_at ASC
--       LIMIT 5
--     )
--     AND is_active = true;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 5: Corrigir invite_expires_at NULL nos códigos de convite (A-06)
--   O frontend mostra "72h" mas o banco não persiste a expiração.
--   Atualizar o RPC generate_invite_code para persistir expiração.
-- ══════════════════════════════════════════════════════════════════════

-- 5a. Ver estrutura atual de generate_invite_code
SELECT prosrc FROM pg_proc WHERE proname = 'generate_invite_code';

-- 5b. Verificar se families tem coluna invite_expires_at
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'families'
  AND column_name = 'invite_expires_at';

-- 5c. Se a coluna existir, atualizar todos os codes ativos com 72h de expiração
UPDATE public.families
SET invite_expires_at = NOW() + INTERVAL '72 hours'
WHERE invite_code IS NOT NULL AND invite_expires_at IS NULL;

-- 5d. Recriar generate_invite_code para sempre persistir expiração de 72h
--     (só execute se a query 5a mostrar que o RPC não seta invite_expires_at)
/*
CREATE OR REPLACE FUNCTION public.generate_invite_code()
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
  FROM profiles WHERE id = auth.uid() AND role IN ('parent','admin');

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Apenas responsáveis podem gerar código de convite';
  END IF;

  v_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));

  UPDATE families
  SET invite_code = v_code,
      invite_expires_at = NOW() + INTERVAL '72 hours'
  WHERE id = v_family_id;

  RETURN v_code;
END;
$$;
*/


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 6: Verificação de integridade pós-correções
-- ══════════════════════════════════════════════════════════════════════

-- 6a. Confirmar constraint única em streak_bonus_logs
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'streak_bonus_logs'::regclass;
-- Deve aparecer: streak_bonus_logs_pkey (PK) + streak_bonus_logs_child_achievement_unique (UNIQUE)

-- 6b. Confirmar RPC submit_surprise_mission existe
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'submit_surprise_mission';

-- 6c. Confirmar que não há mais famílias FREE com >5 missões ativas
SELECT
  f.name,
  COUNT(m.id) AS ativas
FROM families f
JOIN missions m ON m.family_id = f.id AND m.is_active = true
WHERE f.plan = 'free'
GROUP BY f.name
HAVING COUNT(m.id) > 5;
-- Deve retornar 0 linhas

-- 6d. Confirmar códigos de convite com expiração
SELECT name, invite_code, invite_expires_at
FROM families
WHERE invite_code IS NOT NULL;
-- Deve mostrar datas futuras (não NULL)

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 7: Notify PostgREST para recarregar schema
-- ══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
