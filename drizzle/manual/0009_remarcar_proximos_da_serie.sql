-- 0009_remarcar_proximos_da_serie.sql
-- "Este e os próximos" ao editar um agendamento de série: os próximos da série (escolhidos no
-- app) andam o mesmo número de dias que este andou e ficam com o mesmo horário, duração,
-- serviços, observações e cliente deste. Tudo numa transação: ou remarca todos, ou nenhum.
-- O app grava primeiro este agendamento (com a data/hora nova) e depois chama esta função.
-- Aplicar no SQL editor do Lovable Cloud ANTES de publicar o código. Pode rodar de novo sem erro.

BEGIN;

CREATE OR REPLACE FUNCTION public.remarcar_proximos_da_serie(
  p_atendimento_id uuid,   -- o agendamento já salvo com a data/hora nova
  p_data_antes date,       -- a data dele antes da edição
  p_ids uuid[],            -- os próximos que a Ana deixou marcados
  p_hoje date              -- hoje no fuso de São Paulo (vem do app)
)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  a public.atendimentos%ROWTYPE;
  v_delta integer;
  v_itens jsonb;
  v_id uuid;
  v_n integer := 0;
BEGIN
  SELECT * INTO a FROM public.atendimentos WHERE id = p_atendimento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;
  IF a.serie_id IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF p_data_antes IS NULL THEN
    RAISE EXCEPTION 'Data anterior do agendamento não informada';
  END IF;

  v_delta := a.data - p_data_antes;

  -- Só mexe nos ainda 'agendado' da mesma série, depois da data antiga deste.
  -- Nenhum pode ir para antes de hoje.
  IF EXISTS (
    SELECT 1 FROM public.atendimentos
     WHERE id = ANY (p_ids) AND id <> a.id AND serie_id = a.serie_id
       AND status = 'agendado' AND data > p_data_antes
       AND data + v_delta < COALESCE(p_hoje, CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Algum dos próximos ficaria numa data que já passou';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'servico_id', servico_id, 'nome', nome, 'valor', valor, 'duracao_min', duracao_min) ORDER BY ordem), '[]'::jsonb)
    INTO v_itens FROM public.atendimento_servicos WHERE atendimento_id = a.id;

  FOR v_id IN
    SELECT id FROM public.atendimentos
     WHERE id = ANY (p_ids) AND id <> a.id AND serie_id = a.serie_id
       AND status = 'agendado' AND data > p_data_antes
     ORDER BY data
  LOOP
    UPDATE public.atendimentos
       SET data = data + v_delta,
           hora = a.hora,
           duracao_min = a.duracao_min,
           observacoes = a.observacoes,
           servico_id = a.servico_id,
           cliente_id = a.cliente_id
     WHERE id = v_id;
    IF jsonb_array_length(v_itens) > 0 THEN
      PERFORM public.substituir_itens_atendimento(v_id, v_itens);
    END IF;
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.remarcar_proximos_da_serie(uuid, date, uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remarcar_proximos_da_serie(uuid, date, uuid[], date) TO authenticated;

COMMIT;
