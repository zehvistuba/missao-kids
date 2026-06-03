-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Correção do trigger protect_profile_columns (URGENTE)
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-03
-- Contexto: a versão aplicada no QA usava session_user='authenticator', que é o
--   role do PostgREST em TODA requisição — inclusive nos RPCs SECURITY DEFINER
--   que creditam kidcoins (review_mission, parent_check_mission, apply_demerit,
--   request_redemption, check_and_grant_achievements). Isso BLOQUEIA o crédito
--   legítimo → aprovar missão falha com "Alteração não permitida nesta coluna".
-- Solução correta: SECURITY INVOKER + current_user.
--   • REST direto → current_user = 'authenticated'/'anon' → BLOQUEIA (escalada)
--   • RPC definer → current_user = 'postgres' (dono) → LIBERA (crédito legítimo)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER (default) — essencial: ver comentário acima.
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NOT (OLD.role IS NULL AND NEW.role IN ('parent','child')) THEN
        RAISE EXCEPTION 'Alteração de papel não permitida';
      END IF;
    END IF;
    IF NEW.kidcoins       IS DISTINCT FROM OLD.kidcoins
    OR NEW.xp             IS DISTINCT FROM OLD.xp
    OR NEW.streak         IS DISTINCT FROM OLD.streak
    OR NEW.longest_streak IS DISTINCT FROM OLD.longest_streak
    OR NEW.family_id      IS DISTINCT FROM OLD.family_id THEN
      RAISE EXCEPTION 'Alteração não permitida nesta coluna';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO 1 — a função NÃO é SECURITY DEFINER (prosecdef deve ser false):
-- ═══════════════════════════════════════════════════════════════════════════
SELECT proname, prosecdef AS is_security_definer
FROM pg_proc WHERE proname = 'protect_profile_columns';
-- Esperado: is_security_definer = false

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO 2 — CRÉDITO LEGÍTIMO AINDA FUNCIONA (o teste que faltou).
-- Pega uma missão pendente real e aprova via review_mission; o kidcoins do filho
-- DEVE aumentar. Se der "Alteração não permitida", o trigger ainda está errado.
-- (Rodar logado como o RESPONSÁVEL no app — não no SQL Editor — OU testar no
--  console do app conforme o script de verificação.)
-- ═══════════════════════════════════════════════════════════════════════════
