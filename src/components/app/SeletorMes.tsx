import { ChevronLeft, ChevronRight } from "lucide-react";
import { mesAno, somarDias } from "@/lib/format";
import { cn } from "@/lib/utils";

const mesAnterior = (mes: string) => somarDias(`${mes}-01`, -1).slice(0, 7);
const proximoMes = (mes: string) => somarDias(`${mes}-28`, 7).slice(0, 7);

const SETA =
  "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 ease-out active:scale-[0.94] active:bg-muted disabled:opacity-30 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** ‹ Novembro de 2026 › — troca de mês com setas de 44px. `max` ("YYYY-MM") trava o avanço. */
export function SeletorMes({ mes, onChange, max, className }: { mes: string; onChange: (m: string) => void; max?: string; className?: string }) {
  const podeAvancar = !max || mes < max;
  return (
    <div className={cn("flex h-14 items-center justify-between gap-2 rounded-2xl border bg-card px-1.5", className)}>
      <button type="button" className={SETA} aria-label={`Mês anterior (${mesAno(mesAnterior(mes))})`} onClick={() => onChange(mesAnterior(mes))}>
        <ChevronLeft className="size-6" aria-hidden />
      </button>
      <span className="font-display text-xl" aria-live="polite">{mesAno(mes)}</span>
      <button
        type="button"
        className={SETA}
        aria-label={`Próximo mês (${mesAno(proximoMes(mes))})`}
        disabled={!podeAvancar}
        onClick={() => onChange(proximoMes(mes))}
      >
        <ChevronRight className="size-6" aria-hidden />
      </button>
    </div>
  );
}
