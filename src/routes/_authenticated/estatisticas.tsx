import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { Empty } from "@/components/app/ui-bits";
import { proximoMes, useAtendimentosPeriodo } from "@/lib/data";
import { estatisticas, mesCurto, mesesPeriodo, type Ranking } from "@/lib/estatisticas";
import { brl, hojeISO, mesAno } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estatisticas")({
  head: () => ({
    meta: [
      { title: "Estatísticas — Caderno da Nail" },
      { name: "description", content: "Faturamento, serviços e clientes dos últimos meses." },
      { property: "og:title", content: "Estatísticas — Caderno da Nail" },
      { property: "og:description", content: "Faturamento, serviços e clientes dos últimos meses." },
    ],
  }),
  component: Page,
});

const PERIODOS = [3, 6, 12] as const;

// Par validado (lightness, chroma, CVD e contraste sobre o card branco).
const chartConfig = {
  bruto: { label: "Faturamento bruto", color: "oklch(0.68 0.13 12)" },
  ana: { label: "Parte da Ana", color: "oklch(0.48 0.12 330)" },
} satisfies ChartConfig;

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Page() {
  const router = useRouter();
  const [periodo, setPeriodo] = useState<number>(6);
  const meses = mesesPeriodo(hojeISO().slice(0, 7), periodo);
  const { data = [], isLoading } = useAtendimentosPeriodo(`${meses[0]}-01`, proximoMes(meses[meses.length - 1]!));
  const e = estatisticas(data, meses);
  const vazio = e.totalAgendamentos === 0;

  return (
    <>
      <header className="px-5 pb-3 pt-6">
        <button type="button" onClick={() => router.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Voltar
        </button>
        <h1 className="mt-2 text-3xl text-foreground">Estatísticas</h1>
      </header>
      <div className="space-y-5 px-5 pb-6">
        <div className="grid grid-cols-3 gap-2">
          {PERIODOS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={periodo === p ? "default" : "outline"}
              className="h-12 rounded-xl text-base"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
            >
              {p} meses
            </Button>
          ))}
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">
          {mesAno(meses[0]!)} a {mesAno(meses[meses.length - 1]!)}
        </p>

        {isLoading ? <Empty>Carregando...</Empty> : vazio ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-rose-gradient px-5 py-10 text-center">
            <BarChart3 className="size-8 text-primary" />
            <p className="font-semibold">Ainda não há atendimentos neste período</p>
            <p className="text-sm text-muted-foreground">Conforme você concluir atendimentos, os números aparecem aqui.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Faturamento bruto" valor={brl(e.bruto)} />
              <Tile label="Parte da Ana" valor={brl(e.ana)} />
              <Tile label="Atendimentos" valor={String(e.realizados)} />
              <Tile label="Ticket médio" valor={brl(e.ticketMedio)} />
              <div className="col-span-2">
                <Tile
                  label="Faltas e cancelamentos"
                  valor={pct(e.taxaFaltasCancelamentos)}
                  detalhe={`${e.faltas} falta(s) e ${e.cancelados} cancelamento(s) em ${e.totalAgendamentos} agendamento(s)`}
                />
              </div>
            </div>

            <section className="rounded-2xl border bg-card p-4">
              <h2 className="text-xl">Faturamento por mês</h2>
              <p className="mb-3 text-sm text-muted-foreground">Só atendimentos realizados.</p>
              <ChartContainer config={chartConfig} className="aspect-[4/3] w-full">
                <BarChart data={e.porMes} margin={{ left: 0, right: 4, top: 8 }} barGap={2} barCategoryGap="20%">
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={mesCurto} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v: number) => compacto.format(v)} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip
                    cursor={{ fillOpacity: 0.5 }}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, p) => mesAno(String(p?.[0]?.payload?.mes ?? ""))}
                        formatter={(value, name, item) => (
                          <div className="flex w-full items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} />
                              {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                            </span>
                            <span className="font-medium tabular-nums text-foreground">{brl(Number(value))}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="bruto" fill="var(--color-bruto)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="ana" fill="var(--color-ana)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ChartContainer>
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">Faturamento bruto e parte da Ana por mês</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1.5 text-left font-normal">Mês</th>
                    <th className="py-1.5 text-right font-normal">Atend.</th>
                    <th className="py-1.5 text-right font-normal">Bruto</th>
                    <th className="py-1.5 text-right font-normal">Ana</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {[...e.porMes].reverse().map((m) => (
                    <tr key={m.mes}>
                      <td className="py-1.5">{mesCurto(m.mes)}</td>
                      <td className="py-1.5 text-right">{m.qtd}</td>
                      <td className="py-1.5 text-right">{brl(m.bruto)}</td>
                      <td className="py-1.5 text-right">{brl(m.ana)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <Top titulo="Serviços mais feitos" itens={e.topServicos} vazio="Nenhum serviço realizado no período." />
            <Top titulo="Clientes mais frequentes" itens={e.topClientes} vazio="Nenhuma cliente atendida no período." />
          </>
        )}
      </div>
    </>
  );
}

function Tile({ label, valor, detalhe }: { label: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

function Top({ titulo, itens, vazio }: { titulo: string; itens: Ranking[]; vazio: string }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="mb-2 text-xl">{titulo}</h2>
      {itens.length === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : (
        <ol className="divide-y">
          {itens.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.nome}</span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <span className="font-semibold">{r.qtd}×</span>
                <span className="block text-xs text-muted-foreground">{brl(r.valor)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
