-- 0010_bloqueios.sql
-- Bloqueio de horário na agenda: dias ou horários em que a Ana não atende (compromisso,
-- consulta, folga). Cada bloqueio é de um dia, com hora de início e fim ou o dia inteiro.
-- Bloqueios criados juntos ("Vários dias" ou "Repetir") dividem o mesmo serie_id.
-- O banco recusa agendamento novo ou remarcado que caia num bloqueio. O que já estava marcado
-- quando o bloqueio foi criado continua marcado (o app avisa) e pode ser concluído, cancelado,
-- ajustado dentro do mesmo bloqueio ou voltar para agendado. Atendimento registrado direto como
-- concluído ('realizado') não é barrado.
-- Aplicar no SQL editor do Lovable Cloud ANTES de publicar o código. Pode rodar de novo sem erro.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bloqueios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  data        date NOT NULL,
  hora_inicio time,  -- hora_inicio e hora_fim nulas = dia inteiro
  hora_fim    time,
  descricao   text,
  serie_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bloqueios_horas_check CHECK (
    (hora_inicio IS NULL AND hora_fim IS NULL)
    OR (hora_inicio IS NOT NULL AND hora_fim IS NOT NULL AND hora_fim > hora_inicio)
  ),
  CONSTRAINT bloqueios_descricao_check CHECK (descricao IS NULL OR char_length(descricao) <= 120)
);
CREATE INDEX IF NOT EXISTS bloqueios_user_data_idx ON public.bloqueios (user_id, data);
CREATE INDEX IF NOT EXISTS bloqueios_serie_idx ON public.bloqueios (user_id, serie_id, data) WHERE serie_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloqueios TO authenticated;
GRANT ALL ON public.bloqueios TO service_role;
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bloqueios_own" ON public.bloqueios;
CREATE POLICY "bloqueios_own" ON public.bloqueios FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Recusa um 'agendado' que entre num bloqueio. Confere quando ele é criado e quando muda de
-- data, hora ou duração; ao mudar, só conta bloqueio em que ele ainda não estava (quem já estava
-- dentro de um bloqueio pode ser ajustado sem sair dele). Só mudar o status não confere: assim
-- "Desfazer" e "Voltar para agendado" sempre funcionam.
-- Horários em minutos do dia; sem hora, o agendamento só bate com bloqueio de dia inteiro.
CREATE OR REPLACE FUNCTION public.checar_bloqueio_atendimento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  b public.bloqueios%ROWTYPE;
  v_ini integer;
  v_fim integer;
  o_data date;
  o_ini integer;
  o_fim integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'agendado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.data = OLD.data AND NEW.hora IS NOT DISTINCT FROM OLD.hora AND NEW.duracao_min = OLD.duracao_min THEN
      RETURN NEW;
    END IF;
    o_data := OLD.data;
    o_ini := extract(epoch FROM OLD.hora)::integer / 60;
    o_fim := o_ini + OLD.duracao_min;
  END IF;
  v_ini := extract(epoch FROM NEW.hora)::integer / 60;
  v_fim := v_ini + NEW.duracao_min;

  SELECT * INTO b
    FROM public.bloqueios x
   WHERE x.user_id = NEW.user_id
     AND x.data = NEW.data
     AND (x.hora_inicio IS NULL
          OR (v_ini IS NOT NULL
              AND v_ini < extract(epoch FROM x.hora_fim)::integer / 60
              AND extract(epoch FROM x.hora_inicio)::integer / 60 < v_fim))
     AND NOT COALESCE(
           x.data = o_data
           AND (x.hora_inicio IS NULL
                OR (o_ini IS NOT NULL
                    AND o_ini < extract(epoch FROM x.hora_fim)::integer / 60
                    AND extract(epoch FROM x.hora_inicio)::integer / 60 < o_fim)),
           false)
   ORDER BY x.hora_inicio NULLS FIRST
   LIMIT 1;

  IF FOUND THEN
    IF b.hora_inicio IS NULL THEN
      RAISE EXCEPTION 'Dia % está bloqueado%', to_char(NEW.data, 'DD/MM'),
        COALESCE(' (' || nullif(btrim(b.descricao), '') || ')', '');
    END IF;
    RAISE EXCEPTION 'Horário bloqueado em %, das % às %', to_char(NEW.data, 'DD/MM'),
      to_char(b.hora_inicio, 'HH24:MI'),
      to_char(b.hora_fim, 'HH24:MI') || COALESCE(' (' || nullif(btrim(b.descricao), '') || ')', '');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_checar_bloqueio_atendimento ON public.atendimentos;
CREATE TRIGGER trg_checar_bloqueio_atendimento
BEFORE INSERT OR UPDATE OF data, hora, duracao_min ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.checar_bloqueio_atendimento();

COMMIT;
