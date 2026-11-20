import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarPlus, Lock, Repeat, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "./ui-bits";
import { ClienteForm, emptyCliente } from "./ClienteForm";
import { ServicosPicker } from "./ServicosPicker";
import { RecorrenciaPicker } from "./RecorrenciaPicker";
import { RemarcarSerie } from "./RemarcarSerie";
import { BloqueioForm } from "./BloqueioForm";
import { useRemarcacaoSerie, type ModoSerie } from "./useRemarcacaoSerie";
import {
  STATUS_ATIVOS, criarAgendamentosRecorrentes, remarcarProximosDaSerie, salvarAtendimentoComItens, useAgenda,
  useBloqueios, useBloqueiosNasDatas, useClientes, useConfig, useMembrosSeries, type Atendimento, type Cliente,
} from "@/lib/data";
import { brl, hojeISO, horaAgora, horaHM, minutos } from "@/lib/format";
import { itensParaForm, limitarDuracao, totaisForm, validarItens, type ItemForm } from "@/lib/itens";
import { horariosLivres } from "@/lib/agenda";
import {
  bloqueioQueImpede, datasBloqueadas, diaInteiro, horarioDoBloqueio, textoImpedimento, tituloBloqueio, type Bloqueio,
} from "@/lib/bloqueios";
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
const SEM_BLOQUEIOS = new Map<string, Bloqueio>();

/** "Horário bloqueado em 20/11, das 14:00 às 15:00 (Consulta). Escolha outro horário." */
const avisoImpedimento = (b: Bloqueio) => `${textoImpedimento(b)}. Escolha outro ${diaInteiro(b) ? "dia" : "horário"}.`;

