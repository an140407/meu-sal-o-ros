import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, ChevronRight, Gift, MessageCircle, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { ClienteForm, emptyCliente } from "@/components/app/ClienteForm";
import { useAtendimentos, useClientes, useClientesComAgendamento, type Cliente } from "@/lib/data";
import { clientesParaRetorno, ehAniversarioNoMes } from "@/lib/clientes";
import { dataBR, hojeISO, mesAno } from "@/lib/format";
import { linkWhatsappTexto, mensagemAniversario, mensagemRetorno } from "@/lib/links";
import { nomesItens } from "@/lib/itens";
import { cn } from "@/lib/utils";

const ABAS = ["todas", "retorno", "aniversario"] as const;
type Aba = (typeof ABAS)[number];

export const Route = createFileRoute("/_authenticated/clientes/")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } =>
    ABAS.includes(s["aba"] as Aba) ? { aba: s["aba"] as Aba } : {},
  head: () => ({
    meta: [
      { title: "Clientes — Lunula" },
      { name: "description", content: "Lista e busca de clientes." },
      { property: "og:title", content: "Clientes — Lunula" },
      { property: "og:description", content: "Lista e busca de clientes." },
    ],
  }),
  component: Page,
});

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function Page() {
  const { data = [], isLoading } = useClientes();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const aba = Route.useSearch().aba ?? "todas";
  const lista = data.filter((c) => norm(c.nome).includes(norm(busca)));

  return (
    <>
      <PageHeader title="Clientes">
        <Button size="icon" className="h-12 w-12 rounded-2xl" aria-label="Nova cliente" onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Button>
      </PageHeader>
      <Tabs
        value={aba}
        onValueChange={(v) => navigate({ to: "/clientes", search: { aba: v as Aba }, replace: true })}
      >
        <div className="px-5 pb-4">
          <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="todas" className="h-10 rounded-xl px-1 text-sm">Todas</TabsTrigger>
            <TabsTrigger value="retorno" className="h-10 rounded-xl px-1 text-sm">Para retorno</TabsTrigger>
            <TabsTrigger value="aniversario" className="h-10 rounded-xl px-1 text-sm">Aniversariantes</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="retorno" className="mt-0"><ParaRetorno clientes={data} /></TabsContent>
        <TabsContent value="aniversario" className="mt-0"><Aniversariantes clientes={data} /></TabsContent>
        <TabsContent value="todas" className="mt-0">
          <div className="relative px-5 pb-4">
            <Search className="absolute left-9 top-3.5 size-5 text-muted-foreground" />
            <Input className="h-12 rounded-2xl pl-11 text-base" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {isLoading ? <Empty>Carregando...</Empty> : lista.length === 0 ? (
            <Empty>{data.length ? "Nenhuma cliente encontrada." : "Nenhuma cliente cadastrada."}</Empty>
          ) : (
            <ul className="mx-5 divide-y overflow-hidden rounded-2xl border bg-card">
              {lista.map((c) => (
                <li key={c.id}>
                  <Link to="/clientes/$id" params={{ id: c.id }} className="flex items-center justify-between px-4 py-4 active:bg-muted">
                    <div>
                      <div className="font-semibold">{c.nome}</div>
                      {c.telefone && <div className="text-sm text-muted-foreground">{c.telefone}</div>}
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left"><DrawerTitle className="font-display text-2xl">Nova cliente</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            <ClienteForm
              initial={emptyCliente()}
              submitLabel="Cadastrar"
              onSubmit={async (v) => {
                const { data: row, error } = await supabase.from("clientes").insert(v).select().single();
                if (error) throw error;
                await qc.invalidateQueries({ queryKey: ["clientes"] });
                toast.success("Cliente cadastrada");
                setOpen(false);
                navigate({ to: "/clientes/$id", params: { id: row.id } });
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

const abrir = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

function BotaoWhatsapp({ url }: { url: string | null }) {
  return (
    <Button
      variant="outline"
      className="h-12 flex-1 rounded-xl text-base"
      disabled={!url}
      title={url ? undefined : "Cliente sem telefone válido"}
      onClick={() => url && abrir(url)}
    >
      <MessageCircle /> WhatsApp
    </Button>
  );
}

const PRAZOS = [15, 21, 30, 45] as const;

function ParaRetorno({ clientes }: { clientes: Cliente[] }) {
  const hoje = hojeISO();
  const navigate = useNavigate();
  const [prazo, setPrazo] = useState<number>(21);
  const { data: realizados = [], isLoading } = useAtendimentos();
  const { data: comAgendamento } = useClientesComAgendamento(hoje);
  const lista = clientesParaRetorno(
    clientes,
    realizados.map((a) => ({ cliente_id: a.cliente_id, data: a.data, servico: nomesItens(a.itens) })),
    comAgendamento ?? new Set<string>(),
    hoje,
    prazo,
  );

  return (
    <div className="space-y-4 px-5">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Última visita há mais de</p>
        <div className="grid grid-cols-4 gap-2">
          {PRAZOS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={prazo === p ? "default" : "outline"}
              className="h-12 rounded-xl text-base"
              aria-pressed={prazo === p}
              onClick={() => setPrazo(p)}
            >
              {p} dias
            </Button>
          ))}
        </div>
      </div>
      {isLoading || !comAgendamento ? <Empty>Carregando...</Empty> : lista.length === 0 ? (
        <Empty>Ninguém para chamar de volta agora. 💅</Empty>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {lista.map(({ cliente: c, dias, ultimoServico }) => (
            <li key={c.id} className="space-y-3 px-4 py-4">
              <Link to="/clientes/$id" params={{ id: c.id }} className="block">
                <div className="font-semibold">{c.nome}</div>
                <div className="truncate text-sm text-muted-foreground">
                  há {dias} dias{ultimoServico ? ` · ${ultimoServico}` : ""}
                </div>
              </Link>
              <div className="flex gap-2">
                <BotaoWhatsapp url={linkWhatsappTexto(c.telefone, mensagemRetorno(c.nome, dias))} />
                <Button
                  className="h-12 flex-1 rounded-xl text-base"
                  onClick={() => navigate({ to: "/agenda", search: { cliente: c.id } })}
                >
                  <CalendarPlus /> Agendar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Aniversariantes({ clientes }: { clientes: Cliente[] }) {
  const hoje = hojeISO();
  const lista = clientes
    .filter((c) => ehAniversarioNoMes(c.data_nascimento, hoje))
    .sort((a, b) => a.data_nascimento!.slice(8, 10).localeCompare(b.data_nascimento!.slice(8, 10)) || a.nome.localeCompare(b.nome));

  return (
    <div className="space-y-4 px-5">
      <p className="text-sm text-muted-foreground">{mesAno(hoje.slice(0, 7))}</p>
      {lista.length === 0 ? (
        <Empty>Nenhuma aniversariante este mês.</Empty>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {lista.map((c) => {
            const ehHoje = c.data_nascimento!.slice(5, 10) === hoje.slice(5, 10);
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-4">
                <Link to="/clientes/$id" params={{ id: c.id }} className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.nome}</div>
                  <div className={cn("text-sm", ehHoje ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {ehHoje ? <><Gift className="mr-1 inline size-4" />Hoje!</> : dataBR(c.data_nascimento).slice(0, 5)}
                  </div>
                </Link>
                <div className="flex w-36 shrink-0">
                  <BotaoWhatsapp url={linkWhatsappTexto(c.telefone, mensagemAniversario(c.nome))} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
