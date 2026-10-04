import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CalendarPlus, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty } from "@/components/app/ui-bits";
import { ClienteForm } from "@/components/app/ClienteForm";
import { AtendimentoList } from "@/components/app/AtendimentoList";
import { AtendimentoForm } from "@/components/app/AtendimentoForm";
import { useAtendimentos, useClientes, useProximosDaCliente, type Atendimento } from "@/lib/data";
import { brl, dataBR, diaPorExtenso, hojeISO, horaDeMinutos, horaHM, minutos } from "@/lib/format";
import { linkWhatsappTexto, normalizarTelefone } from "@/lib/links";

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

  if (isLoading) return <Empty>Carregando...</Empty>;
  if (!c) return <Empty>Cliente não encontrada.</Empty>;

  const total = hist.reduce((s, a) => s + Number(a.valor_bruto), 0);
  const tel = normalizarTelefone(c.telefone);
  const whatsapp = linkWhatsappTexto(c.telefone);
  const { id: _i, user_id: _u, created_at: _c, ...initial } = c;

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
          {hist.length} atendimento(s) · {brl(total)}
          {c.consentimento_data && ` · consentimento em ${dataBR(c.consentimento_data)}`}
        </p>
        <p className="mt-3 text-base">{c.telefone || <span className="text-muted-foreground">Sem telefone</span>}</p>
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
      </header>
      <Tabs defaultValue="historico" className="px-5 pt-4">
        <TabsList className="grid h-12 w-full grid-cols-2 rounded-2xl">
          <TabsTrigger value="historico" className="h-10 rounded-xl text-base">Histórico</TabsTrigger>
          <TabsTrigger value="ficha" className="h-10 rounded-xl text-base">Ficha</TabsTrigger>
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
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{diaPorExtenso(a.data)}</div>
                      <div className="truncate text-sm text-muted-foreground">
                        {a.hora ? `${horaHM(a.hora)}–${horaDeMinutos(minutos(a.hora) + a.duracao_min)} · ` : ""}
                        {a.servicos?.nome ?? "Serviço"}
                      </div>
                    </div>
                    <div className="shrink-0 font-semibold">{brl(a.valor_bruto)}</div>
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
