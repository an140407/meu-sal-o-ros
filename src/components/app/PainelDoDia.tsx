import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarraDivisao } from "@/components/app/BarraDivisao";
import { useConfirmarRepasses } from "@/components/app/useConfirmarRepasses";
import { useRealizadosDesde, useRepassesDiarios, type Atendimento } from "@/lib/data";
import {
  INICIO_ACERTO_DIARIO, acertoDoDia, acertosPorDia, pendencias, quemManda, zerado,
} from "@/lib/acerto";
import { brl, dataBR, horaDoInstante } from "@/lib/format";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";

/**
 * Faixa da Agenda (Dia): quanto a Ana produziu, a parte de cada uma e quem manda quanto pra quem
 * no dia — já descontando o que a dona recebeu direto e os repasses confirmados.
 */
export function PainelDoDia({ dia, atendimentos, dona }: { dia: string; atendimentos: Atendimento[]; dona: string }) {
  const controlado = dia >= INICIO_ACERTO_DIARIO;
  const { data: repasses = [] } = useRepassesDiarios(INICIO_ACERTO_DIARIO);
  const { data: realizados = [] } = useRealizadosDesde(INICIO_ACERTO_DIARIO);
  const { confirmar, gravando } = useConfirmarRepasses(dona);

  const acerto = acertoDoDia(dia, atendimentos, controlado ? repasses : []);
  const previstos = atendimentos.filter((a) => a.status === "agendado");
  const valorPrevisto = previstos.reduce((s, a) => s + Number(a.valor_bruto), 0);

  // Pendências de outros dias (o dia aberto usa os dados da tela, mais frescos).
  const outros = pendencias(acertosPorDia(realizados, repasses).filter((a) => a.dia !== dia));

  if (acerto.atendimentos === 0 && acerto.repasses.length === 0) {
    if (previstos.length === 0) return null;
    return (
      <p className="flex items-center justify-between gap-3 rounded-2xl border border-dashed bg-card/60 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Previsto do dia · {plural(previstos.length, "agendamento", "agendamentos")}</span>
        <span className="font-semibold tabular-nums">{brl(valorPrevisto)}</span>
      </p>
    );
  }

  const situacao = quemManda(acerto.falta, dona);
  const recebeuDona = acerto.recebido.simone > 0;

  return (
    <section aria-labelledby="painel-dia-titulo" className="space-y-4 rounded-2xl border bg-card p-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="painel-dia-titulo" className="text-sm font-medium text-muted-foreground">Produção do dia</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {plural(acerto.atendimentos, "concluído", "concluídos")}
            {previstos.length > 0 && ` · + ${brl(valorPrevisto)} previsto`}
          </span>
        </div>
        <p className="font-display text-3xl tabular-nums">{brl(acerto.bruto)}</p>
        {acerto.taxas > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Líquido {brl(acerto.liquido)} · taxas {brl(acerto.taxas)}
          </p>
        )}
      </div>

      <BarraDivisao ana={acerto.ana} dona={acerto.dona} nomeDona={dona} />

      <p className="text-sm text-muted-foreground tabular-nums">
        {recebeuDona
          ? <>Recebeu: Ana <b className="text-foreground">{brl(acerto.recebido.ana)}</b> · {dona} <b className="text-foreground">{brl(acerto.recebido.simone)}</b></>
          : "Todos os pagamentos ficaram com a Ana."}
      </p>

      {!controlado ? (
        <p className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          Até 14/11 ficou tudo acertado. O acerto diário começa em {dataBR(INICIO_ACERTO_DIARIO)}.
        </p>
      ) : zerado(acerto.falta) ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">{acerto.repasses.length > 0 ? "Repasse do dia feito" : "Nada a acertar neste dia"}</p>
            {acerto.repasses.map((r) => (
              <p key={r.id} className="tabular-nums">
                {r.de === "ana" ? `Ana → ${dona}` : `${dona} → Ana`} · {brl(r.valor)} · {horaDoInstante(r.created_at)}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className={cn("space-y-3 rounded-xl p-3", situacao.de === "ana" ? "bg-secondary" : "bg-amber-50 ring-1 ring-amber-300")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              {situacao.de === "ana" ? `Mandar pra ${dona}` : `${dona} manda pra Ana`}
            </p>
            <p className="font-display text-2xl tabular-nums">{brl(situacao.valor)}</p>
          </div>
          {acerto.repasses.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Já confirmado neste dia:{" "}
              {acerto.repasses.map((r) => `${r.de === "ana" ? `Ana → ${dona}` : `${dona} → Ana`} ${brl(r.valor)}`).join(", ")}.
              {" "}O dia mudou depois (atendimento ou pagamento alterado), por isso a diferença.
            </p>
          )}
          <Button
            type="button"
            className="h-11 w-full rounded-xl"
            disabled={gravando}
            onClick={() => void confirmar([{ dia, de: situacao.de!, valor: situacao.valor }])}
          >
            <Send aria-hidden />
            {situacao.de === "ana" ? `Já mandei ${brl(situacao.valor)}` : `${dona} já mandou ${brl(situacao.valor)}`}
          </Button>
        </div>
      )}

      {controlado && outros.dias.length > 0 && (
        <Link
          to="/acerto"
          className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-xl px-1 text-sm font-medium text-primary active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            {plural(outros.dias.length, "outro dia", "outros dias")} em aberto · {quemManda(outros.falta, dona).texto}
          </span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}
