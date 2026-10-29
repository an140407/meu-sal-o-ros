import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "./ui-bits";
import { ClienteForm, emptyCliente } from "./ClienteForm";
import { ServicosPicker } from "./ServicosPicker";
import { PagamentosPicker } from "./PagamentosPicker";
import { salvarAtendimentoComItens, useClientes, useConfig, type Atendimento } from "@/lib/data";
import { brl, hojeISO, horaAgora, horaHM } from "@/lib/format";
import { itensParaForm, somaItens, totaisForm, validarItens, type ItemForm } from "@/lib/itens";
import { formaPrincipal, partesIniciais, validarPagamentos, type ParteForm } from "@/lib/pagamentos";
import { mensagemErro } from "@/lib/erros";

export function AtendimentoForm({
  open, onOpenChange, editing, clienteFixo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Atendimento | null;
  clienteFixo?: string;
}) {
  const qc = useQueryClient();
  const { data: clientes = [] } = useClientes();
  const { data: cfg } = useConfig();
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState("");
  const [partes, setPartes] = useState<ParteForm[]>([]);
  const [obs, setObs] = useState("");
  const [novoCliente, setNovoCliente] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNovoCliente(false);
    if (editing) {
      setClienteId(editing.cliente_id);
      setItens(itensParaForm(editing.itens));
      setData(editing.data);
      setHora(horaHM(editing.hora));
      setPartes(partesIniciais(editing.pagamentos, Number(editing.valor_bruto)));
      setObs(editing.observacoes ?? "");
    } else {
      setClienteId(clienteFixo ?? "");
      setItens([]);
      setData(hojeISO());
      setHora(horaAgora());
      setPartes(partesIniciais([], 0));
      setObs("");
    }
  }, [open, editing, clienteFixo]);

  const total = totaisForm(itens).valor;
  const taxas = { debito: Number(cfg?.taxa_debito ?? 0), credito: Number(cfg?.taxa_credito ?? 0) };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) return void toast.error("Escolha a cliente.");
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    const pg = validarPagamentos(partes, somaItens(v.itens).valor);
    if ("erro" in pg) return void toast.error(pg.erro);
    setSaving(true);
    const campos = {
      cliente_id: clienteId, data, hora: hora || null, forma_pagamento: formaPrincipal(pg.pagamentos), observacoes: obs.trim() || null,
    };
    try {
      const { atendimento, duracaoAjustada } = await salvarAtendimentoComItens(
        editing?.id ?? null,
        editing ? campos : { ...campos, status: "realizado" },
        v.itens,
        pg.pagamentos,
      );
      toast.success(`${editing ? "Atendimento atualizado" : "Atendimento registrado"} · ${brl(atendimento.valor_bruto)}`);
      if (duracaoAjustada) toast.warning(`A duração total foi limitada a ${atendimento.duracao_min} min.`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(mensagemErro(err, "Não foi possível salvar."));
    } finally {
      setSaving(false);
      refresh();
    }
  }

  async function excluir() {
    if (!editing) return;
    const { error } = await supabase.from("atendimentos").delete().eq("id", editing.id);
    if (error) return void toast.error("Não foi possível excluir.");
    toast.success("Atendimento excluído");
    refresh();
    setConfirmDel(false);
    onOpenChange(false);
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">
              {novoCliente ? "Nova cliente" : editing ? "Editar atendimento" : "Novo atendimento"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            {novoCliente ? (
              <div className="space-y-3">
                <ClienteForm
                  compact
                  initial={emptyCliente()}
                  submitLabel="Criar e usar"
                  onSubmit={async (c) => {
                    const { data: row, error } = await supabase.from("clientes").insert(c).select().single();
                    if (error) throw error;
                    await qc.invalidateQueries({ queryKey: ["clientes"] });
                    setClienteId(row.id);
                    setNovoCliente(false);
                    toast.success("Cliente criada. Complete a anamnese depois na ficha.");
                  }}
                />
                <Button variant="ghost" className="w-full" onClick={() => setNovoCliente(false)}>Voltar</Button>
              </div>
            ) : (
              <form onSubmit={salvar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="at-cliente">Cliente</Label>
                  <div className="flex gap-2">
                    <NativeSelect id="at-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!!clienteFixo}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </NativeSelect>
                    {!clienteFixo && (
                      <Button type="button" variant="secondary" className="h-12 w-12 shrink-0 rounded-xl" aria-label="Nova cliente" onClick={() => setNovoCliente(true)}>
                        <UserPlus />
                      </Button>
                    )}
                  </div>
                </div>
                <ServicosPicker itens={itens} onChange={setItens} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="at-data">Data</Label>
                    <Input id="at-data" className="h-12 text-base" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="at-hora">Hora</Label>
                    <Input id="at-hora" className="h-12 text-base" type="time" step={60} value={hora} onChange={(e) => setHora(e.target.value)} />
                  </div>
                </div>
                <PagamentosPicker total={total} partes={partes} onChange={setPartes} taxas={taxas} />
                <div className="space-y-2">
                  <Label htmlFor="at-observacoes">Observações</Label>
                  <Textarea id="at-observacoes" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className="text-base" />
                </div>
                <Button type="submit" size="xl" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
                {editing && (
                  <Button type="button" variant="ghost" className="h-12 w-full text-destructive" onClick={() => setConfirmDel(true)}>
                    <Trash2 /> Excluir atendimento
                  </Button>
                )}
              </form>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
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
