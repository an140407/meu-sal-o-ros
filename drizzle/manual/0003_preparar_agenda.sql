-- Prepara o app para agenda. Aplicar manualmente no SQL editor do Lovable Cloud.
BEGIN;

-- Atendimentos: status e duração. Os existentes ficam 'realizado' pelo DEFAULT.
ALTER TABLE public.atendimentos
  ADD COLUMN status text NOT NULL DEFAULT 'realizado'
    CHECK (status IN ('agendado','realizado','cancelado','faltou')),
  ADD COLUMN duracao_min integer NOT NULL DEFAULT 60
    CHECK (duracao_min BETWEEN 15 AND 480);
CREATE INDEX ON public.atendimentos (user_id, data, hora);

-- Serviços: duração padrão
ALTER TABLE public.servicos
  ADD COLUMN duracao_min integer NOT NULL DEFAULT 60
    CHECK (duracao_min BETWEEN 15 AND 480);

-- Configurações: expediente
ALTER TABLE public.configuracoes
  ADD COLUMN hora_inicio time DEFAULT '08:00',
  ADD COLUMN hora_fim time DEFAULT '19:00';

-- Despesas (sem tela por enquanto)
CREATE TABLE public.despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  data date NOT NULL DEFAULT current_date,
  descricao text NOT NULL,
  categoria text,
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas TO authenticated;
GRANT ALL ON public.despesas TO service_role;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "despesas_own" ON public.despesas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Calcula taxa, percentual e líquido a partir das configurações.
-- Ao virar 'realizado' (vindo de outro status), recalcula como no INSERT.
CREATE OR REPLACE FUNCTION public.calcular_atendimento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cfg public.configuracoes%ROWTYPE;
  recalcular boolean;
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
  IF recalcular OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento THEN
    NEW.taxa_percentual := CASE NEW.forma_pagamento
      WHEN 'debito' THEN COALESCE(cfg.taxa_debito, 0)
      WHEN 'credito' THEN COALESCE(cfg.taxa_credito, 0)
      ELSE 0 END;
  END IF;
  NEW.valor_liquido := round(NEW.valor_bruto * (1 - NEW.taxa_percentual / 100), 2);
  RETURN NEW;
END $$;

COMMIT;
