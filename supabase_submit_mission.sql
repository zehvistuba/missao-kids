-- RotinUp: submit_mission — versão versionada localmente
-- ATENÇÃO: Esta é a RPC atual no banco (Mai 2026). Alterar aqui e rodar
-- no SQL Editor para atualizar.
-- Ref: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-27
-- Atualização: permite repetição de missão no mesmo período (occurrence)

-- O frontend passa p_due_date como string 'YYYY-MM-DD' no fuso local do dispositivo
-- (via localDateStr(0)), então NÃO usamos now()::date aqui para evitar
-- inconsistência com UTC às 21h-23h59 Brasil (UTC-3).

CREATE OR REPLACE FUNCTION public.submit_mission(
  p_mission_id UUID,
  p_due_date   DATE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    profiles%ROWTYPE;
  v_mission   missions%ROWTYPE;
  v_log_id    UUID;
  v_cutoff    DATE;
  v_count     INT;
BEGIN
  SELECT * INTO v_caller FROM profiles WHERE id = auth.uid() AND role = 'child';
  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Apenas crianças podem enviar missões';
  END IF;

  SELECT * INTO v_mission FROM missions
  WHERE id = p_mission_id
    AND family_id = v_caller.family_id
    AND is_active = true;
  IF v_mission.id IS NULL THEN
    RAISE EXCEPTION 'Missão não encontrada ou inativa';
  END IF;

  -- Calcular janela do período baseada na frequência da missão
  v_cutoff := CASE v_mission.frequency
    WHEN 'weekly'   THEN p_due_date - 6
    WHEN 'biweekly' THEN p_due_date - 13
    WHEN 'monthly'  THEN p_due_date - 29
    ELSE p_due_date
  END;

  -- Bloquear se já há um pendente neste período (aguardar aprovação antes de re-enviar)
  IF EXISTS (
    SELECT 1 FROM mission_logs
    WHERE mission_id = p_mission_id
      AND child_id   = auth.uid()
      AND due_date  >= v_cutoff
      AND status     = 'pending'
  ) THEN
    RAISE EXCEPTION 'Já tem uma submissão aguardando aprovação para esta missão';
  END IF;

  -- Contar aprovações no período para definir qual ocorrência esta é
  SELECT COUNT(*) INTO v_count FROM mission_logs
  WHERE mission_id = p_mission_id
    AND child_id   = auth.uid()
    AND due_date  >= v_cutoff
    AND status     = 'approved';

  INSERT INTO mission_logs (mission_id, child_id, family_id, due_date, status, occurrence)
  VALUES (p_mission_id, auth.uid(), v_caller.family_id, p_due_date, 'pending', v_count + 1)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
