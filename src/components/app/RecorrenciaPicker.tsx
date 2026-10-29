import { useEffect, useId, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useOcupadosNasDatas } from "@/lib/data";
import { gradeMes } from "@/lib/agenda";
import { dataBR, diaDoMes, diaPorExtenso, horaHM, mesAno, somarDias } from "@/lib/format";
import {
  INTERVALOS, MAX_VEZES, conflitosDasDatas, gerarDatas, intervaloValido, resumoSerie,
} from "@/lib/recorrencia";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";

const SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"];
const proximoMesDe = (mes: string) => somarDias(`${mes}-28`, 7).slice(0, 7);
const mesAnteriorDe = (mes: string) => somarDias(`${mes}-01`, -1).slice(0, 7);

/**
 * Intervalo ("a cada X dias"), quantidade de vezes e mini calendário com as datas da série.
 * Datas com horário ocupado ficam em âmbar; tocar numa data da série a pula; tocar em outro
 * dia muda a primeira data. A primeira data não pode ser pulada.
 */
export function RecorrenciaPicker({
  inicio, onInicio, hora, duracao, intervalo, onIntervalo, vezes, onVezes, puladas, onPuladas,
  hoje, ignorarIds = [], textoVezes = "incluindo este",
}: {
  inicio: string;
  onInicio: (d: string) => void;
  hora: string;
  duracao: number;
  intervalo: number;
  onIntervalo: (n: number) => void;
  vezes: number;
  onVezes: (n: number) => void;
  puladas: Set<string>;
  onPuladas: (s: Set<string>) => void;
  hoje: string;
  ignorarIds?: string[];
  textoVezes?: string;
}) {
  const id = useId();
  const datas = gerarDatas(inicio, intervalo, vezes);
  const { data: ocupados = [], isFetching } = useOcupadosNasDatas(datas);
  const conflitos = conflitosDasDatas(datas, hora, duracao, ocupados, ignorarIds);
  const resumo = resumoSerie(datas, puladas, conflitos);

  const [mes, setMes] = useState(inicio.slice(0, 7));
  useEffect(() => setMes(inicio.slice(0, 7)), [inicio]);

  const [outro, setOutro] = useState(!INTERVALOS.includes(intervalo as (typeof INTERVALOS)[number]));
  const [textoIntervalo, setTextoIntervalo] = useState(String(intervalo));
  const [textoVezesCampo, setTextoVezesCampo] = useState(String(vezes));
  useEffect(() => setTextoVezesCampo(String(vezes)), [vezes]);

  const mudarVezes = (n: number) => onVezes(Math.min(MAX_VEZES, Math.max(1, n)));

  function tocarDia(d: string) {
    const i = datas.indexOf(d);
    if (i === 0) return;
    if (i > 0) {
      const novo = new Set(puladas);
      if (novo.has(d)) novo.delete(d);
      else novo.add(d);
      onPuladas(novo);
      return;
    }
    if (d >= hoje) {
      onPuladas(new Set());
      onInicio(d);
    }
  }

  const conflitosAtivos = resumo.ativas.filter((d) => conflitos.has(d));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span id={`${id}-cada`} className="text-sm font-medium">A cada</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby={`${id}-cada`}>
          {INTERVALOS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={!outro && intervalo === n}
              onClick={() => { setOutro(false); onIntervalo(n); }}
              className={cn(
                "h-11 rounded-full border px-2 text-base tabular-nums transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                !outro && intervalo === n ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card",
              )}
            >
              {n} dias
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={outro}
            onClick={() => { setOutro(true); setTextoIntervalo(String(intervalo)); }}
            className={cn(
              "h-11 rounded-full border px-2 text-base transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              outro ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card",
            )}
          >
            Outro
          </button>
        </div>
        {outro && (
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-outro`} className="sr-only">Intervalo em dias</label>
            <Input
              id={`${id}-outro`}
              className="h-12 w-24 text-base tabular-nums"
              inputMode="numeric"
              value={textoIntervalo}
              onChange={(e) => {
                setTextoIntervalo(e.target.value);
                const n = intervaloValido(Number(e.target.value));
                if (n) onIntervalo(n);
              }}
            />
            <span className="text-sm text-muted-foreground">dias (1 a 365)</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <label htmlFor={`${id}-vezes`} className="text-sm font-medium">Quantas vezes</label>
          <p className="text-xs text-muted-foreground">{textoVezes}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => mudarVezes(vezes - 1)}
            disabled={vezes <= 1}
            className="flex size-11 items-center justify-center rounded-xl border bg-card transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none"
            aria-label="Menos uma vez"
          >
            <Minus className="size-5" />
          </button>
          <Input
            id={`${id}-vezes`}
            className="h-11 w-14 px-1 text-center text-lg font-semibold tabular-nums"
            inputMode="numeric"
            value={textoVezesCampo}
            onChange={(e) => {
              setTextoVezesCampo(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1) mudarVezes(n);
            }}
            onBlur={() => setTextoVezesCampo(String(vezes))}
          />
          <button
            type="button"
            onClick={() => mudarVezes(vezes + 1)}
            disabled={vezes >= MAX_VEZES}
            className="flex size-11 items-center justify-center rounded-xl border bg-card transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none"
            aria-label="Mais uma vez"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-2">
        <div className="flex items-center justify-between">
          <button type="button" className="flex size-11 items-center justify-center rounded-xl active:bg-muted" aria-label="Mês anterior" onClick={() => setMes(mesAnteriorDe(mes))}>
            <ChevronLeft className="size-5" />
          </button>
          <span className="font-display text-lg" aria-live="polite">{mesAno(mes)}</span>
          <button type="button" className="flex size-11 items-center justify-center rounded-xl active:bg-muted" aria-label="Próximo mês" onClick={() => setMes(proximoMesDe(mes))}>
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground" aria-hidden>
          {SEMANA.map((s, i) => <span key={i} className="py-1">{s}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {gradeMes(mes).map((d) => {
            const i = datas.indexOf(d);
            const naSerie = i >= 0;
            const pulada = puladas.has(d);
            const ocupada = naSerie && !pulada && conflitos.has(d);
            const fora = !d.startsWith(mes);
            const passado = d < hoje && !naSerie;
            const rotulo = [
              diaPorExtenso(d),
              naSerie ? `agendamento ${i + 1} de ${datas.length}` : "",
              ocupada ? "horário ocupado" : "",
              pulada ? "pulado" : "",
              i === 0 ? "primeira data" : naSerie ? (pulada ? "toque para incluir" : "toque para pular") : passado ? "" : "toque para começar aqui",
            ].filter(Boolean).join(", ");
            return (
              <button
                key={d}
                type="button"
                disabled={passado}
                onClick={() => tocarDia(d)}
                aria-label={rotulo}
                className={cn(
                  "relative mx-auto flex size-10 items-center justify-center rounded-full text-[15px] tabular-nums transition-transform duration-150 ease-out active:scale-[0.94] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  fora && !naSerie && "text-muted-foreground/50",
                  passado && "text-muted-foreground/40",
                  d === hoje && !naSerie && "font-semibold text-primary ring-1 ring-primary",
                  naSerie && !pulada && !ocupada && "bg-primary font-semibold text-primary-foreground",
                  ocupada && "bg-amber-50 font-bold text-amber-900 ring-2 ring-amber-500",
                  pulada && "text-muted-foreground line-through outline-dashed outline-1 -outline-offset-2 outline-muted-foreground",
                )}
              >
                {diaDoMes(d)}
                {ocupada && <span className="absolute bottom-1 size-1 rounded-full bg-amber-600" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Datas que serão agendadas">
        {resumo.ativas.slice(0, 5).map((d) => (
          <span
            key={d}
            className={cn(
              "rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
              conflitos.has(d) ? "bg-amber-50 text-amber-900 ring-1 ring-amber-500" : "bg-secondary text-secondary-foreground",
            )}
          >
            {dataBR(d).slice(0, 5)}
          </span>
        ))}
        {resumo.ativas.length > 5 && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[13px] font-semibold text-muted-foreground">+{resumo.ativas.length - 5}</span>
        )}
      </div>

      {conflitosAtivos.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {conflitosAtivos.slice(0, 3).map((d) => {
            const o = conflitos.get(d)!;
            return (
              <p key={d} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span><b>{dataBR(d).slice(0, 5)}: horário ocupado</b> ({o.cliente}, {horaHM(o.hora)}). Toque na data para pular.</span>
              </p>
            );
          })}
          {conflitosAtivos.length > 3 && <p className="pl-6">e mais {plural(conflitosAtivos.length - 3, "data", "datas")}.</p>}
        </div>
      )}

      <p className="text-sm text-muted-foreground tabular-nums">
        {plural(resumo.ativas.length, "agendamento", "agendamentos")}
        {resumo.ultima ? ` · até ${dataBR(resumo.ultima)}` : ""}
        {resumo.puladas > 0 ? ` · ${plural(resumo.puladas, "pulado", "pulados")}` : ""}
        {isFetching ? " · conferindo horários…" : ""}
      </p>
    </div>
  );
}
