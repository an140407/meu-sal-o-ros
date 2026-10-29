import { useEffect, useId, useRef } from "react";
import { AlertCircle, CircleCheck, Split, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FORMAS, brl, parseValor } from "@/lib/format";
import {
  MAX_PARTES, dividirPagamento, resumoPagamentos, taxaDaForma, valorParaCampo, type ParteForm, type Taxas,
} from "@/lib/pagamentos";
import { cn } from "@/lib/utils";

const pctBR = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * Como a cliente pagou: uma ou mais partes (até 4), cada uma com forma e valor em R$.
 * Com uma parte só, ela acompanha o total quando os serviços mudam. A validação final
 * fica em validarPagamentos.
 */
export function PagamentosPicker({
  total, partes, onChange, taxas,
}: {
  total: number;
  partes: ParteForm[];
  onChange: (partes: ParteForm[]) => void;
  taxas: Taxas;
}) {
  const id = useId();
  const r = resumoPagamentos(partes, total, taxas);

  // Parte única acompanha o total (ex.: removeu um serviço).
  const totalAnterior = useRef(total);
  useEffect(() => {
    if (totalAnterior.current === total) return;
    totalAnterior.current = total;
    if (partes.length === 1) onChange([{ ...partes[0]!, valor: valorParaCampo(total) }]);
  }, [total, partes, onChange]);

  const alterar = (key: string, patch: Partial<ParteForm>) =>
    onChange(partes.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  if (Math.round(total * 100) === 0) {
    return (
      <div className="space-y-2">
        <span className="text-sm font-medium">Pagamento</span>
        <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">Sem cobrança: total R$ 0,00.</p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2" aria-labelledby={`${id}-titulo`}>
      <div className="flex items-center justify-between">
        <span id={`${id}-titulo`} className="text-sm font-medium">Pagamento</span>
        <button
          type="button"
          onClick={() => onChange(dividirPagamento(partes, total))}
          disabled={partes.length >= MAX_PARTES}
          className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-40 motion-reduce:transform-none"
        >
          <Split className="size-4" aria-hidden /> Dividir
        </button>
      </div>

      <ul className="space-y-2">
        {partes.map((p, i) => {
          const taxa = taxaDaForma(p.forma, taxas);
          const valor = parseValor(p.valor);
          const campo = `${id}-valor-${p.key}`;
          return (
            <li key={p.key} className="rounded-2xl border bg-card p-2.5">
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`Forma da parte ${i + 1}`}>
                {FORMAS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={p.forma === f.value}
                    onClick={() => alterar(p.key, { forma: f.value })}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-medium transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      p.forma === f.value ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <label htmlFor={campo} className="sr-only">Valor da parte {i + 1} em reais</label>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    id={campo}
                    className="h-12 pl-10 text-base tabular-nums"
                    inputMode="decimal"
                    value={p.valor}
                    onChange={(e) => alterar(p.key, { valor: e.target.value })}
                  />
                </div>
                {partes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(partes.filter((x) => x.key !== p.key))}
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transform-none"
                    aria-label={`Remover parte ${i + 1}`}
                  >
                    <Trash2 className="size-5" />
                  </button>
                )}
              </div>
              {taxa > 0 && Number.isFinite(valor) && valor > 0 && (
                <p className="mt-1.5 px-1 text-xs text-muted-foreground tabular-nums">
                  Taxa {pctBR(taxa)} · desconta {brl((valor * taxa) / 100)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm tabular-nums",
          r.fechou
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : r.diferenca < 0
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-900",
        )}
      >
        {r.fechou ? <CircleCheck className="size-4 shrink-0" aria-hidden /> : <AlertCircle className="size-4 shrink-0" aria-hidden />}
        {r.fechou ? (
          <span>
            Fechou <b>{brl(total)}</b>
            {r.taxas > 0 && <> · líquido <b>{brl(r.liquido)}</b></>}
          </span>
        ) : r.invalida ? (
          <span>Preencha o valor de cada parte.</span>
        ) : r.diferenca > 0 ? (
          <span>Faltam <b>{brl(r.diferenca)}</b> de {brl(total)}</span>
        ) : (
          <span>Passou <b>{brl(-r.diferenca)}</b> do total de {brl(total)}</span>
        )}
      </p>
    </fieldset>
  );
}
