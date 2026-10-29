import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Repeat, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "./ui-bits";
import { ClienteForm, emptyCliente } from "./ClienteForm";
import { ServicosPicker } from "./ServicosPicker";
import { RecorrenciaPicker } from "./RecorrenciaPicker";
import {
  STATUS_ATIVOS, aplicarAosProximosDaSerie, criarAgendamentosRecorrentes, salvarAtendimentoComItens, useAgenda,
  useClientes, useConfig, useMembrosSeries, type Atendimento, type Cliente,
} from "@/lib/data";
import { brl, hojeISO, horaAgora, horaHM, minutos } from "@/lib/format";
import { itensParaForm, limitarDuracao, totaisForm, validarItens, type ItemForm } from "@/lib/itens";
import { horariosLivres } from "@/lib/agenda";
import { INTERVALO_PADRAO, conflitosDasDatas, gerarDatas, proximosDaSerie, type Ocupado } from "@/lib/recorrencia";
import { mensagemErro } from "@/lib/erros";
import { plural } from "@/lib/texto";
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

const VEZES_PADRAO = 4;

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
  const hoje = hojeISO();
  const { data: clientes = [] } = useClientes();
  const [clienteId, setClienteId] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [data, setData] = useState(dia);
  const [hora, setHora] = useState("");
  const [obs, setObs] = useState("");
  const [novoCliente, setNovoCliente] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Repetir (só em novo agendamento)
  const [repetir, setRepetir] = useState(false);
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);
  const [vezes, setVezes] = useState(VEZES_PADRAO);
  const [puladas, setPuladas] = useState<Set<string>>(new Set());
  // Série (ao editar)
  const [aplicarProximos, setAplicarProximos] = useState(false);
  const { data: series } = useMembrosSeries(editing?.serie_id ? [editing.serie_id] : []);
  const proximos = editing?.serie_id ? proximosDaSerie(editing.data, series?.get(editing.serie_id) ?? []) : [];

  const cliente = clientes.find((c) => c.id === clienteId);

  useEffect(() => {
    if (!open) return;
    setNovoCliente(false);
    setRepetir(false);
    setVezes(VEZES_PADRAO);
    setPuladas(new Set());
    setAplicarProximos(false);
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

  // O intervalo começa no da cliente (ficha) ou no padrão.
  useEffect(() => {
    if (!editing) setIntervalo(cliente?.retorno_dias ?? INTERVALO_PADRAO);
  }, [cliente?.retorno_dias, editing]);

  // Mudar a data ou o intervalo muda as datas: as puladas deixam de valer.
  useEffect(() => setPuladas(new Set()), [data, intervalo]);

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
          agora: data === hoje ? horaAgora() : null,
        })
      : [];

  const datasSerie = repetir && !editing ? gerarDatas(data, intervalo, vezes).filter((d) => !puladas.has(d)) : [data];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) return void toast.error("Escolha a cliente.");
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    if (!data || !hora) return void toast.error("Informe data e hora.");

    setSaving(true);
    const { data: ocupados, error } = await supabase
      .from("atendimentos")
      .select("id, data, hora, duracao_min, status")
      .in("data", datasSerie)
      .in("status", STATUS_ATIVOS);
    setSaving(false);
    if (error) return void toast.error("Não foi possível verificar a agenda.");
    const conflitos = conflitosDasDatas(
      datasSerie, hora, dur, (ocupados as Omit<Ocupado, "cliente">[]).map((o) => ({ ...o, cliente: "" })), editing ? [editing.id] : [],
    );
    if (conflitos.size > 0) {
      return void setAviso(
        datasSerie.length > 1
          ? `${plural(conflitos.size, "data tem", "datas têm")} horário ocupado. Agendar mesmo assim?`
          : "Já existe atendimento neste horário. Agendar mesmo assim?",
      );
    }
    await gravar();
  }

  async function gravar() {
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    setSaving(true);
    try {
      if (repetir && !editing && datasSerie.length > 1) {
        const ids = await criarAgendamentosRecorrentes({
          clienteId, datas: datasSerie, hora, duracao: totalDuracao, observacoes: obs.trim(), itens: v.itens, intervaloDias: intervalo,
        });
        toast.success(`${plural(ids.length, "agendamento criado", "agendamentos criados")} · a cada ${intervalo} dias`);
        qc.invalidateQueries({ queryKey: ["clientes"] });
      } else {
        const campos = { cliente_id: clienteId, data, hora, observacoes: obs.trim() || null };
        const { atendimento, duracaoAjustada } = await salvarAtendimentoComItens(
          editing?.id ?? null,
          // forma_pagamento é obrigatória; a forma real é escolhida ao concluir.
          editing ? campos : { ...campos, forma_pagamento: "pix", status: "agendado" },
          v.itens,
        );
        toast.success(`${editing ? "Agendamento atualizado" : "Agendado"} · ${brl(atendimento.valor_bruto)}`);
        if (duracaoAjustada) toast.warning(`A duração total foi limitada a ${atendimento.duracao_min} min.`);
        if (editing && aplicarProximos && proximos.length > 0) {
          try {
            const n = await aplicarAosProximosDaSerie(editing.id);
            toast.success(`${plural(n, "próximo da série atualizado", "próximos da série atualizados")}`);
          } catch (err) {
            console.error(err);
            toast.error("Este foi salvo, mas os próximos da série não foram atualizados.");
          }
        }
      }
      setAviso(null);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(mensagemErro(err, "Não foi possível salvar."));
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    }
  }

  async function excluir(comProximos: boolean) {
    if (!editing) return;
    setExcluindo(true);
    // Os serviços e pagamentos são apagados junto pelo banco. "Próximos" = só os ainda agendados.
    const ids = [editing.id, ...(comProximos ? proximos.map((p) => p.id) : [])];
    const { error } = await supabase.from("atendimentos").delete().in("id", ids);
    setExcluindo(false);
    if (error) return void toast.error("Não foi possível excluir.");
    toast.success(ids.length > 1 ? `${plural(ids.length, "agendamento excluído", "agendamentos excluídos")}` : "Excluído");
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
    setConfirmDel(false);
    onOpenChange(false);
  }

  const rotuloBotao = saving
    ? "Salvando..."
    : editing
      ? "Salvar"
      : repetir && datasSerie.length > 1
        ? `Agendar ${datasSerie.length} vezes`
        : "Agendar";

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
                <AvisoSaude cliente={cliente} />
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

                {!editing && (
                  <section className="space-y-4 rounded-2xl border bg-card p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="repetir" className="flex items-center gap-2 font-semibold">
                        <Repeat className="size-5 text-primary" aria-hidden /> Repetir
                      </label>
                      <Switch id="repetir" checked={repetir} onCheckedChange={setRepetir} />
                    </div>
                    {repetir && (
                      <>
                        {cliente && (
                          <p className="-mt-2 text-xs text-muted-foreground">
                            O intervalo fica salvo como o retorno de {cliente.nome.split(" ")[0]}.
                          </p>
                        )}
                        <RecorrenciaPicker
                          inicio={data}
                          onInicio={setData}
                          hora={hora}
                          duracao={dur}
                          intervalo={intervalo}
                          onIntervalo={setIntervalo}
                          vezes={vezes}
                          onVezes={setVezes}
                          puladas={puladas}
                          onPuladas={setPuladas}
                          hoje={hoje}
                        />
                      </>
                    )}
                  </section>
                )}

                {editing && proximos.length > 0 && (
                  <label className="flex min-h-11 items-start gap-3 rounded-2xl border bg-card p-3.5">
                    <Checkbox
                      className="mt-0.5"
                      checked={aplicarProximos}
                      onCheckedChange={(c) => setAplicarProximos(c === true)}
                    />
                    <span className="text-sm">
                      <b>Aplicar também aos próximos da série</b>
                      <span className="block text-muted-foreground">
                        Hora, serviços e observações vão para {plural(proximos.length, "agendamento", "agendamentos")}. A data não muda.
                      </span>
                    </span>
                  </label>
                )}

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className="text-base" />
                </div>
                <Button type="submit" size="xl" disabled={saving || excluindo}>{rotuloBotao}</Button>
                {editing && (
                  <Button type="button" variant="ghost" className="h-12 w-full text-destructive" disabled={excluindo} onClick={() => setConfirmDel(true)}>
                    <Trash2 /> {editing.status === "realizado" ? "Excluir atendimento" : "Excluir agendamento"}
                  </Button>
                )}
              </form>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <AlertDialog open={aviso !== null} onOpenChange={(o) => !o && setAviso(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horário ocupado</AlertDialogTitle>
            <AlertDialogDescription>{aviso}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={gravar} disabled={saving}>Agendar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDel} onOpenChange={(o) => !excluindo && setConfirmDel(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editing?.status === "realizado" ? "Excluir atendimento?" : "Excluir agendamento?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {editing?.status === "realizado"
                ? "Essa ação não pode ser desfeita e o atendimento sai do Acerto."
                : proximos.length > 0
                  ? "Este horário faz parte de uma série. Se a cliente desmarcou, prefira Cancelar, que mantém o histórico."
                  : "Essa ação não pode ser desfeita. Se a cliente desmarcou, prefira Cancelar, que mantém o histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={cn(proximos.length > 0 && "sm:flex-col sm:space-x-0 sm:gap-2")}>
            <AlertDialogCancel disabled={excluindo}>Voltar</AlertDialogCancel>
            {proximos.length > 0 && (
              <AlertDialogAction
                disabled={excluindo}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); void excluir(true); }}
              >
                Este e os próximos ({proximos.length})
              </AlertDialogAction>
            )}
            <AlertDialogAction
              disabled={excluindo}
              onClick={(e) => {
                // Mantém o diálogo aberto até terminar de excluir.
                e.preventDefault();
                void excluir(false);
              }}
            >
              {excluindo ? "Excluindo..." : proximos.length > 0 ? "Só este" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
