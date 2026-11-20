import { ChevronLeft, ChevronRight } from "lucide-react";
import { gradeMes } from "@/lib/agenda";
import { diaDoMes, diaPorExtenso, mesAno, somarDias } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const proximoMesDe = (mes: string) => somarDias(`${mes}-28`, 7).slice(0, 7);
const mesAnteriorDe = (mes: string) => somarDias(`${mes}-01`, -1).slice(0, 7);

export type EstadoDia = {
  /** Selecionado (vários dias) ou na série (repetição). */
  marcado?: boolean;
  /** Na série, mas pulado. */
  pulado?: boolean;
  /** Não dá para tocar: passado ou fora da série. */
  inativo?: boolean;
  /** Tem agendamento dentro do bloqueio (ponto âmbar). */
  aviso?: boolean;
  /** Complemento para o leitor de tela ("toque para pular"...). */
  rotulo?: string;
};

/** Mês com os dias como botões grandes; o estado de cada dia vem de quem usa. */
export function MiniCalendario({
  mes, onMes, hoje, estado, onTocar, rotulo,
}: {
  mes: string;
  onMes: (m: string) => void;
  hoje: string;
  estado: (d: string) => EstadoDia;
  onTocar: (d: string) => void;
  /** Nome do grupo de dias para o leitor de tela. */
  rotulo: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-2">
      <div className="flex items-center justify-between">
        <button type="button" className="flex size-11 items-center justify-center rounded-xl active:bg-muted" aria-label="Mês anterior" onClick={() => onMes(mesAnteriorDe(mes))}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-display text-lg" aria-live="polite">{mesAno(mes)}</span>
        <button type="button" className="flex size-11 items-center justify-center rounded-xl active:bg-muted" aria-label="Próximo mês" onClick={() => onMes(proximoMesDe(mes))}>
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground" aria-hidden>
        {SEMANA.map((s, i) => <span key={i} className="py-1">{s}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" role="group" aria-label={rotulo}>
        {gradeMes(mes).map((d) => {
          const e = estado(d);
          const fora = !d.startsWith(mes);
          const texto = [diaPorExtenso(d), d === hoje ? "hoje" : "", e.marcado ? (e.pulado ? "pulado" : "marcado") : "", e.aviso ? "tem agendamento" : "", e.rotulo ?? ""]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={d}
              type="button"
              disabled={e.inativo}
              onClick={() => onTocar(d)}
              aria-label={texto}
              aria-pressed={e.inativo ? undefined : !!e.marcado && !e.pulado}
              className={cn(
                "relative mx-auto flex size-10 items-center justify-center rounded-full text-[15px] tabular-nums transition-transform duration-150 ease-out active:scale-[0.94] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:active:scale-100",
                fora && !e.marcado && "text-muted-foreground/50",
                e.inativo && !e.marcado && "text-muted-foreground/40",
                d === hoje && !e.marcado && "font-semibold text-primary ring-1 ring-primary",
                e.marcado && !e.pulado && "bg-primary font-semibold text-primary-foreground",
                e.marcado && e.pulado && "text-muted-foreground line-through outline-dashed outline-1 -outline-offset-2 outline-muted-foreground",
              )}
            >
              {diaDoMes(d)}
              {e.aviso && e.marcado && !e.pulado && (
                <span className="absolute bottom-0.5 size-1.5 rounded-full bg-amber-400 ring-1 ring-primary-foreground" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
