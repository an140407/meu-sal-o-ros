-- 0006_pagamentos_e_recorrencia.sql
-- 1) Pagamento dividido (várias formas no mesmo atendimento)
-- 2) Recorrência (série de agendamentos) e intervalo de retorno por cliente
-- Aplicar manualmente no SQL editor do Lovable Cloud, UMA vez. Tudo ou nada.
-- Compatível com o app atual: nada é removido; o app antigo continua funcionando.

BEGIN;

-- =====================================================================
-- 1) PAGAMENTOS
-- =====================================================================
CREATE TABLE public.atendimento_pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid(),
  atendimento_id  uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  forma           text NOT NULL CHECK (forma IN ('pix','dinheiro','debito','credito')),
  valor           numeric(10,2) NOT NULL CHECK (valor > 0),
  taxa_percentual numeric(5,2) NOT NULL CHECK (taxa_percentual BETWEEN 0 AND 100), -- taxa da forma na data
  ordem           smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atendimento_pagamentos_atendimento_idx ON public.atendimento_pagamentos (atendimento_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimento_pagamentos TO authenticated;
GRANT ALL ON public.atendimento_pagamentos TO service_role;
ALTER TABLE public.atendimento_pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atendimento_pagamentos_own" ON public.atendimento_pagamentos FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.atendimentos a WHERE a.id = atendimento_id AND a.user_id = auth.uid())
  );

-- Taxa do pagamento: se não vier preenchida, usa a taxa atual das configurações
CREATE OR REPLACE FUNCTION public.preencher_taxa_pagamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cfg public.configuracoes%ROWTYPE;
BEGIN
  IF NEW.taxa_percentual IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.forma IS DISTINCT FROM OLD.forma AND NEW.taxa_percentual = OLD.taxa_percentual) THEN
    SELECT * INTO cfg FROM public.configuracoes WHERE user_id = NEW.user_id;
    NEW.taxa_percentual := CASE NEW.forma
      WHEN 'debito'  THEN COALESCE(cfg.taxa_debito, 0)
      WHEN 'credito' THEN COALESCE(cfg.taxa_credito, 0)
      ELSE 0 END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_preencher_taxa_pagamento BEFORE INSERT OR UPDATE ON public.atendimento_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.preencher_taxa_pagamento();

-- Atendimentos já concluídos viram 1 pagamento cada, com a mesma taxa (números não mudam)
INSERT INTO public.atendimento_pagamentos (user_id, atendimento_id, forma, valor, taxa_percentual, ordem)
SELECT a.user_id, a.id, a.forma_pagamento, a.valor_bruto, a.taxa_percentual, 0
FROM public.atendimentos a
WHERE a.status = 'realizado' AND a.valor_bruto > 0;

-- Cálculo do atendimento: com pagamentos, o líquido = bruto − taxas de cada parte
CREATE OR REPLACE FUNCTION public.calcular_atendimento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cfg public.configuracoes%ROWTYPE;
  recalcular boolean;
  pg_total numeric;
  pg_taxas numeric;
BEGIN
  SELECT * INTO cfg FROM public.configuracoes WHERE user_id = NEW.user_id;
  IF TG_OP = 'INSERT' THEN
    recalcular := true;
  ELSE
    recalcular := NEW.status = 'realizado' AND OLD.status <> 'realizado';
  END IF;
  IF recalcular THEN
    NEW.percentual_ana := COALESCE(cfg.percentual_ana, 70);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT sum(valor), sum(valor * taxa_percentual / 100)
      INTO pg_total, pg_taxas
      FROM public.atendimento_pagamentos WHERE atendimento_id = NEW.id;
  END IF;

  IF COALESCE(pg_total, 0) > 0 THEN
    -- Proporcional ao bruto: exato quando a soma dos pagamentos = bruto
    NEW.valor_liquido := round(NEW.valor_bruto - pg_taxas * NEW.valor_bruto / pg_total, 2);
    NEW.taxa_percentual := CASE WHEN NEW.valor_bruto > 0
      THEN round((NEW.valor_bruto - NEW.valor_liquido) * 100 / NEW.valor_bruto, 2) ELSE 0 END;
  ELSE
    IF recalcular OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento THEN
      NEW.taxa_percentual := CASE NEW.forma_pagamento
        WHEN 'debito'  THEN COALESCE(cfg.taxa_debito, 0)
        WHEN 'credito' THEN COALESCE(cfg.taxa_credito, 0)
        ELSE 0 END;
    END IF;
    NEW.valor_liquido := round(NEW.valor_bruto * (1 - NEW.taxa_percentual / 100), 2);
  END IF;
  RETURN NEW;