export function AgendaForm({
  open, onOpenChange, editing, dia, horaSugerida, clienteInicial, serieInicial = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Atendimento | null;
  /** Abre a edição já em "Este e os próximos" (atalho "Remarcar a série"). */
  serieInicial?: boolean;
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
  // Novo: agendamento ou bloqueio de horário (como na outra agenda do salão).
  const [tipo, setTipo] = useState<"agendamento" | "bloqueio">("agendamento");

  // Repetir (só em novo agendamento)
  const [repetir, setRepetir] = useState(false);
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);
  const [vezes, setVezes] = useState(VEZES_PADRAO);
  const [puladas, setPuladas] = useState<Set<string>>(new Set());
  // Série (ao editar): "Só este" ou "Este e os próximos", com os próximos que a Ana deixar marcados.
  const [modoSerie, setModoSerie] = useState<ModoSerie>("este");
  const [excluidosSerie, setExcluidosSerie] = useState<Set<string>>(new Set());
  const { data: series } = useMembrosSeries(editing?.serie_id ? [editing.serie_id] : []);
  const proximos = editing?.serie_id ? proximosDaSerie(editing.data, series?.get(editing.serie_id) ?? []) : [];

  const cliente = clientes.find((c) => c.id === clienteId);

  useEffect(() => {
    if (!open) return;
    setTipo("agendamento");
    setNovoCliente(false);
    setRepetir(false);
    setVezes(VEZES_PADRAO);
    setPuladas(new Set());
    setModoSerie(serieInicial ? "proximos" : "este");
    setExcluidosSerie(new Set());
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
  }, [open, editing, dia, horaSugerida, clienteInicial, serieInicial]);

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
  const { data: bloqDia = [] } = useBloqueios(data || dia, data || dia);
  const livres =
    data && Number.isInteger(dur) && dur >= 15 && dur <= 480
      ? horariosLivres({
          agendamentos: doDiaForm ?? [],
          inicioExpediente: horaHM(cfg?.hora_inicio) || "08:00",
          fimExpediente: horaHM(cfg?.hora_fim) || "19:00",
          duracao: dur,
          ignorarId: editing?.id,
          agora: data === hoje ? horaAgora() : null,
          bloqueios: bloqDia,
        })
      : [];

  // Bloqueio: o banco recusa 'agendado' novo ou que mude de lugar para dentro de um bloqueio.
  // Quem já estava dentro de um bloqueio pode ficar (e se ajustar nele). Cancelado/falta não confere.
  const conferirBloqueio = !editing || editing.status === "agendado";
  const lugarAntes = editing ? { data: editing.data, hora: editing.hora, duracao: editing.duracao_min } : null;
  const impede = conferirBloqueio && data ? bloqueioQueImpede(bloqDia, { data, hora, duracao: dur }, lugarAntes) : null;
  const jaDentro = !impede && editing?.status === "agendado" ? bloqueioQueImpede(bloqDia, { data, hora, duracao: dur }) : null;
  const diaBloqueado = bloqDia.find(diaInteiro) ?? null;

  // Série nova: datas que caem num bloqueio ficam de fora (como se fossem puladas).
  const serieNova = repetir && !editing;
  const todasSerie = serieNova ? gerarDatas(data, intervalo, vezes) : [data];
  const { data: bloqSerie = [] } = useBloqueiosNasDatas(todasSerie, serieNova);
  const bloqueadasSerie = serieNova ? datasBloqueadas(todasSerie, hora, dur, bloqSerie) : SEM_BLOQUEIOS;
  const datasSerie = serieNova ? todasSerie.filter((d) => !puladas.has(d) && !bloqueadasSerie.has(d)) : [data];

  const remarcacao = useRemarcacaoSerie({
    ativo: !!editing && modoSerie === "proximos" && proximos.length > 0,
    proximos,
    dataAntes: editing?.data ?? data,
    dataNova: data,
    horaNova: hora,
    duracao: dur,
    excluidos: excluidosSerie,
    idAtual: editing?.id,
    hoje,
  });
  const levarProximos = !!editing && modoSerie === "proximos" && remarcacao.selecionados.length > 0;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId) return void toast.error("Escolha a cliente.");
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    if (!data || !hora) return void toast.error("Informe data e hora.");
    if (impede) return void toast.error(avisoImpedimento(impede));
    if (datasSerie.length === 0) return void toast.error("Nenhuma data para agendar.");
    if (levarProximos && remarcacao.passado) {
      return void toast.error("Algum dos próximos cairia numa data que já passou. Desmarque ou escolha outra data.");
    }

    setSaving(true);
    // Confere os bloqueios de novo na hora de salvar (a tela pode estar desatualizada).
    if (conferirBloqueio) {
      const { data: bloqAgora, error: eBloq } = await supabase
        .from("bloqueios")
        .select("id, data, hora_inicio, hora_fim, descricao, serie_id")
        .in("data", datasSerie);
      // Sem a tabela (SQL ainda não aplicado) o banco também não trava: segue sem conferir.
      const b = eBloq ? null : datasSerie.map((d) => bloqueioQueImpede(bloqAgora ?? [], { data: d, hora, duracao: dur }, lugarAntes)).find(Boolean);
      if (b) {
        setSaving(false);
        qc.invalidateQueries({ queryKey: ["bloqueios"] });
        return void toast.error(avisoImpedimento(b));
      }
    }
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
    const nProximos = levarProximos ? remarcacao.conflitos.size : 0;
    if (conflitos.size > 0 || nProximos > 0) {
      const partes = [
        conflitos.size > 0
          ? datasSerie.length > 1
            ? `${plural(conflitos.size, "data tem", "datas têm")} horário ocupado.`
            : "Já existe atendimento neste horário."
          : "",
        nProximos > 0
          ? `${plural(nProximos, "dos próximos bate", "dos próximos batem")} com outro atendimento: ${remarcacao.selecionados
              .filter((r) => remarcacao.conflitos.has(r.item.id))
              .slice(0, 3)
              .map((r) => {
                const o = remarcacao.conflitos.get(r.item.id)!;
                return `${r.para.slice(8, 10)}/${r.para.slice(5, 7)} (${o.cliente.split(" ")[0]} ${horaHM(o.hora)})`;
              })
              .join(", ")}${nProximos > 3 ? " e outros" : ""}.`
          : "",
      ].filter(Boolean);
      return void setAviso(`${partes.join(" ")} Salvar mesmo assim?`);
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
        toast.success(`${plural(ids.length, "agendamento criado", "agendamentos criados")} · ${intervalo === 1 ? "todo dia" : `a cada ${intervalo} dias`}`);
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
        if (editing && levarProximos) {
          try {
            const n = await remarcarProximosDaSerie({
              atendimentoId: editing.id,
              dataAntes: editing.data,
              ids: remarcacao.selecionados.map((r) => r.item.id),
              hoje,
            });
            const mudouQuando = data !== editing.data || hora !== horaHM(editing.hora);
            toast.success(
              mudouQuando
                ? `${plural(n, "próximo da série remarcado", "próximos da série remarcados")}`
                : `${plural(n, "próximo da série atualizado", "próximos da série atualizados")}`,
            );
          } catch (err) {
            console.error(err);
            const motivo = mensagemErro(err, "");
            toast.error(`Este foi salvo, mas os próximos da série não mudaram${motivo ? `: ${motivo}.` : ". Tente de novo pelo próximo."}`);
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
      ? levarProximos
        ? `Salvar este e ${plural(remarcacao.selecionados.length, "próximo", "próximos")}`
        : "Salvar"
      : repetir && datasSerie.length > 1
        ? `Agendar ${datasSerie.length} vezes`
        : "Agendar";

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-2xl">
              {novoCliente ? "Nova cliente" : editing ? "Editar agendamento" : tipo === "bloqueio" ? "Bloquear horário" : "Agendar"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            {!editing && !novoCliente && (
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1" role="radiogroup" aria-label="O que marcar">
                {(["agendamento", "bloqueio"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => setTipo(t)}
                    className={cn(
                      "flex h-11 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
                      tipo === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {t === "agendamento" ? <CalendarPlus aria-hidden /> : <Lock aria-hidden />}
                    {t === "agendamento" ? "Agendamento" : "Bloqueio"}
                  </button>
                ))}
              </div>
            )}
            {!editing && !novoCliente && tipo === "bloqueio" ? (
              <BloqueioForm dia={data || dia} horaSugerida={hora || horaSugerida} editing={null} onPronto={() => onOpenChange(false)} />
            ) : novoCliente ? (
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
                  <Label htmlFor="ag-cliente">Cliente</Label>
                  <div className="flex gap-2">
                    <NativeSelect id="ag-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
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
                  <Label htmlFor="ag-data">Data</Label>
                  <Input id="ag-data" className="h-12 text-base" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label id="horarios-livres">Horários livres</Label>
                  {diaBloqueado ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock className="size-4 shrink-0" aria-hidden />
                      Dia bloqueado{diaBloqueado.descricao?.trim() ? ` (${diaBloqueado.descricao.trim()})` : ""}.
                    </p>
                  ) : itens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Escolha um serviço para ver os horários livres.</p>
                  ) : carregandoDia ? (
                    <p className="text-sm text-muted-foreground">Carregando horários…</p>
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
                            "h-11 shrink-0 rounded-full border px-4 text-base tabular-nums transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
                  <Label htmlFor="ag-hora">Hora</Label>
                  <Input
                    id="ag-hora"
                    className="h-12 text-base"
                    type="time"
                    step={60}
                    required
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    aria-invalid={!!impede}
                    aria-describedby={impede ? "ag-bloqueio" : undefined}
                  />
                  {impede && (
                    <p id="ag-bloqueio" role="alert" className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive">
                      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {avisoImpedimento(impede)}
                    </p>
                  )}
                  {jaDentro && (
                    <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                      Este horário ficou dentro de um bloqueio ({horarioDoBloqueio(jaDentro)} · {tituloBloqueio(jaDentro)}). Pode manter; remarque se precisar.
                    </p>
                  )}
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
                          bloqueadas={bloqueadasSerie}
                        />
                      </>
                    )}
                  </section>
                )}

                {editing && proximos.length > 0 && (
                  <RemarcarSerie
                    modo={modoSerie}
                    onModo={setModoSerie}
                    total={proximos.length}
                    dataAntes={editing.data}
                    horaAntes={horaHM(editing.hora)}
                    dataNova={data}
                    horaNova={hora}
                    plano={remarcacao.plano}
                    excluidos={excluidosSerie}
                    onExcluidos={setExcluidosSerie}
                    conflitos={remarcacao.conflitos}
                    bloqueados={remarcacao.bloqueados}
                    conferindo={remarcacao.conferindo}
                    hoje={hoje}
                  />
                )}

                <div className="space-y-2">
                  <Label htmlFor="ag-observacoes">Observações</Label>
                  <Textarea id="ag-observacoes" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} className="text-base" />
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
            <AlertDialogAction onClick={gravar} disabled={saving}>{editing ? "Salvar mesmo assim" : "Agendar mesmo assim"}</AlertDialogAction>
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
