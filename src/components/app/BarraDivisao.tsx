import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/**
 * Barra de parte-de-um-todo: parte da Ana × parte da dona do salão, com legenda (nome, % e valor).
 * Barra fina, 2px de folga entre os segmentos e ponta arredondada só no fim; a cor nunca fica
 * sozinha — a legenda sempre diz quem é quem.
 */
export function BarraDivisao({ ana, dona, nomeDona, className }: { ana: number; dona: number; nomeDona: string; className?: string }) {
  const total = ana + dona;
  if (total <= 0) return null;
  const pAna = pct(ana, total);
  const pDona = 100 - pAna;

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        role="img"
        aria-label={`Divisão: Ana ${pAna}%, ${brl(ana)}; ${nomeDona} ${pDona}%, ${brl(dona)}`}
        className="flex h-3.5 w-full gap-0.5"
      >
        {ana > 0 && (
          <div className={cn("h-full bg-parte-ana", dona > 0 ? "" : "rounded-r-[4px]")} style={{ width: `${(ana / total) * 100}%` }} />
        )}
        {dona > 0 && <div className="h-full flex-1 rounded-r-[4px] bg-parte-dona" />}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-parte-ana" /> Ana · {pAna}%
          </dt>
          <dd className="text-lg font-semibold tabular-nums">{brl(ana)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-parte-dona" /> {nomeDona} · {pDona}%
          </dt>
          <dd className="text-lg font-semibold tabular-nums">{brl(dona)}</dd>
        </div>
      </dl>
    </div>
  );
}
