import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { ClienteForm, emptyCliente } from "@/components/app/ClienteForm";
import { useClientes } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — Caderno da Nail" },
      { name: "description", content: "Lista e busca de clientes." },
      { property: "og:title", content: "Clientes — Caderno da Nail" },
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
  const lista = data.filter((c) => norm(c.nome).includes(norm(busca)));

  return (
    <>
      <PageHeader title="Clientes">
        <Button size="icon" className="h-12 w-12 rounded-2xl" aria-label="Nova cliente" onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Button>
      </PageHeader>
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
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left"><DrawerTitle className="font-display text-2xl">Nova cliente</DrawerTitle></DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
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
