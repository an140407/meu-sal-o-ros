-- 0007_excluir_cliente_e_reorganizar_retorno.sql
-- 1) Excluir a ficha da cliente junto com tudo o que é dela (o vínculo atendimentos → clientes
--    continua RESTRICT, então só esta função apaga uma cliente que tem atendimentos).
-- 2) Alterar o intervalo de retorno da cliente e, se pedido, reorganizar os próximos
--    agendamentos das séries dela com o novo intervalo.
-- Aplicar manualmente no SQL editor do Lovable Cloud, uma vez. Tudo ou nada (BEGIN/COMMIT).
-- Não altera tabelas nem colunas: só cria duas funções.

BEGIN;

-- Apaga a ficha, os agendamentos e os atendimentos da cliente (serviços e pagamentos
-- desses atendimentos saem em cascata). Retorna quantos atendimentos foram apagados.
CREATE OR REPLACE FUNCTION public.excluir_cliente(p_cliente_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrada';
  END IF;

  DELETE FROM public.atendimentos WHERE cliente_id = p_cliente_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  DELETE FROM public.clientes WHERE id = p_cliente_id;
  RETURN v_n;
END $$;

-- Grava o intervalo de retorno (1 a 365 dias). Com p_reorganizar, em cada série da cliente
-- os agendamentos ainda 'agendado' a partir de p_hoje são redistribuídos: o primeiro fica
-- na mesma data e os seguintes passam a ser primeiro + k × p_dias (k = 1, 2, 3...).
-- Concluídos, cancelados, faltas e agendamentos fora de série não mudam.
-- p_hoje vem do app (fuso de São Paulo). Retorna quantos agendamentos mudaram de data.
CREATE OR REPLACE FUNCTION public.alterar_retorno_cliente(
  p_cliente_id uuid, p_dias integer, p_reorganizar boolean, p_hoje date
)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 365 THEN
    RAISE EXCEPTION 'Use de 1 a 365 dias';
  END IF;

  UPDATE public.clientes SET retorno_dias = p_dias WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrada';
  END IF;

  IF COALESCE(p_reorganizar, false) THEN
    WITH futuros AS (
      SELECT id,
             first_value(data) OVER w AS primeira,
             (row_number() OVER w - 1)::integer AS k
        FROM public.atendimentos
       WHERE cliente_id = p_cliente_id
         AND serie_id IS NOT NULL
         AND status = 'agendado'
         AND data >= COALESCE(p_hoje, CURRENT_DATE)
      WINDOW w AS (PARTITION BY serie_id ORDER BY data, id)
    )
    UPDATE public.atendimentos a
       SET data = f.primeira + f.k * p_dias
      FROM futuros f
     WHERE a.id = f.id
       AND a.data <> f.primeira + f.k * p_dias;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.excluir_cliente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alterar_retorno_cliente(uuid, integer, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_retorno_cliente(uuid, integer, boolean, date) TO authenticated;

COMMIT;
