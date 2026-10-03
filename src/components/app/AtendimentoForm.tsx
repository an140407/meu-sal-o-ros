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
import { useClientes, useServicos, type Atendimento } from "@/lib/data";
import { FORMAS, hojeISO, type Forma } from "@/lib/format";

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
  const { data: servicos = [] } = useServicos();
  const [clienteId, setClienteId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [forma, setForma] = useState<Forma>("pix");
  const [obs, setObs] = useState("");
  const [novoCliente, setNovoCliente] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNovoCliente(false);
    if (editing) {
      setClienteId(editing.cliente_id);
      setServicoId(editing.servico_id ?? "");
      setValor(String(editing.valor_bruto));
      setData(editing.data);
      setForma(editing.forma_pagamento as Forma);
      setObs(editing.observacoes ?? "");
    } else {
      setClienteId(clienteFixo ?? "");
      setServicoId("");
      setValor("");
      setData(hojeISO());
      setForma("pix");
      setObs("");
    }
  }, [open, editing, clienteFixo]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(valor.replace(",", "."));
    if (!clienteId) return void toast.error("Escolha a cliente.");
    if (!servicoId) return void toast.error("Escolha o serviço.");
    if (!Number.isFinite(v) || v < 0) return void toast.error("Valor inválido.");
    setSaving(true);
    const payload = {
      cliente_id: clienteId, servico_id: servicoId, valor_bruto: v, data,
      forma_pagamento: forma, observacoes: obs.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("atendimentos").update(payload).eq("id", editing.id)
      : await supabase.from("atendimentos").insert(payload);
    setSaving(false);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success(editing ? "Atendimento atualizado" : "Atendimento registrado");
    refresh();
    onOpenChange(false);
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

  const ativos = servicos.filter((s) => s.ativo || s.id === servicoId);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">
              {novoCliente ? "Nova cliente" : editing ? "Editar atendimento" : "Novo atendimento"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
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
                  <Label>Cliente</Label>
                  <div className="flex gap-2">
                    <NativeSelect value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!!clienteFixo}>
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
                <div className="space-y-2">
                  <Label>Serviço</Label>
                  <NativeSelect
                    value={servicoId}
                    onChange={(e) => {
                      setServicoId(e.target.value);
                      const s = servicos.find((x) => x.id === e.target.value);
                      if (s) setValor(String(s.preco_padrao));
                    }}
                  >
                    <option value="">Selecione...</option>
                    {ativos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </NativeSelect>
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
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMAS.map((f) => (
                      <Button
                        key={f.value}
                        type="button"
                        variant={forma === f.value ? "default" : "outline"}
                        className="h-12 rounded-xl text-base"
                        onClick={() => setForma(f.value)}
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className="text-base" />
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
