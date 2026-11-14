import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Banknote, BarChart3, ChevronRight, CircleCheck, Copy, CreditCard, QrCode, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/ui-bits";
import { SeletorMes } from "@/components/app/SeletorMes";
import { BarraDivisao } from "@/components/app/BarraDivisao";
import { useConfirmarRepasses } from "@/components/app/useConfirmarRepasses";
import {
  excluirRepasses, useAtendimentosMes, useConfig, useDespesas, useRealizadosDesde, useRepassesDiarios,
} from "@/lib/data";
import {
  INICIO_ACERTO_DIARIO, acertosPorDia, divisao, pendencias, quemManda, repassesParaAcertar, somaRepasses,
  type AcertoDia, type RepasseDiario,
} from "@/lib/acerto";
import { resumoDespesas } from "@/lib/despesas";
import { nomesItens } from "@/lib/itens";
import { partesTexto, totaisPorForma } from "@/lib/pagamentos";
import { mensagemErro } from "@/lib/erros";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";
import {
  brl, buscaMes, dataBR, dataHora, diaSemanaCurto, formaLabel, hojeISO, horaDoInstante, mesAno, type Forma,
} from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/acerto")({
  validateSearch: buscaMes,
  head: () => ({
    meta: [
      { title: "Acerto — Lunula" },
      { name: "description", content: "Produção do mês, parte de cada uma e o acerto diário com a dona do salão." },
      { property: "og:title", content: "Acerto — Lunula" },
      { property: "og:description", content: "Produção do mês, parte de cada uma e o acerto diário com a dona do salão." },
    ],
  }),
  component: Page,
});

const r2 = (n: number) => Math.round(n * 100) / 100;
const ICONE_FORMA: Record<Forma, typeof QrCode> = { pix: QrCode, dinheiro: Banknote, debito: CreditCard, credito: CreditCard };
const diaCurto = (iso: string) => `${diaSemanaCurto(iso)}, ${dataBR(iso).slice(0, 5)}`;

