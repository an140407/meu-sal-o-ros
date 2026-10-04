import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { useAtendimentos, useAtendimentosMes, useConfig, useDespesas, useRepasses, useRepassesTodos, type Repasse } from "@/lib/data";
import { saldoPorMes } from "@/lib/acerto";
import { resumoDespesas } from "@/lib/despesas";
import { cn } from "@/lib/utils";
import { brl, buscaMes, dataBR, dataHora, hojeISO, mesAno, parseValor } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/acerto")({
  validateSearch: buscaMes,
  head: () => ({
    meta: [
      { title: "Acerto do mês — Lunula" },
      { name: "description", content: "Divisão do mês, repasses e saldo a receber." },
      { property: "og:title", content: "Acerto do mês — Lunula" },
      { property: "og:description", content: "Divisão do mês, repasses e saldo a receber." },
    ],
  }),
  component: Page,
});

const r2 = (n: number) => Math.round(n * 100) / 100;

function Page() {
  const navigate = Route.useNavigate();
  const mes = Route.useSearch().mes ?? hojeISO().slice(0, 7);
  const setMes = (m: string) => navigate({ search: { mes: m }, replace: true });
  const { data: atends = [], isLoading } = useAtendimentosMes(mes);
  const { data: repasses = [] } = useRepasses(mes);
  const { data: despesas = [] } = useDespesas(mes);
  const { data: cfg } = useConfig();
  const dona = cfg?.nome_dona ?? "Simone";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Repasse | null>(null);

  const bruto = r2(atends.reduce((s, a) => s + Number(a.valor_bruto), 0));
  const liquido = r2(atends.reduce((s, a) => s + Number(a.valor_liquido), 0));
  const taxas = r2(bruto - liquido);
  const ana = r2(atends.reduce((s, a) => s + (Number(a.valor_liquido) * Number(a.percentual_ana)) / 100, 0));
  const parteDona = r2(liquido - ana);
  const repassado = r2(repasses.reduce((s, r) => s + Number(r.valor), 0));
  const saldo = r2(ana - repassado);
  // Só informativo: despesas não entram no repasse, no saldo nem no resumo copiado.
  const totalDespesas = resumoDespesas(despesas).total;
  const lucroReal = r2(ana - totalDespesas);

  async function copiar() {
    const linhas = [
      `Acerto ${mesAno(mes)}`,
      "",
      ...atends.map((a) => `${dataHora(a.data, a.hora)} - ${a.clientes?.nome ?? "—"} - ${a.servicos?.nome ?? "Serviço"} - ${brl(a.valor_bruto)}`),
      "",
      `Total bruto: ${brl(bruto)}`,
      `Taxas: ${brl(taxas)}`,
      `Total líquido: ${brl(liquido)}`,
      `Parte da Ana: ${brl(ana)}`,
      `Parte da ${dona}: ${brl(parteDona)}`,
      `Repassado: ${brl(repassado)}`,
      `Saldo a receber: ${brl(saldo)}`,
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
      <span className={forte ? "font-semibold" : ""}>{brl(valor)}</span>
    </div>
  );

  return (
    <>
      <PageHeader title="Acerto" />
      <div className="space-y-5 px-5">
        <Input type="month" className="h-12 text-base" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Mês" />

        <MesesAnteriores mes={mes} onSelect={setMes} />

        <section className="rounded-2xl bg-rose-gradient p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xl">{mesAno(mes)}</h2>
            <span className="text-sm text-muted-foreground">{atends.length} atend.</span>
          </div>
          {isLoading ? <p className="text-muted-foreground">Carregando...</p> : (
            <div className="divide-y divide-border">
              <div>
                {linha("Total bruto", bruto)}
                {linha("Taxas", taxas)}
                {linha("Total líquido", liquido, true)}
              </div>
              <div>
                {linha("Parte da Ana", ana, true)}
                {linha(`Parte da ${dona}`, parteDona)}
              </div>
              <div>
                {linha("Repassado", repassado)}
                {linha("Saldo a receber", saldo, true)}
              </div>
            </div>
          )}
        </section>

        <Button size="xl" variant="secondary" onClick={copiar}><Copy /> Copiar resumo</Button>

        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 text-xl">Lucro real da Ana</h2>
          <div className="divide-y divide-border">
            <div>
              {linha("Parte da Ana", ana)}
              {linha("Despesas do mês", -totalDespesas)}
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-semibold">Lucro real</span>
              <span className={lucroReal < 0 ? "font-semibold text-destructive" : "font-semibold"}>{brl(lucroReal)}</span>
            </div>
          </div>
          <Link
            to="/despesas"
            search={{ mes }}
            className="mt-2 flex h-12 items-center justify-between rounded-xl px-1 font-medium text-primary active:bg-muted"
          >
            Ver despesas <ChevronRight className="size-5" />
          </Link>
        </section>

        <Link
          to="/estatisticas"
          className="flex h-14 items-center justify-between rounded-2xl border bg-card px-4 font-medium active:bg-muted"
        >
          <span className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" /> Estatísticas</span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>

        <section className="space-y-3">
          <h2 className="text-xl">Repasses</h2>
          <Button size="xl" onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Registrar repasse</Button>
          {repasses.length === 0 ? <Empty>Nenhum repasse neste mês.</Empty> : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {repasses.map((r) => (
                <li key={r.id}>
                  <button onClick={() => { setEditing(r); setOpen(true); }} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-muted">
                    <div className="min-w-0">
                      <div className="font-semibold">{dataBR(r.data_recebimento)}</div>
                      {r.observacao && <div className="truncate text-sm text-muted-foreground">{r.observacao}</div>}
                    </div>
                    <div className="shrink-0 font-semibold">{brl(r.valor)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <RepasseForm open={open} onOpenChange={setOpen} editing={editing} mes={mes} />
    </>
  );
}

const rotuloSaldo = (v: number) => (v > 0 ? "a receber" : v < 0 ? "repassado a mais" : "em dia");

function MesesAnteriores({ mes, onSelect }: { mes: string; onSelect: (m: string) => void }) {
  const { data: atends, isLoading: l1 } = useAtendimentos();
  const { data: repasses, isLoading: l2 } = useRepassesTodos();
  const [aberto, setAberto] = useState(false);
  if (l1 || l2 || !atends || !repasses) return null;

  const { meses, total } = saldoPorMes(atends, repasses, mes);
  if (meses.length === 0) return null;
  const pendentes = meses.filter((m) => m.saldo !== 0);

  return (
    <section className="rounded-2xl border bg-card p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        disabled={pendentes.length === 0}
      >
        <div>
          <h2 className="text-xl">Meses anteriores</h2>
          <p className="text-sm text-muted-foreground">
            {pendentes.length === 0 ? "Tudo acertado." : `${pendentes.length} mês(es) com saldo`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div>
            <div className={cn("font-semibold", total < 0 && "text-destructive")}>{brl(Math.abs(total))}</div>
            <div className="text-xs text-muted-foreground">{rotuloSaldo(total)}</div>
          </div>
          {pendentes.length > 0 && <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", aberto && "rotate-180")} />}
        </div>
      </button>
      {aberto && (
        <ul className="mt-3 divide-y border-t">
          {pendentes.map((m) => (
            <li key={m.mes}>
              <button
                type="button"
                onClick={() => onSelect(m.mes)}
                className="flex h-14 w-full items-center justify-between gap-3 text-left active:bg-muted"
              >
                <span>{mesAno(m.mes)}</span>
                <span className="flex items-center gap-2 text-right">
                  <span>
                    <span className={cn("block font-semibold", m.saldo < 0 && "text-destructive")}>{brl(Math.abs(m.saldo))}</span>
                    <span className="block text-xs text-muted-foreground">{rotuloSaldo(m.saldo)}</span>
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RepasseForm({
  open, onOpenChange, editing, mes,
}: { open: boolean; onOpenChange: (o: boolean) => void; editing: Repasse | null; mes: string }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValor(editing ? String(editing.valor) : "");
    setData(editing?.data_recebimento ?? hojeISO());
    setObs(editing?.observacao ?? "");
  }, [open, editing]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["repasses"] });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    if (!Number.isFinite(v) || v <= 0) return void toast.error("Informe um valor válido.");
    if (!data) return void toast.error("Informe a data.");
    setSaving(true);
    const payload = { valor: r2(v), data_recebimento: data, observacao: obs.trim().slice(0, 500) || null };
    const { error } = editing
      ? await supabase.from("repasses").update(payload).eq("id", editing.id)
      : await supabase.from("repasses").insert({ ...payload, mes_referencia: mes });
    setSaving(false);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success(editing ? "Repasse atualizado" : "Repasse registrado");
    refresh();
    onOpenChange(false);
  }

  async function excluir() {
    if (!editing) return;
    const { error } = await supabase.from("repasses").delete().eq("id", editing.id);
    if (error) return void toast.error("Não foi possível excluir.");
    toast.success("Repasse excluído");
    refresh();
    setConfirmDel(false);
    onOpenChange(false);
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">{editing ? "Editar repasse" : "Registrar repasse"}</DrawerTitle>
          </DrawerHeader>
          <form onSubmit={salvar} className="space-y-4 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
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
            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} className="text-base" />
            </div>
            <Button type="submit" size="xl" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            {editing && (
              <Button type="button" variant="ghost" className="h-12 w-full text-destructive" onClick={() => setConfirmDel(true)}>
                <Trash2 /> Excluir repasse
              </Button>
            )}
          </form>
        </DrawerContent>
      </Drawer>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir repasse?</AlertDialogTitle>
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
