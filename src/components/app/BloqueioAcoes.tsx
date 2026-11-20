import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Lock, Pencil, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BloqueioForm } from "./BloqueioForm";
import { excluirBloqueios, restaurarBloqueios, useSerieDeBloqueios, type Atendimento } from "@/lib/data";
import { cobre, horarioDoBloqueio, tituloBloqueio, type Bloqueio } from "@/lib/bloqueios";
import { dataBR, diaPorExtenso, diaSemanaCurto, horaHM } from "@/lib/format";
import { mensagemErro } from "@/lib/erros";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";

const ddmm = (iso: string) => dataBR(iso).slice(0, 5);
const cartao =
  "w-full rounded-2xl border border-dashed border-muted-foreground/40 bg-muted bg-hachura text-left transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Bloqueio com horário na lista do dia (cinza listrado, com cadeado). */
export function CartaoBloqueio({ b, onClick }: { b: Bloqueio; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(cartao, "px-4 py-3")}>
      <div className="flex items-center gap-2">
        <Lock className="size-4 shrink-0" aria-hidden />
        <span className="font-semibold tabular-nums">{horarioDoBloqueio(b)}</span>
        {b.serie_id && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Repete" />}
        <span className="ml-auto shrink-0 rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">Bloqueado</span>
      </div>
      <div className="mt-1 truncate text-lg font-semibold">{b.descricao?.trim() || "Horário bloqueado"}</div>
    </button>
  );
}

/** Faixa do dia inteiro bloqueado, no topo do dia. */
export function FaixaDiaBloqueado({ b, onClick }: { b: Bloqueio; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(cartao, "flex items-center gap-3 px-4 py-3")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card" aria-hidden>
        <Lock className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Dia bloqueado</span>
        <span className="block truncate text-sm text-muted-foreground">{b.descricao?.trim() || "Não dá para agendar neste dia"}</span>
      </span>
      {b.serie_id && <Repeat className="size-4 shrink-0 text-muted-foreground" aria-label="Repete" />}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * Ações de um bloqueio: ver os agendamentos que ficaram dentro, editar e excluir (só este ou este
 * e os próximos da série, com "Desfazer").
 */
export function BloqueioAcoes({
  bloqueio, onClose, agendamentos,
}: {
  bloqueio: Bloqueio | null;
  onClose: () => void;
  /** Agendamentos carregados na agenda (para mostrar os que estão dentro do bloqueio). */
  agendamentos: Atendimento[];
}) {
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Bloqueio | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { data: serie = [] } = useSerieDeBloqueios(bloqueio?.serie_id);
  const ordem = [...serie].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const pos = bloqueio ? ordem.findIndex((b) => b.id === bloqueio.id) : -1;
  const proximos = bloqueio ? ordem.filter((b) => b.data > bloqueio.data) : [];
  const dentro = bloqueio
    ? agendamentos
        .filter((a) => a.status === "agendado" && cobre(bloqueio, { data: a.data, hora: a.hora, duracao: a.duracao_min }))
        .sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""))
    : [];

  async function excluir(comProximos: boolean) {
    if (!bloqueio) return;
    const apagados = comProximos ? [bloqueio, ...proximos] : [bloqueio];
    setExcluindo(true);
    try {
      const n = await excluirBloqueios(comProximos && bloqueio.serie_id ? { serieId: bloqueio.serie_id, aPartirDe: bloqueio.data } : { id: bloqueio.id });
      qc.invalidateQueries({ queryKey: ["bloqueios"] });
      setConfirmar(false);
      onClose();
      toast.success(n > 1 ? plural(n, "bloqueio excluído", "bloqueios excluídos") : "Bloqueio excluído", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await restaurarBloqueios(apagados);
            } catch (err) {
              console.error(err);
              return void toast.error(mensagemErro(err, "Não foi possível desfazer."));
            }
            qc.invalidateQueries({ queryKey: ["bloqueios"] });
          },
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(mensagemErro(err, "Não foi possível excluir o bloqueio."));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <>
      <Drawer open={!!bloqueio} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92vh]">
          {bloqueio && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="flex items-center gap-2 font-display text-2xl">
                  <Lock className="size-6 shrink-0" aria-hidden /> {tituloBloqueio(bloqueio)}
                </DrawerTitle>
                <DrawerDescription>
                  {diaPorExtenso(bloqueio.data)} · {horarioDoBloqueio(bloqueio)}
                </DrawerDescription>
              </DrawerHeader>
              <div className="space-y-3 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                {pos >= 0 && ordem.length > 1 && (
                  <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
                    <Repeat className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="tabular-nums">
                      Repete · <b>{pos + 1} de {ordem.length}</b>
                      {proximos[0] ? ` · próximo ${ddmm(proximos[0].data)}` : ""} · até {ddmm(ordem[ordem.length - 1]!.data)}
                    </span>
                  </div>
                )}
                {dentro.length > 0 && (
                  <div role="status" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="flex gap-2 font-semibold">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {plural(dentro.length, "agendamento ficou", "agendamentos ficaram")} dentro do bloqueio
                    </p>
                    <ul className="space-y-0.5 pl-6 tabular-nums">
                      {dentro.map((a) => (
                        <li key={a.id}>{horaHM(a.hora) || "sem hora"} · {a.clientes?.nome ?? "—"}</li>
                      ))}
                    </ul>
                    <p className="pl-6">Continuam marcados. Remarque ou avise a cliente se precisar.</p>
                  </div>
                )}
                <Button size="xl" variant="secondary" onClick={() => { setEditar(bloqueio); onClose(); }}>
                  <Pencil /> Editar bloqueio
                </Button>
                <Button size="xl" variant="outline" className="text-destructive" disabled={excluindo} onClick={() => setConfirmar(true)}>
                  <Trash2 /> Excluir bloqueio
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmar && !!bloqueio} onOpenChange={(o) => !excluindo && setConfirmar(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloqueio?</AlertDialogTitle>
            <AlertDialogDescription>
              {proximos.length > 0
                ? `Este bloqueio repete (${plural(proximos.length, "próximo", "próximos")} depois dele). O horário fica livre para agendar.`
                : "O horário fica livre para agendar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={cn(proximos.length > 0 && "sm:flex-col sm:space-x-0 sm:gap-2")}>
            <AlertDialogCancel disabled={excluindo}>Voltar</AlertDialogCancel>
            {proximos.length > 0 && (
              <AlertDialogAction
                disabled={excluindo}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); void excluir(true); }}
              >
                Este e os próximos ({proximos.length + 1})
              </AlertDialogAction>
            )}
            <AlertDialogAction
              disabled={excluindo}
              onClick={(e) => { e.preventDefault(); void excluir(false); }}
            >
              {excluindo ? "Excluindo..." : proximos.length > 0 ? `Só este (${bloqueio ? `${diaSemanaCurto(bloqueio.data)}, ${ddmm(bloqueio.data)}` : ""})` : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer open={!!editar} onOpenChange={(o) => !o && setEditar(null)}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">Editar bloqueio</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            {editar && <BloqueioForm key={editar.id} dia={editar.data} horaSugerida="" editing={editar} onPronto={() => setEditar(null)} />}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
