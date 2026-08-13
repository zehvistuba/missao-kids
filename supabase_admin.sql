-- OBSOLETO - NAO EXECUTAR EM PRODUCAO.
--
-- Este nome foi mantido apenas para impedir que links e anotacoes antigas
-- recriem RPCs administrativas inseguras. A versao historica confiava em
-- profiles.role = 'admin' e poderia desfazer o hardening anti-escalada.
--
-- Fontes vigentes:
--   1. supabase_fix_p0_admin_escalation.sql
--   2. supabase_hardening_grants.sql
--
-- Para diagnostico, consulte a RPC public.admin_get_families() viva e os
-- criterios registrados em CONTROLE_EVOLUCOES.md. Nao reaplique SQL legado.

SELECT
  false AS deve_executar,
  'ARQUIVO OBSOLETO: use os scripts de hardening vigentes'::text AS aviso;
