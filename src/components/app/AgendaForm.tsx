import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, UserPlus } from "lucide-react";
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
import {
  STATUS_ATIVOS, salvarAtendimentoComItens, useAgenda, useClientes, useConfig, type Atendimento, type Cliente,
} from "@/lib/data";
import { brl, hojeISO, horaAgora, horaHM, minutos } from "@/lib/format";
import { itensParaForm, limitarDuracao, totaisForm, validarItens, type ItemForm } from "@/lib/itens";
import { horariosLivres } from "@/lib/agenda";
import { cn } from "@/lib/utils";

export function AvisoSaude({ cliente }: { cliente: Cliente | undefined }) {
  if (!cliente) return null;
  const itens = [
    cliente.alergias?.trim() && `Alergias: ${cliente.alergias.trim()}`,
    cliente.gestante && "Gestante",
    cliente.diabetes_circulacao && "Diabetes / problemas de circulação",
    cliente.problema_unhas?.trim() && `Unhas: ${cliente.problema_unhas.trim()}`,
  ].filter(Boolean) as string[];
  if (itens.length === 0) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="font-semibold">Atenção à anamnese</div>
        <ul className="mt-1 space-y-0.5">{itens.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
    </div>
  );
}

export function AgendaForm({
  open, onOpenChange, editing, dia, horaSugerida, clienteInicial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Atendimento | null;
  dia: string;
  horaSugerida: string;
  clienteInicial?: string | undefined;
}) {
  const qc = useQueryClient();
  const { data: clientes = [] } = useClientes();
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [data, setData] = useState(dia);
  const [hora, setHora] = useState("");
  const [obs, setObs] = useState("");
  const [novoCliente, setNovoCliente] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmSobreposicao, setConfirmSobreposicao] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNovoCliente(false);
    if (editing) {
      setClienteId(editing.cliente_id);
      setItens(itensParaForm(editing.itens));
      setData(editing.data);
      setHora(horaHM(editing.hora));
      setObs(editing.observacoes ?? "");
    } else {
      setClienteId(clienteInicial ?? "");
      setItens([]);
      setData(dia);
      setHora(horaSugerida);
      setObs("");
    }
  }, [open, editing, dia, horaSugerida, clienteInicial]);

  // Duração total do atendimento (soma dos itens, limitada a 15–480) para horários e conflitos.
  const totalDuracao = totaisForm(itens).duracao;
  const dur = totalDuracao > 0 ? limitarDuracao(totalDuracao).duracao : Number.NaN;

  const { data: cfg } = useConfig();
  const { data: doDiaForm, isLoading: carregandoDia } = useAgenda(data || dia, data || dia);
  const livres =
    data && Number.isInteger(dur) && dur >= 15 && dur <= 480
      ? horariosLivres({
          agendamentos: doDiaForm ?? [],
          inicioExpediente: horaHM(cfg?.hora_inicio) || "08:00",
          fimExpediente: horaHM(cfg?.hora_fim) || "19:00",
          duracao: dur,
          ignorarId: editing?.id,
          agora: data === hojeISO() ? horaAgora() : null,
        })
      : [];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) return void toast.error("Escolha a cliente.");
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    if (!data || !hora) return void toast.error("Informe data e hora.");

    setSaving(true);
    const { data: doDia, error } = await supabase
      .from("atendimentos").select("*").eq("data", data).in("status", STATUS_ATIVOS);
    if (error) {
      setSaving(false);
      return void toast.error("Não foi possível verificar a agenda.");
    }
    const ini = minutos(hora);
    const fim = ini + dur;
    const sobrepoe = (doDia as Atendimento[]).some((o) => {
      if (o.id === editing?.id || !o.hora) return false;
      const oIni = minutos(o.hora);
      return oIni < fim && ini < oIni + o.duracao_min;
    });
    if (sobrepoe) {
      setSaving(false);
      return void setConfirmSobreposicao(true);
    }
    await gravar();
  }

  async function gravar() {
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    setSaving(true);
    const campos = { cliente_id: clienteId, data, hora, observacoes: obs.trim() || null };
    try {
      const { atendimento, duracaoAjustada } = await salvarAtendimentoComItens(
        editing?.id ?? null,
        // forma_pagamento é obrigatória; a forma real é escolhida ao concluir.
        editing ? campos : { ...campos, forma_pagamento: "pix", status: "agendado" },
        v.itens,
      );
      toast.success(`${editing ? "Agendamento atualizado" : "Agendado"} · ${brl(atendimento.valor_bruto)}`);
      if (duracaoAjustada) toast.warning(`A duração total foi limitada a ${atendimento.duracao_min} min.`);
      setConfirmSobreposicao(false);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar.");
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">
              {novoCliente ? "Nova cliente" : editing ? "Editar agendamento" : "Agendar"}
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
                  <Label>Cliente</Label>
                  <div className="flex gap-2">
                    <NativeSelect value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </NativeSelect>
                    <Button type="button" variant="secondary" className="h-12 w-12 shrink-0 rounded-xl" aria-label="Nova cliente" onClick={() => setNovoCliente(true)}>
                      <UserPlus />
                    </Button>
                  </div>
                </div>
                <AvisoSaude cliente={clientes.find((c) => c.id === clienteId)} />
                <ServicosPicker itens={itens} onChange={setItens} />
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input className="h-12 text-base" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label id="horarios-livres">Horários livres</Label>
                  {carregandoDia ? (
                    <p className="text-sm text-muted-foreground">Carregando horários...</p>
                  ) : livres.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem horários livres neste dia.</p>
                  ) : (
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-labelledby="horarios-livres">
                      {livres.map((h) => (
                        <button
                          key={h}
                          type="button"
                          aria-pressed={hora === h}
                          onClick={() => setHora(h)}
                          className={cn(
                            "h-10 shrink-0 rounded-full border px-4 text-base tabular-nums",
                            hora === h ? "border-primary bg-primary text-primary-foreground" : "bg-card active:bg-muted",
                          )}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input className="h-12 text-base" type="time" step={60} required value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className="text-base" />
                </div>
                <Button type="submit" size="xl" disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar" : "Agendar"}</Button>
              </form>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <AlertDialog open={confirmSobreposicao} onOpenChange={setConfirmSobreposicao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horário ocupado</AlertDialogTitle>
            <AlertDialogDescription>Já existe atendimento neste horário. Agendar mesmo assim?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={gravar} disabled={saving}>Agendar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
