import { useId } from "react";
import { AlertTriangle, ArrowRight, Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { dataBR, diaSemanaCurto, diasDesde, horaHM } from "@/lib/format";
import { textoDeslocamento, type Membro, type Ocupado, type Remarcacao } from "@/lib/recorrencia";
import type { ModoSerie } from "./useRemarcacaoSerie";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";

const dia = (iso: string) => `${diaSemanaCurto(iso)}, ${dataBR(iso).slice(0, 5)}`;

/**
 * Bloco do formulário de edição quando o agendamento é de uma série: escolher entre mudar
 * "Só este" ou "Este e os próximos", ver as novas datas antes de salvar e desmarcar algum.
 */
export function RemarcarSerie({
  modo, onModo, total, dataAntes, horaAntes, dataNova, horaNova, plano, excluidos, onExcluidos,
  conflitos, conferindo, hoje,
}: {
  modo: ModoSerie;
  onModo: (m: ModoSerie) => void;
  /** Quantos próximos 'agendado' a série tem depois deste. */
  total: number;
  dataAntes: string;
  horaAntes: string;
  dataNova: string;
  horaNova: string;
  plano: Remarcacao<Membro>[];
  excluidos: Set<string>;
  onExcluidos: (s: Set<string>) => void;
  conflitos: Map<string, Ocupado>;
  conferindo: boolean;
  hoje: string;
}) {
  const id = useId();
  const delta = dataNova ? diasDesde(dataAntes, dataNova) : 0;
  const mudouHora = !!horaNova && horaHM(horaNova) !== horaHM(horaAntes);
  const mudou = delta !== 0 || mudouHora;
  const marcados = plano.filter((r) => !excluidos.has(r.item.id)).length;
  const comConflito = [...conflitos.keys()].length;

  const alternar = (itemId: string) => {
    const s = new Set(excluidos);
    if (s.has(itemId)) s.delete(itemId);
    else s.add(itemId);
    onExcluidos(s);
  };

  const opcao = (valor: ModoSerie, titulo: string, sub: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={modo === valor}
      onClick={() => onModo(valor)}
      className={cn(
        "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        modo === valor ? "border-primary bg-primary text-primary-foreground" : "bg-card",
      )}
    >
      <span className="font-semibold">{titulo}</span>
      <span className={cn("text-xs", modo === valor ? "text-primary-foreground/85" : "text-muted-foreground")}>{sub}</span>
    </button>
  );

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-3.5" aria-labelledby={`${id}-titulo`}>
      <p id={`${id}-titulo`} className="flex items-center gap-2 font-semibold">
        <Repeat className="size-5 text-primary" aria-hidden /> Série · {plural(total, "próximo agendado", "próximos agendados")}
      </p>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={`${id}-titulo`}>
        {opcao("este", "Só este", "os próximos ficam como estão")}
        {opcao("proximos", "Este e os próximos", `+ ${plural(total, "agendamento", "agendamentos")}`)}
      </div>

      {modo === "este" ? (
        mudou && (
          <p className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
            Só este muda. Os outros {total} continuam
            {mudouHora ? ` às ${horaHM(horaAntes)}` : ""}
            {delta !== 0 ? " nos dias de antes" : ""}. Para levar a mudança, escolha “Este e os próximos”.
          </p>
        )
      ) : (
        <>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {mudouHora && <li>Horário: <b className="text-foreground tabular-nums">{horaHM(horaAntes)} → {horaHM(horaNova)}</b></li>}
            {delta !== 0 && (
              <li>Dia: <b className="text-foreground">{textoDeslocamento(delta)}</b> em cada um (o intervalo entre eles continua o mesmo)</li>
            )}
            <li>Cliente, serviços, duração e observações ficam iguais a este{!mudou ? "; datas e horários não mudam" : ""}.</li>
          </ul>

          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl bg-muted p-2" aria-label="Próximos da série">
            {plano.map((r) => {
              const marcado = !excluidos.has(r.item.id);
              const o = conflitos.get(r.item.id);
              const campo = `${id}-${r.item.id}`;
              const passou = marcado && r.para < hoje;
              return (
                <li key={r.item.id}>
                  <label
                    htmlFor={campo}
                    className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 active:bg-background/60", !marcado && "opacity-60")}
                  >
                    <Checkbox id={campo} checked={marcado} onCheckedChange={() => alternar(r.item.id)} />
                    <span className="min-w-0 flex-1 text-sm tabular-nums">
                      <span className="flex flex-wrap items-center gap-x-1.5">
                        <span className={cn(marcado && (r.de !== r.para || r.horaDe !== r.horaPara) && "text-muted-foreground line-through")}>
                          <span className="sr-only">de </span>{dia(r.de)} · {r.horaDe || "sem hora"}
                        </span>
                        {marcado && (r.de !== r.para || r.horaDe !== r.horaPara) && (
                          <>
                            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="font-semibold text-foreground">
                              <span className="sr-only">para </span>{r.de !== r.para ? `${dia(r.para)} · ` : ""}{r.horaPara}
                            </span>
                          </>
                        )}
                        {!marcado && <span className="text-xs">(fica como está)</span>}
                      </span>
                      {o && marcado && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-500">
                          <AlertTriangle className="size-3" aria-hidden /> ocupado · {o.cliente.split(" ")[0]} {horaHM(o.hora)}
                        </span>
                      )}
                      {passou && <span className="mt-0.5 block text-xs font-semibold text-destructive">essa data já passou</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <p role="status" className={cn("text-sm", comConflito > 0 ? "text-amber-900" : "text-muted-foreground")}>
            {marcados === 0
              ? "Nenhum marcado: só este vai mudar."
              : `${plural(marcados, "vai ser atualizado", "vão ser atualizados")} junto com este`}
            {marcados > 0 && (conferindo ? " · conferindo horários…" : comConflito > 0
              ? ` · ${plural(comConflito, "bate", "batem")} com outro atendimento. Desmarque para manter como está.`
              : " · nenhum horário ocupado.")}
          </p>
        </>
      )}
    </section>
  );
}
