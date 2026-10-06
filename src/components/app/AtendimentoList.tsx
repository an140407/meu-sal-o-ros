import { brl, dataHora, formaLabel, mesAno } from "@/lib/format";
import type { Atendimento } from "@/lib/data";
import { nomesItens } from "@/lib/itens";

export function AtendimentoList({
  itens, onSelect, mostrarCliente = true, nomeDona,
}: {
  itens: Atendimento[];
  onSelect: (a: Atendimento) => void;
  mostrarCliente?: boolean;
  nomeDona?: string;
}) {
  const grupos = new Map<string, Atendimento[]>();
  for (const a of itens) {
    const k = a.data.slice(0, 7);
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
  }
  return (
    <div className="space-y-6 px-5">
      {[...grupos.entries()].map(([mes, lista]) => {
        const bruto = lista.reduce((s, a) => s + Number(a.valor_bruto), 0);
        const liquido = lista.reduce((s, a) => s + Number(a.valor_liquido), 0);
        const ana = lista.reduce((s, a) => s + Number(a.valor_liquido) * Number(a.percentual_ana) / 100, 0);
        return (
          <section key={mes}>
            <div className="mb-2 rounded-2xl bg-rose-gradient p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl">{mesAno(mes)}</h2>
                <span className="text-sm text-muted-foreground">{lista.length} atend.</span>
              </div>
              {nomeDona !== undefined && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-muted-foreground">Bruto</div><div className="font-semibold">{brl(bruto)}</div></div>
                  <div><div className="text-muted-foreground">Ana</div><div className="font-semibold">{brl(ana)}</div></div>
                  <div><div className="text-muted-foreground">{nomeDona}</div><div className="font-semibold">{brl(liquido - ana)}</div></div>
                </div>
              )}
            </div>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {lista.map((a) => (
                <li key={a.id}>
                  <button onClick={() => onSelect(a)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-muted">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {mostrarCliente ? a.clientes?.nome ?? "—" : nomesItens(a.itens)}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {dataHora(a.data, a.hora)} · {mostrarCliente ? `${nomesItens(a.itens)} · ` : ""}{formaLabel(a.forma_pagamento)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{brl(a.valor_bruto)}</div>
                      {Number(a.taxa_percentual) > 0 && (
                        <div className="text-xs text-muted-foreground">líq. {brl(a.valor_liquido)}</div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
