import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CalendarPlus, MessageCircle, Phone, Plus, Repeat, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty } from "@/components/app/ui-bits";
import { ClienteForm } from "@/components/app/ClienteForm";
import { AtendimentoList } from "@/components/app/AtendimentoList";
import { AtendimentoForm } from "@/components/app/AtendimentoForm";
import { useAtendimentos, useClientes, useMembrosSeries, useProximosDaCliente, type Atendimento, type Cliente } from "@/lib/data";
import { intervaloValido, posicaoNaSerie } from "@/lib/recorrencia";
import { plural } from "@/lib/texto";
import { brl, dataBR, diaPorExtenso, hojeISO, horaDeMinutos, horaHM, minutos } from "@/lib/format";
import { formatarTelefone, linkWhatsappTexto, normalizarTelefone } from "@/lib/links";
import { nomesItens } from "@/lib/itens";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  head: () => ({
    meta: [
      { title: "Ficha da cliente — Lunula" },
      { name: "description", content: "Anamnese e histórico de atendimentos da cliente." },
      { property: "og:title", content: "Ficha da cliente — Lunula" },
      { property: "og:description", content: "Anamnese e histórico de atendimentos da cliente." },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { data: clientes, isLoading } = useClientes();
  const { data: hist = [] } = useAtendimentos(id);
  const { data: proximos = [] } = useProximosDaCliente(id, hojeISO());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Atendimento | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const c = clientes?.find((x) => x.id === id);
  const { data: series } = useMembrosSeries(proximos.flatMap((a) => (a.serie_id ? [a.serie_id] : [])));

  if (isLoading) return <Empty>Carregando...</Empty>;
  if (!c) return <Empty>Cliente não encontrada.</Empty>;

  const total = hist.reduce((s, a) => s + Number(a.valor_bruto), 0);
  const tel = normalizarTelefone(c.telefone);
  const whatsapp = linkWhatsappTexto(c.telefone);
  const { id: _i, user_id: _u, created_at: _c, retorno_dias: _r, ...initial } = c;

  async function excluir() {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      setConfirmDel(false);
      return void toast.error(
        error.code === "23503"
          ? "Esta cliente tem atendimentos e não pode ser excluída."
          : "Não foi possível excluir.",
      );
    }
    await qc.invalidateQueries();
    toast.success("Cliente excluída");
    navigate({ to: "/clientes" });
  }

  return (
    <>
      <header className="bg-rose-gradient px-5 pb-5 pt-5">
        <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Clientes</Link>
        <h1 className="mt-2 text-3xl">{c.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {plural(hist.length, "atendimento", "atendimentos")} · {brl(total)}
          {c.consentimento_data && ` · consentimento em ${dataBR(c.consentimento_data)}`}
        </p>
        <p className="mt-3 text-base tabular-nums">{c.telefone ? formatarTelefone(c.telefone) : <span className="text-muted-foreground">Sem telefone</span>}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-12 rounded-xl bg-card text-base"
            disabled={!whatsapp}
            onClick={() => whatsapp && window.open(whatsapp, "_blank", "noopener,noreferrer")}
          >
            <MessageCircle /> WhatsApp
          </Button>
          {tel ? (
            <Button asChild variant="outline" className="h-12 rounded-xl bg-card text-base">
              <a href={`tel:+${tel}`}><Phone /> Ligar</a>
            </Button>
          ) : (
            <Button variant="outline" className="h-12 rounded-xl bg-card text-base" disabled><Phone /> Ligar</Button>
          )}
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate({ to: "/agenda", search: { cliente: id } })}>
            <CalendarPlus /> Agendar
          </Button>
        </div>
        <RetornoDaCliente cliente={c} />
      </header>
      <Tabs defaultValue="historico" className="px-5 pt-4">
        <TabsList className="grid h-14 w-full grid-cols-2 rounded-2xl p-1.5">
          <TabsTrigger value="historico" className="h-11 rounded-xl text-base">Histórico</TabsTrigger>
          <TabsTrigger value="ficha" className="h-11 rounded-xl text-base">Ficha</TabsTrigger>
        </TabsList>
        <TabsContent value="historico" className="-mx-5 mt-4 space-y-4">
          <div className="px-5">
            <Button size="xl" onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Novo atendimento</Button>
          </div>
          {proximos.length > 0 && (
            <section className="space-y-2 px-5">
              <h2 className="text-xl">Próximos</h2>
              <ul className="divide-y overflow-hidden rounded-2xl border border-l-4 border-l-sky-400 bg-card">
                {proximos.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/agenda"
                      search={{ dia: a.data }}
                      className="flex items-start justify-between gap-3 px-4 py-3 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">{diaPorExtenso(a.data)}</div>
                        <div className="line-clamp-2 text-sm text-muted-foreground">
                          {a.hora ? `${horaHM(a.hora)}–${horaDeMinutos(minutos(a.hora) + a.duracao_min)} · ` : ""}
                          {nomesItens(a.itens)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold tabular-nums">{brl(a.valor_bruto)}</div>
                        {(() => {
                          const pos = a.serie_id ? posicaoNaSerie(a.id, series?.get(a.serie_id) ?? []) : null;
                          return pos ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                              <Repeat className="size-3" aria-hidden /><span className="sr-only">Série, </span>{pos.n} de {pos.m}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hist.length === 0 ? <Empty>Nenhum atendimento ainda.</Empty> : (
            <AtendimentoList itens={hist} mostrarCliente={false} onSelect={(a) => { setEditing(a); setOpen(true); }} />
          )}
        </TabsContent>
        <TabsContent value="ficha" className="mt-4 space-y-4 pb-6">
          <ClienteForm
            key={c.id}
            initial={initial}
            submitLabel="Salvar ficha"
            onSubmit={async (v) => {
              const { error } = await supabase.from("clientes").update(v).eq("id", id);
              if (error) throw error;
              await qc.invalidateQueries({ queryKey: ["clientes"] });
              toast.success("Ficha atualizada");
            }}
          />
          <Button variant="ghost" className="h-12 w-full text-destructive" onClick={() => setConfirmDel(true)}>
            <Trash2 /> Excluir cliente
          </Button>
        </TabsContent>
      </Tabs>
      <AtendimentoForm open={open} onOpenChange={setOpen} editing={editing} clienteFixo={id} />
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {c.nome}?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** "Retorno a cada X dias" com edição rápida (1–365 ou sem intervalo). */
function RetornoDaCliente({ cliente }: { cliente: Cliente }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(valor: number | null) {
    setSalvando(true);
    const { error } = await supabase.from("clientes").update({ retorno_dias: valor }).eq("id", cliente.id);
    setSalvando(false);
    if (error) return void toast.error("Não foi possível salvar.");
    await qc.invalidateQueries({ queryKey: ["clientes"] });
    toast.success(valor ? `Retorno a cada ${valor} dias` : "Sem intervalo de retorno");
    setEditando(false);
  }

  if (!editando) {
    return (
      <div className="mt-3 flex min-h-12 items-center gap-2 rounded-xl bg-card/70 pl-3 text-[15px]">
        <Repeat className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1">
          {cliente.retorno_dias ? <>Retorno a cada <b className="tabular-nums">{cliente.retorno_dias} dias</b></> : <span className="text-muted-foreground">Sem intervalo de retorno</span>}
        </span>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-3 font-semibold text-primary"
          onClick={() => { setTexto(String(cliente.retorno_dias ?? "")); setEditando(true); }}
        >
          {cliente.retorno_dias ? "Alterar" : "Definir"}
        </Button>
      </div>
    );
  }

  const n = intervaloValido(Number(texto));
  return (
    <form
      className="mt-3 space-y-2 rounded-xl bg-card/80 p-3"
      onSubmit={(e) => { e.preventDefault(); if (n) void salvar(n); else toast.error("Use de 1 a 365 dias."); }}
    >
      <label htmlFor="retorno-dias" className="text-sm font-medium">Retorno a cada (dias)</label>
      <div className="flex gap-2">
        <Input id="retorno-dias" autoFocus className="h-12 w-24 text-base tabular-nums" inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Button type="submit" className="h-12 flex-1 rounded-xl" disabled={salvando}>Salvar</Button>
        <Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={() => setEditando(false)}>Voltar</Button>
      </div>
      {cliente.retorno_dias && (
        <Button type="button" variant="ghost" className="h-11 w-full text-muted-foreground" disabled={salvando} onClick={() => void salvar(null)}>
          Tirar o intervalo
        </Button>
      )}
    </form>
  );
}
