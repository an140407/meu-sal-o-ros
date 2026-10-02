CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  telefone text,
  data_nascimento date,
  consentimento_lgpd boolean NOT NULL DEFAULT false,
  consentimento_data timestamptz,
  alergias text,
  gestante boolean NOT NULL DEFAULT false,
  diabetes_circulacao boolean NOT NULL DEFAULT false,
  problema_unhas text,
  medicamentos text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_own" ON public.clientes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  preco_padrao numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated;
GRANT ALL ON public.servicos TO service_role;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servicos_own" ON public.servicos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.configuracoes (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  percentual_ana numeric(5,2) NOT NULL DEFAULT 70,
  taxa_debito numeric(5,2) NOT NULL DEFAULT 0,
  taxa_credito numeric(5,2) NOT NULL DEFAULT 0,
  nome_dona text NOT NULL DEFAULT 'Simone'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_own" ON public.configuracoes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  servico_id uuid REFERENCES public.servicos(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT current_date,
  valor_bruto numeric(10,2) NOT NULL DEFAULT 0,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('pix','dinheiro','debito','credito')),
  taxa_percentual numeric(5,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(10,2) NOT NULL DEFAULT 0,
  percentual_ana numeric(5,2) NOT NULL DEFAULT 70,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.atendimentos (user_id, data DESC);
CREATE INDEX ON public.atendimentos (cliente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimentos TO authenticated;
GRANT ALL ON public.atendimentos TO service_role;
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atend_own" ON public.atendimentos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Calcula taxa, percentual e líquido a partir das configurações
CREATE OR REPLACE FUNCTION public.calcular_atendimento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cfg public.configuracoes%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.configuracoes WHERE user_id = NEW.user_id;
  IF TG_OP = 'INSERT' THEN
    NEW.percentual_ana := COALESCE(cfg.percentual_ana, 70);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento THEN
    NEW.taxa_percentual := CASE NEW.forma_pagamento
      WHEN 'debito' THEN COALESCE(cfg.taxa_debito, 0)
      WHEN 'credito' THEN COALESCE(cfg.taxa_credito, 0)
      ELSE 0 END;
  END IF;
  NEW.valor_liquido := round(NEW.valor_bruto * (1 - NEW.taxa_percentual / 100), 2);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_calcular_atendimento BEFORE INSERT OR UPDATE ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.calcular_atendimento();

-- Cria configurações e serviços iniciais para o usuário logado (idempotente)
CREATE OR REPLACE FUNCTION public.garantir_setup()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.configuracoes WHERE user_id = auth.uid()) THEN
    INSERT INTO public.configuracoes (user_id) VALUES (auth.uid());
    IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE user_id = auth.uid()) THEN
      INSERT INTO public.servicos (user_id, nome, preco_padrao) VALUES
        (auth.uid(), 'Esmaltação em gel', 0),
        (auth.uid(), 'Manutenção de fibra', 100),
        (auth.uid(), 'Manutenção de blindagem', 70),
        (auth.uid(), 'Colocação de fibra', 150),
        (auth.uid(), 'Blindagem', 100);
    END IF;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.garantir_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.garantir_setup() TO authenticated;