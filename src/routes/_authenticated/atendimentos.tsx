import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { AtendimentoList } from "@/components/app/AtendimentoList";
import { AtendimentoForm } from "@/components/app/AtendimentoForm";
import { useAtendimentos, useConfig, type Atendimento } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  head: () => ({
    meta: [
      { title: "Atendimentos — Lunula" },
      { name: "description", content: "Atendimentos registrados por mês." },
      { property: "og:title", content: "Atendimentos — Lunula" },
      { property: "og:description", content: "Atendimentos registrados por mês." },
    ],
  }),
  component: Page,
});

function Page() {
  const { data = [], isLoading } = useAtendimentos();
  const { data: cfg } = useConfig();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Atendimento | null>(null);

  return (
    <>
      <PageHeader title="Atendimentos" />
      <div className="px-5 pb-5">
        <Button size="xl" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus /> Novo atendimento
        </Button>
      </div>
      {isLoading ? <Empty>Carregando...</Empty> : data.length === 0 ? (
        <Empty>Nenhum atendimento ainda.</Empty>
      ) : (
        <AtendimentoList itens={data} nomeDona={cfg?.nome_dona ?? "Simone"} onSelect={(a) => { setEditing(a); setOpen(true); }} />
      )}
      <AtendimentoForm open={open} onOpenChange={setOpen} editing={editing} />
    </>
  );
}
