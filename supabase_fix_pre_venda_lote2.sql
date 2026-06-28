-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Lote 2 pré-venda: consentimento LGPD versionado + sucessão de owner
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- (1) Colunas de consentimento em profiles + RPC accept_terms (registra versão+data
--     no servidor, para o responsável legal — vale como consentimento parental).
-- (2) delete_my_account: ao excluir o DONO com outros responsáveis, transfere
--     families.owner_id para um sucessor ANTES de remover o perfil.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── (1) Consentimento LGPD versionado ──────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_version            TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at        TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parental_consent_version TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parental_consent_at      TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.accept_terms(p_terms_version TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF p_terms_version IS NULL OR length(trim(p_terms_version)) = 0 THEN
    RAISE EXCEPTION 'Versao dos termos invalida';
  END IF;
  UPDATE profiles
     SET terms_version            = p_terms_version,
         terms_accepted_at        = now(),
         parental_consent_version = p_terms_version,
         parental_consent_at      = now()
   WHERE id = auth.uid();
END; $$;

-- ─── (2) delete_my_account com sucessão de owner_id ─────────────────────────
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller      profiles%ROWTYPE;
  v_family      families%ROWTYPE;
  v_parent_cnt  INT;
  v_was_owner   BOOLEAN := false;
  v_fam_deleted BOOLEAN := false;
  v_successor   UUID;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid();
  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'Usuario nao encontrado'; END IF;

  -- ── CRIANÇA ───────────────────────────────────────────────────────────────
  IF v_caller.role = 'child' THEN
    DELETE FROM mission_logs       WHERE child_id = auth.uid();
    DELETE FROM child_achievements WHERE child_id = auth.uid();
    DELETE FROM redemption_logs    WHERE child_id = auth.uid();
    DELETE FROM demerit_logs       WHERE child_id = auth.uid();
    DELETE FROM profiles           WHERE id = auth.uid();
    RETURN jsonb_build_object('deleted', true, 'was_owner', false, 'family_deleted', false);
  END IF;

  -- ── RESPONSÁVEL / ADMIN ───────────────────────────────────────────────────
  IF v_caller.family_id IS NOT NULL THEN
    SELECT * INTO v_family FROM families WHERE id = v_caller.family_id;
    v_was_owner := (v_family.owner_id = auth.uid());

    SELECT COUNT(*) INTO v_parent_cnt
      FROM profiles
     WHERE family_id = v_caller.family_id AND role IN ('parent','admin') AND id <> auth.uid();

    IF v_was_owner AND v_parent_cnt = 0 THEN
      -- Dono e único responsável → apaga família inteira
      DELETE FROM demerit_logs    WHERE family_id = v_caller.family_id;
      DELETE FROM redemption_logs WHERE family_id = v_caller.family_id;
      DELETE FROM mission_logs       WHERE child_id IN (SELECT id FROM profiles WHERE family_id = v_caller.family_id);
      DELETE FROM child_achievements WHERE child_id IN (SELECT id FROM profiles WHERE family_id = v_caller.family_id);
      DELETE FROM push_subscriptions WHERE user_id  IN (SELECT id FROM profiles WHERE family_id = v_caller.family_id);
      DELETE FROM missions WHERE family_id = v_caller.family_id;
      DELETE FROM rewards  WHERE family_id = v_caller.family_id;
      DELETE FROM profiles WHERE family_id = v_caller.family_id;
      DELETE FROM families WHERE id = v_caller.family_id;
      v_fam_deleted := true;
    ELSE
      -- Co-responsável OU dono com outros responsáveis → desvincula este usuário.
      -- Se for o DONO, transfere a posse para um sucessor ANTES de remover.
      IF v_was_owner THEN
        SELECT id INTO v_successor
          FROM profiles
         WHERE family_id = v_caller.family_id AND role IN ('parent','admin') AND id <> auth.uid()
         ORDER BY (role = 'admin') DESC, created_at ASC
         LIMIT 1;
        IF v_successor IS NOT NULL THEN
          UPDATE families SET owner_id = v_successor WHERE id = v_caller.family_id;
        END IF;
      END IF;
      DELETE FROM push_subscriptions WHERE user_id = auth.uid();
      DELETE FROM profiles WHERE id = auth.uid();
    END IF;
  ELSE
    DELETE FROM push_subscriptions WHERE user_id = auth.uid();
    DELETE FROM profiles WHERE id = auth.uid();
  END IF;

  RETURN jsonb_build_object('deleted', true, 'was_owner', v_was_owner, 'family_deleted', v_fam_deleted);
END; $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
 WHERE table_name='profiles' AND column_name IN
   ('terms_version','terms_accepted_at','parental_consent_version','parental_consent_at')
 ORDER BY column_name;
SELECT proname FROM pg_proc WHERE proname IN ('accept_terms','delete_my_account') ORDER BY proname;
