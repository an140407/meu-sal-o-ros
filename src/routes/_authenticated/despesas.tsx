import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Receipt, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty, PageHeader } from "@/components/app/ui-bits";
import { useDespesas, type Despesa } from "@/lib/data";
import { CATEGORIAS_DESPESA, SEM_CATEGORIA, resumoDespesas } from "@/lib/despesas";
import { brl, buscaMes, dataBR, hojeISO, mesAno } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/despesas")({
  validateSearch: buscaMes,
  head: () => ({
    meta: [
      { title: "Despesas — Lunula" },
      { name: "description", content: "Despesas do mês por categoria." },
      { property: "og:title", content: "Despesas — Lunula" },
      { property: "og:description", content: "Despesas do mês por categoria." },
    ],
  }),
  component: Page,
});

const r2 = (n: number) => Math.round(n * 100) / 100;

function Page() {
  const navigate = Route.useNavigate();
  const mes = Route.useSearch().mes ?? hojeISO().slice(0, 7);
  const { data: despesas = [], isLoading } = useDespesas(mes);
  const { total, categorias } = resumoDespesas(despesas);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Despesa | null>(null);

  return (
    <>
      <PageHeader
        title="Despesas"
        voltar={
          // Sempre volta para o Acerto no mês escolhido aqui (sem usar o histórico).
          <Link to="/acerto" search={{ mes }} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="size-4" /> Acerto
          </Link>
        }
      />
      <div className="space-y-5 px-5">
        <Input
          type="month"
          className="h-12 text-base"
          value={mes}
          onChange={(e) => e.target.value && navigate({ search: { mes: e.target.value }, replace: true })}
          aria-label="Mês"
        />

        <section className="rounded-2xl bg-rose-gradient p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xl">{mesAno(mes)}</h2>
            <span className="text-sm text-muted-foreground">{despesas.length} despesa(s)</span>
          </div>
          {isLoading ? <p className="text-muted-foreground">Carregando...</p> : (
            <div className="divide-y divide-border">
              <div className="flex justify-between py-1.5">
                <span className="font-semibold">Total do mês</span>
                <span className="font-semibold">{brl(total)}</span>
              </div>
              {categorias.length > 0 && (
                <div>
                  {categorias.map((c) => (
                    <div key={c.categoria} className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">{c.categoria}</span>
                      <span>{brl(c.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <Button size="xl" onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Registrar despesa</Button>

        {!isLoading && despesas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-5 py-10 text-center">
            <Receipt className="size-8 text-primary" />
            <p className="font-semibold">Nenhuma despesa neste mês</p>
            <p className="text-sm text-muted-foreground">Registre compras de material para ver o lucro real no Acerto.</p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {despesas.map((d) => (
              <li key={d.id}>
                <button onClick={() => { setEditing(d); setOpen(true); }} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-muted">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{d.descricao}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {dataBR(d.data)} · {d.categoria || SEM_CATEGORIA}
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold">{brl(d.valor)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DespesaForm open={open} onOpenChange={setOpen} editing={editing} />
    </>
  );
}

function DespesaForm({
  open, onOpenChange, editing,
}: { open: boolean; onOpenChange: (o: boolean) => void; editing: Despesa | null }) {
  const qc = useQueryClient();
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescricao(editing?.descricao ?? "");
    setCategoria(editing?.categoria ?? null);
    setValor(editing ? String(editing.valor) : "");
    setData(editing?.data ?? hojeISO());
  }, [open, editing]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["despesas"] });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const desc = descricao.trim().slice(0, 200);
    const v = Number(valor.replace(",", "."));
    if (!desc) return void toast.error("Informe a descrição.");
    if (!Number.isFinite(v) || v <= 0) return void toast.error("Informe um valor maior que zero.");
    if (!data) return void toast.error("Informe a data.");
    setSaving(true);
    const payload = { descricao: desc, categoria, valor: r2(v), data };
    const { error } = editing
      ? await supabase.from("despesas").update(payload).eq("id", editing.id)
      : await supabase.from("despesas").insert(payload);
    setSaving(false);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success(editing ? "Despesa atualizada" : "Despesa registrada");
    refresh();
    onOpenChange(false);
  }

  async function excluir() {
    if (!editing) return;
    const { error } = await supabase.from("despesas").delete().eq("id", editing.id);
    if (error) return void toast.error("Não foi possível excluir.");
    toast.success("Despesa excluída");
    refresh();
    setConfirmDel(false);
    onOpenChange(false);
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">{editing ? "Editar despesa" : "Registrar despesa"}</DrawerTitle>
          </DrawerHeader>
          <form onSubmit={salvar} className="space-y-4 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input className="h-12 text-base" required maxLength={200} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS_DESPESA.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={categoria === c ? "default" : "outline"}
                    className="h-12 rounded-xl text-base"
                    aria-pressed={categoria === c}
                    onClick={() => setCategoria(categoria === c ? null : c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input className="h-12 text-base" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input className="h-12 text-base" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <Button type="submit" size="xl" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            {editing && (
              <Button type="button" variant="ghost" className="h-12 w-full text-destructive" onClick={() => setConfirmDel(true)}>
                <Trash2 /> Excluir despesa
              </Button>
            )}
          </form>
        </DrawerContent>
      </Drawer>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
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
