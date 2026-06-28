-- ═══════════════════════════════════════════════════════════════════════════
-- RotinUp — Fixes da auditoria (Codex) — P0/P1 de isolamento e autorização
-- URL: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-06-28
-- (B2) pending_approvals: recria a view com FILTRO de família + security_invoker
--      (antes vazava pendências de todas as famílias).
-- (B3) missions/rewards: trigger exige responsável (role parent/admin) para
--      criar/editar — fecha o buraco de criança manipular catálogo via RPC direto.
-- Aditivo (recria view + cria trigger). Não altera dados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── (B2) View de pendências isolada por família ────────────────────────────
CREATE OR REPLACE VIEW public.pending_approvals
WITH (security_invoker = true) AS
SELECT ml.id            AS log_id,
       m.title          AS mission_title,
       m.emoji          AS mission_emoji,
       m.coins_reward,
       m.xp_reward,
       m.frequency      AS mission_frequency,
       p.display_name   AS child_name,
       p.avatar_emoji   AS child_avatar,
       p.id             AS child_id,
       ml.child_note,
       ml.created_at    AS submitted_at,
       ml.occurrence,
       ml.family_id
  FROM mission_logs ml
  JOIN missions  m ON m.id = ml.mission_id
  JOIN profiles  p ON p.id = ml.child_id
 WHERE ml.status = 'pending'::mission_status
   AND ml.family_id = (SELECT family_id FROM profiles WHERE id = auth.uid());

-- ─── (B3) Só responsável cria/edita catálogo (missions e rewards) ───────────
-- auth.uid() funciona dentro de SECURITY DEFINER (lê o JWT), então o trigger
-- enxerga o usuário REAL mesmo quando a RPC roda como postgres. Operações puras
-- de backend (auth.uid() nulo) passam.
CREATE OR REPLACE FUNCTION public.enforce_parent_catalog()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('parent','admin') THEN
      RAISE EXCEPTION 'Apenas responsaveis podem gerenciar missoes e recompensas';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_parent_missions ON public.missions;
CREATE TRIGGER trg_enforce_parent_missions
  BEFORE INSERT OR UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_catalog();

DROP TRIGGER IF EXISTS trg_enforce_parent_rewards ON public.rewards;
CREATE TRIGGER trg_enforce_parent_rewards
  BEFORE INSERT OR UPDATE ON public.rewards
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_catalog();

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
-- view recriada com security_invoker?
SELECT relname, reloptions FROM pg_class WHERE relname = 'pending_approvals';
-- triggers criados?
SELECT tgname, tgrelid::regclass AS tabela FROM pg_trigger
 WHERE tgname IN ('trg_enforce_parent_missions','trg_enforce_parent_rewards');