function Page() {
  const navigate = Route.useNavigate();
  const hoje = hojeISO();
  const mes = Route.useSearch().mes ?? hoje.slice(0, 7);
  const setMes = (m: string) => navigate({ search: { mes: m }, replace: true });
  const { data: atends = [], isLoading } = useAtendimentosMes(mes);
  const { data: despesas = [] } = useDespesas(mes);
  const { data: realizados = [] } = useRealizadosDesde(INICIO_ACERTO_DIARIO);
  const { data: repasses = [] } = useRepassesDiarios(INICIO_ACERTO_DIARIO);
  const { data: cfg } = useConfig();
  const dona = cfg?.nome_dona ?? "Simone";

  const d = divisao(atends);
  const pctAna = d.liquido > 0 ? Math.round((d.ana / d.liquido) * 100) : 0;
  const repassesMes = repasses.filter((r) => r.dia.startsWith(mes));
  const anaMandou = r2(repassesMes.filter((r) => r.de === "ana").reduce((s, r) => s + Number(r.valor), 0));
  const donaMandou = r2(repassesMes.filter((r) => r.de === "simone").reduce((s, r) => s + Number(r.valor), 0));
  const acertos = acertosPorDia(realizados, repasses);
  const pendente = pendencias(acertos);
  // Só informativo: despesas não entram na divisão nem no acerto.
  const totalDespesas = resumoDespesas(despesas).total;
  const lucroReal = r2(d.ana - totalDespesas);
  const porForma = totaisPorForma(atends);

  async function copiar() {
    const linhas = [
      `Acerto ${mesAno(mes)}`,
      "",
      ...atends.map((a) => {
        const base = `${dataHora(a.data, a.hora)} - ${a.clientes?.nome ?? "—"} - ${nomesItens(a.itens)} - ${brl(a.valor_bruto)}`;
        const recebeuDona = a.pagamentos.some((p) => p.recebedor === "simone");
        return a.pagamentos.length > 1 || recebeuDona ? `${base} (${partesTexto(a.pagamentos, dona)})` : base;
      }),
      "",
      `Produção: ${brl(d.bruto)}`,
      ...(d.taxas > 0 ? [`Taxas: ${brl(d.taxas)}`, `Líquido: ${brl(d.liquido)}`] : []),
      `Parte da Ana (${pctAna}%): ${brl(d.ana)}`,
      `Parte da ${dona} (${100 - pctAna}%): ${brl(d.dona)}`,
      `Recebido pela Ana: ${brl(d.recebido.ana)} · pela ${dona}: ${brl(d.recebido.simone)}`,
      `Repasses no mês: Ana → ${dona} ${brl(anaMandou)} · ${dona} → Ana ${brl(donaMandou)}`,
      `Situação do acerto hoje: ${quemManda(pendente.falta, dona).texto}`,
      ...(porForma.length > 0
        ? ["", "Por forma de pagamento:", ...porForma.map((f) => `${formaLabel(f.forma)}: ${brl(f.valor)}${f.taxa > 0 ? ` (taxa ${brl(f.taxa)})` : ""}`)]
        : []),
    ];
    try {
      await navigator.clipboard.writeText(linhas.join("\n"));
      toast.success("Resumo copiado. É só colar no WhatsApp.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const linha = (label: string, valor: number, forte = false) => (
    <div className="flex justify-between py-1.5">
      <span className={forte ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", forte && "font-semibold")}>{brl(valor)}</span>
    </div>
  );

  return (
    <>
      <PageHeader title="Acerto" />
      <div className="space-y-5 px-5">
        <AcertoComDona dona={dona} pendente={pendente} hoje={hoje} />

        <SeletorMes mes={mes} onChange={setMes} max={hoje.slice(0, 7)} />

        <section aria-labelledby="producao-titulo" className="space-y-4 rounded-2xl bg-rose-gradient p-4">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="producao-titulo" className="text-xl">Produção de {mesAno(mes).split(" ")[0]?.toLowerCase()}</h2>
              <span className="text-sm text-muted-foreground">{plural(d.atendimentos, "atendimento", "atendimentos")}</span>
            </div>
            {isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
              <p className="font-display text-4xl tabular-nums">{brl(d.bruto)}</p>
            )}
          </div>
          {!isLoading && d.liquido > 0 && (
            <>
              <div className="rounded-xl bg-card p-3">
                <BarraDivisao ana={d.ana} dona={d.dona} nomeDona={dona} />
              </div>
              <div className="divide-y divide-border">
                {d.taxas > 0 && (
                  <div>
                    {linha("Total bruto", d.bruto)}
                    {linha("Taxas", d.taxas)}
                    {linha("Total líquido", d.liquido, true)}
                  </div>
                )}
                <div>
                  {linha("Recebido pela Ana", d.recebido.ana)}
                  {linha(`Recebido pela ${dona}`, d.recebido.simone)}
                </div>
                <div>
                  {linha(`Ana mandou pra ${dona}`, anaMandou)}
                  {linha(`${dona} mandou pra Ana`, donaMandou)}
                </div>
              </div>
            </>
          )}
        </section>

        <RepassesDoMes mes={mes} repasses={repassesMes} dona={dona} />

        {porForma.length > 0 && (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-1 text-xl">Por forma de pagamento</h2>
            <ul className="divide-y">
              {porForma.map((f) => {
                const Icone = ICONE_FORMA[f.forma];
                return (
                  <li key={f.forma} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2 text-muted-foreground"><Icone className="size-[18px]" aria-hidden /> {formaLabel(f.forma)}</span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{brl(f.valor)}</span>
                      {f.taxa > 0 && <span className="ml-1.5 text-xs text-muted-foreground">− {brl(f.taxa)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Button size="xl" variant="secondary" onClick={copiar}><Copy /> Copiar resumo</Button>

        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 text-xl">Lucro real da Ana</h2>
          <div className="divide-y divide-border">
            <div>
              {linha("Parte da Ana", d.ana)}
              {linha("Despesas do mês", -totalDespesas)}
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-semibold">Lucro real</span>
              <span className={cn("font-semibold tabular-nums", lucroReal < 0 && "text-destructive")}>{brl(lucroReal)}</span>
            </div>
          </div>
          <Link
            to="/despesas"
            search={{ mes }}
            className="mt-2 flex h-12 items-center justify-between rounded-xl px-1 font-medium text-primary active:bg-muted"
          >
            Ver despesas <ChevronRight className="size-5" aria-hidden />
          </Link>
        </section>

        <Link
          to="/estatisticas"
          className="flex h-14 items-center justify-between rounded-2xl border bg-card px-4 font-medium active:bg-muted"
        >
          <span className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" aria-hidden /> Estatísticas</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </>
  );
}

/** Quanto falta acertar entre as duas (todos os dias desde o início do acerto diário). */
function AcertoComDona({ dona, pendente, hoje }: { dona: string; pendente: { falta: number; dias: AcertoDia[] }; hoje: string }) {
  const { confirmar, gravando } = useConfirmarRepasses(dona);
  const situacao = quemManda(pendente.falta, dona);
  const emDia = pendente.dias.length === 0;

  return (
    <section aria-labelledby="acerto-titulo" className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="acerto-titulo" className="text-xl">Acerto com a {dona}</h2>
        <span className="text-xs text-muted-foreground">desde {dataBR(INICIO_ACERTO_DIARIO).slice(0, 5)}</span>
      </div>

      {emDia ? (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-900">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          {hoje < INICIO_ACERTO_DIARIO ? `Tudo acertado. O acerto diário começa em ${dataBR(INICIO_ACERTO_DIARIO).slice(0, 5)}.` : "Tudo acertado. Ninguém deve nada."}
        </p>
      ) : (
        <>
          <div className={cn("rounded-xl p-3", situacao.de === "ana" ? "bg-secondary" : "bg-amber-50 ring-1 ring-amber-300")}>
            <p className="text-sm font-medium">{situacao.de === "ana" ? `Falta a Ana mandar pra ${dona}` : `Falta a ${dona} mandar pra Ana`}</p>
            <p className="font-display text-3xl tabular-nums">{brl(situacao.valor)}</p>
            <p className="text-xs text-muted-foreground">
              Soma de {plural(pendente.dias.length, "dia em aberto", "dias em aberto")}. Confirme cada dia quando o pix for feito.
            </p>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border">
            {pendente.dias.map((a) => {
              const s = quemManda(a.falta, dona);
              return (
                <li key={a.dia} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/agenda"
                      search={{ dia: a.dia }}
                      className="inline-flex min-h-6 items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {diaCurto(a.dia)} <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                    </Link>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {s.de === "ana" ? `Ana → ${dona}` : `${dona} → Ana`} · <b className="text-foreground">{brl(s.valor)}</b>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0 rounded-xl px-3"
                    disabled={gravando}
                    onClick={() => void confirmar(repassesParaAcertar([a]))}
                    aria-label={`Confirmar repasse de ${diaCurto(a.dia)}: ${s.texto}`}
                  >
                    Confirmar
                  </Button>
                </li>
              );
            })}
          </ul>
          {pendente.dias.length > 1 && (
            <Button type="button" className="h-12 w-full rounded-xl" disabled={gravando} onClick={() => void confirmar(repassesParaAcertar(pendente.dias))}>
              <Send aria-hidden /> Confirmar os {pendente.dias.length} dias
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/** Repasses confirmados no mês, com opção de apagar um lançado por engano. */
function RepassesDoMes({ mes, repasses, dona }: { mes: string; repasses: RepasseDiario[]; dona: string }) {
  const qc = useQueryClient();
  const [apagar, setApagar] = useState<RepasseDiario | null>(null);
  const [apagando, setApagando] = useState(false);
  if (repasses.length === 0) return null;
  const lista = [...repasses].sort((a, b) => b.dia.localeCompare(a.dia) || b.created_at.localeCompare(a.created_at));
  const saldo = somaRepasses(repasses);

  async function confirmarApagar() {
    if (!apagar) return;
    setApagando(true);
    try {
      await excluirRepasses([apagar.id]);
      await qc.invalidateQueries({ queryKey: ["repasses-diarios"] });
      toast.success("Repasse apagado. O dia volta a aparecer em aberto.");
      setApagar(null);
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível apagar."));
    } finally {
      setApagando(false);
    }
  }

  return (
    <section aria-labelledby="repasses-titulo" className="rounded-2xl border bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="repasses-titulo" className="text-xl">Repasses de {mesAno(mes).split(" ")[0]?.toLowerCase()}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{plural(repasses.length, "repasse", "repasses")}</span>
      </div>
      <ul className="divide-y">
        {lista.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{diaCurto(r.dia)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {r.de === "ana" ? `Ana → ${dona}` : `${dona} → Ana`} · confirmado às {horaDoInstante(r.created_at)}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{brl(r.valor)}</span>
            <button
              type="button"
              onClick={() => setApagar(r)}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Apagar repasse de ${diaCurto(r.dia)}, ${brl(r.valor)}`}
            >
              <Trash2 className="size-[18px]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 border-t pt-2 text-sm text-muted-foreground tabular-nums">
        Saldo dos repasses no mês: {quemManda(saldo, dona).de === null ? "zerado" : `${saldo > 0 ? `Ana → ${dona}` : `${dona} → Ana`} ${brl(Math.abs(saldo))}`}
      </p>

      <AlertDialog open={!!apagar} onOpenChange={(o) => !o && !apagando && setApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Apagar este repasse?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagar && `${diaCurto(apagar.dia)} · ${apagar.de === "ana" ? `Ana → ${dona}` : `${dona} → Ana`} · ${brl(apagar.valor)}. `}
              Use só se foi confirmado por engano: o dia volta a aparecer em aberto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 h-11" disabled={apagando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={apagando}
              onClick={(e) => { e.preventDefault(); void confirmarApagar(); }}
            >
              {apagando ? "Apagando…" : "Apagar repasse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
