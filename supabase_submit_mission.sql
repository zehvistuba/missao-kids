-- RotinUp: submit_mission — versão versionada localmente
-- ATENÇÃO: Esta é a RPC atual no banco (Mai 2026). Alterar aqui e rodar
-- no SQL Editor para atualizar.
-- Ref: https://supabase.com/dashboard/project/intieqgjmprxatvogxkh/sql
-- Data: 2026-05-20

-- O frontend passa p_due_date como string 'YYYY-MM-DD' no fuso local do dispositivo
-- (via localDateStr(0)), então NÃO usamos now()::date aqui para evitar
-- inconsistência com UTC às 21h-23h59 Brasil (UTC-3).

CREATE OR REPLACE FUNCTION public.submit_mission(
  p_mission_id UUID,
  p_due_date   DATE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   profiles%ROWTYPE;
  v_mission  missions%ROWTYPE;
  v_log_id   UUID;
  v_existing UUID;
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

  -- Evitar duplicata para a mesma due_date
  SELECT id INTO v_existing FROM mission_logs
  WHERE mission_id = p_mission_id
    AND child_id   = auth.uid()
    AND due_date   = p_due_date
    AND status IN ('pending', 'approved');

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Missão já enviada para esta data';
  END IF;

  INSERT INTO mission_logs (mission_id, child_id, family_id, due_date, status)
  VALUES (p_mission_id, auth.uid(), v_caller.family_id, p_due_date, 'pending')
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
