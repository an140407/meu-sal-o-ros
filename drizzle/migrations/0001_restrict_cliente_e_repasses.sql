ALTER TABLE public.atendimentos DROP CONSTRAINT atendimentos_cliente_id_fkey;
ALTER TABLE public.atendimentos ADD CONSTRAINT atendimentos_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;

CREATE TABLE public.repasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  mes_referencia text NOT NULL CHECK (mes_referencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor numeric(10,2) NOT NULL,
  data_recebimento date NOT NULL DEFAULT current_date,
  observacao text,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repasses TO authenticated;
GRANT ALL ON public.repasses TO service_role;
ALTER TABLE public.repasses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repasses_own" ON public.repasses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());