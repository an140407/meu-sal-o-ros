-- 0008_recebedor_e_repasses_diarios.sql
-- 1) Cada parte do pagamento guarda quem recebeu o dinheiro: a Ana ou a dona do salão.
-- 2) Repasses diários entre as duas (confirmados no app), substituindo o repasse mensal.
-- O acerto diário conta a partir de 15/11/2026 (até 14/11 ficou tudo acertado) — essa data
-- fica no app (INICIO_ACERTO_DIARIO em src/lib/acerto.ts), não no banco.
-- Aplicar no SQL editor do Lovable Cloud ANTES de publicar o código. Pode rodar de novo sem erro.

BEGIN;

-- 1) Quem recebeu cada parte (as partes que já existem ficam como 'ana').
ALTER TABLE public.atendimento_pagamentos
  ADD COLUMN IF NOT EXISTS recebedor text NOT NULL DEFAULT 'ana';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atendimento_pagamentos_recebedor_check') THEN
    ALTER TABLE public.atendimento_pagamentos
      ADD CONSTRAINT atendimento_pagamentos_recebedor_check CHECK (recebedor IN ('ana', 'simone'));
  END IF;
END $$;

-- Igual à versão do 0006, agora gravando "recebedor" de cada parte (padrão 'ana').
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
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_pagamentos) p
     WHERE COALESCE(p->>'recebedor', 'ana') NOT IN ('ana', 'simone')
  ) THEN
    RAISE EXCEPTION 'Quem recebeu o pagamento é inválido';
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

  INSERT INTO public.atendimento_pagamentos (atendimento_id, forma, valor, taxa_percentual, ordem, recebedor)
  SELECT p_atendimento_id, p->>'forma', (p->>'valor')::numeric,
         (v_taxas->>(p->>'forma'))::numeric,  -- null = taxa atual (trigger)
         (ord - 1)::smallint,
         COALESCE(p->>'recebedor', 'ana')
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

-- 2) Repasses do dia entre a Ana e a dona do salão.
--    de = quem mandou ('ana' → mandou pra dona; 'simone' → a dona mandou pra Ana).
--    dia = o dia de atendimentos a que o repasse se refere.
CREATE TABLE IF NOT EXISTS public.repasses_diarios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  dia        date NOT NULL,
  de         text NOT NULL CHECK (de IN ('ana', 'simone')),
  valor      numeric(10,2) NOT NULL CHECK (valor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repasses_diarios_user_dia_idx ON public.repasses_diarios (user_id, dia);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repasses_diarios TO authenticated;
GRANT ALL ON public.repasses_diarios TO service_role;
ALTER TABLE public.repasses_diarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "repasses_diarios_own" ON public.repasses_diarios;
CREATE POLICY "repasses_diarios_own" ON public.repasses_diarios FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;