END $$;

-- Mudou um pagamento → recalcula o atendimento
CREATE OR REPLACE FUNCTION public.recalcular_por_pagamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.atendimentos SET valor_bruto = valor_bruto
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.atendimento_id ELSE NEW.atendimento_id END;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_recalcular_por_pagamento
AFTER INSERT OR UPDATE OR DELETE ON public.atendimento_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.recalcular_por_pagamento();

-- Troca todos os pagamentos de um atendimento numa transação.
-- Mantém a taxa antiga das formas que já existiam (editar não muda números do passado);
-- formas novas usam a taxa atual. A soma precisa bater com o total do atendimento.
CREATE OR REPLACE FUNCTION public.substituir_pagamentos_atendimento(p_atendimento_id uuid, p_pagamentos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_bruto numeric;
  v_soma numeric;
  v_taxas jsonb;
  v_principal text;
BEGIN
  SELECT valor_bruto INTO v_bruto FROM public.atendimentos WHERE id = p_atendimento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento não encontrado';
  END IF;
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' THEN
    RAISE EXCEPTION 'Pagamentos inválidos';
  END IF;

  SELECT COALESCE(sum((p->>'valor')::numeric), 0) INTO v_soma FROM jsonb_array_elements(p_pagamentos) p;
  IF v_bruto > 0 AND jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Informe a forma de pagamento';
  END IF;
  IF abs(v_soma - v_bruto) > 0.009 THEN
    RAISE EXCEPTION 'A soma dos pagamentos (R$ %) não bate com o total (R$ %)',
      replace(to_char(v_soma, 'FM9999990.00'), '.', ','), replace(to_char(v_bruto, 'FM9999990.00'), '.', ',');
  END IF;

  SELECT jsonb_object_agg(forma, taxa_percentual) INTO v_taxas
    FROM (SELECT DISTINCT ON (forma) forma, taxa_percentual
            FROM public.atendimento_pagamentos
           WHERE atendimento_id = p_atendimento_id ORDER BY forma, ordem) t;

  DELETE FROM public.atendimento_pagamentos WHERE atendimento_id = p_atendimento_id;

  INSERT INTO public.atendimento_pagamentos (atendimento_id, forma, valor, taxa_percentual, ordem)
  SELECT p_atendimento_id, p->>'forma', (p->>'valor')::numeric,
         (v_taxas->>(p->>'forma'))::numeric,  -- null = taxa atual (trigger)
         (ord - 1)::smallint
  FROM jsonb_array_elements(p_pagamentos) WITH ORDINALITY AS t(p, ord);

  -- Compatibilidade: forma_pagamento = forma de maior valor
  SELECT p->>'forma' INTO v_principal
    FROM jsonb_array_elements(p_pagamentos) WITH ORDINALITY AS t(p, ord)
   ORDER BY (p->>'valor')::numeric DESC, ord LIMIT 1;
  IF v_principal IS NOT NULL THEN
    UPDATE public.atendimentos SET forma_pagamento = v_principal
     WHERE id = p_atendimento_id AND forma_pagamento IS DISTINCT FROM v_principal;
  END IF;
END $$;

-- Serviços + pagamentos juntos (Concluir e editar atendimento concluído)
CREATE OR REPLACE FUNCTION public.salvar_itens_e_pagamentos(p_atendimento_id uuid, p_itens jsonb, p_pagamentos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM public.substituir_itens_atendimento(p_atendimento_id, p_itens);
  PERFORM public.substituir_pagamentos_atendimento(p_atendimento_id, p_pagamentos);
END $$;

-- =====================================================================
-- 2) RECORRÊNCIA
-- =====================================================================
ALTER TABLE public.atendimentos ADD COLUMN serie_id uuid;
CREATE INDEX atendimentos_serie_idx ON public.atendimentos (user_id, serie_id, data) WHERE serie_id IS NOT NULL;

ALTER TABLE public.clientes ADD COLUMN retorno_dias smallint CHECK (retorno_dias BETWEEN 1 AND 365);

-- Cria de 1 a 60 agendamentos de uma vez (mesma cliente, hora, duração, serviços).
-- Com mais de 1 data, todos recebem o mesmo serie_id. Guarda o intervalo na cliente.
CREATE OR REPLACE FUNCTION public.criar_agendamentos_recorrentes(
  p_cliente_id uuid, p_datas date[], p_hora time, p_duracao_min integer,
  p_observacoes text, p_itens jsonb, p_intervalo_dias integer
)
RETURNS uuid[] LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_qtd integer := COALESCE(array_length(p_datas, 1), 0);
  v_serie uuid;
  v_servico uuid;
  v_data date;
  v_id uuid;
  v_ids uuid[] := '{}';
BEGIN
  IF v_qtd < 1 OR v_qtd > 60 THEN
    RAISE EXCEPTION 'Informe de 1 a 60 datas';
  END IF;
  IF (SELECT count(DISTINCT d) FROM unnest(p_datas) d) <> v_qtd OR array_position(p_datas, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Datas repetidas ou vazias';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Atendimento sem serviços';
  END IF;
  PERFORM 1 FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrada';
  END IF;

  IF v_qtd > 1 THEN v_serie := gen_random_uuid(); END IF;
  v_servico := nullif(p_itens->0->>'servico_id', '')::uuid;

  FOREACH v_data IN ARRAY (SELECT array_agg(d ORDER BY d) FROM unnest(p_datas) d) LOOP
    INSERT INTO public.atendimentos
      (cliente_id, servico_id, data, hora, duracao_min, forma_pagamento, status, observacoes, serie_id)
    VALUES
      (p_cliente_id, v_servico, v_data, p_hora, p_duracao_min, 'pix', 'agendado', nullif(p_observacoes, ''), v_serie)
    RETURNING id INTO v_id;
    PERFORM public.substituir_itens_atendimento(v_id, p_itens);
    v_ids := v_ids || v_id;
  END LOOP;

  IF p_intervalo_dias IS NOT NULL THEN
    UPDATE public.clientes SET retorno_dias = p_intervalo_dias WHERE id = p_cliente_id;
  END IF;
  RETURN v_ids;
END $$;

-- Copia hora, duração, observações e serviços deste agendamento
-- para os próximos AGENDADOS da mesma série. Retorna quantos mudaram.
CREATE OR REPLACE FUNCTION public.aplicar_aos_proximos_da_serie(p_atendimento_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  a public.atendimentos%ROWTYPE;
  v_itens jsonb;
  v_id uuid;
  v_n integer := 0;
BEGIN
  SELECT * INTO a FROM public.atendimentos WHERE id = p_atendimento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado'; END IF;
  IF a.serie_id IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'servico_id', servico_id, 'nome', nome, 'valor', valor, 'duracao_min', duracao_min) ORDER BY ordem), '[]'::jsonb)
    INTO v_itens FROM public.atendimento_servicos WHERE atendimento_id = a.id;

  FOR v_id IN
    SELECT id FROM public.atendimentos
     WHERE serie_id = a.serie_id AND data > a.data AND status = 'agendado'
  LOOP
    UPDATE public.atendimentos
       SET hora = a.hora, duracao_min = a.duracao_min, observacoes = a.observacoes, servico_id = a.servico_id
     WHERE id = v_id;
    IF jsonb_array_length(v_itens) > 0 THEN
      PERFORM public.substituir_itens_atendimento(v_id, v_itens);
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.substituir_pagamentos_atendimento(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_itens_e_pagamentos(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_agendamentos_recorrentes(uuid, date[], time, integer, text, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aplicar_aos_proximos_da_serie(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.substituir_pagamentos_atendimento(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_itens_e_pagamentos(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_agendamentos_recorrentes(uuid, date[], time, integer, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_aos_proximos_da_serie(uuid) TO authenticated;

COMMIT;
