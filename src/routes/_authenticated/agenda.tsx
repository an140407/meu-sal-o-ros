import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, MessageCircle, Pencil, Plus, Repeat, RotateCcw, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { AgendaForm, AvisoSaude } from "@/components/app/AgendaForm";
import { AtendimentoForm } from "@/components/app/AtendimentoForm";
import { ServicosPicker } from "@/components/app/ServicosPicker";
import { PagamentosPicker } from "@/components/app/PagamentosPicker";
import { RecorrenciaPicker } from "@/components/app/RecorrenciaPicker";
import {
  STATUS_ATIVOS, criarAgendamentosRecorrentes, proximoMes, salvarAtendimentoComItens, useAgenda, useClientes, useConfig,
  useMembrosSeries, useProximosDaCliente, type Atendimento, type Status,
} from "@/lib/data";
import {
  INTERVALO_PADRAO, gerarDatas, intervaloDaSerie, posicaoNaSerie, proximosDaSerie, type Membro,
} from "@/lib/recorrencia";
import { plural } from "@/lib/texto";
import { itensParaForm, nomesItens, somaItens, totaisForm, validarItens, type ItemForm } from "@/lib/itens";
import { formaPrincipal, partesIniciais, validarPagamentos, type ParteForm } from "@/lib/pagamentos";
import { mensagemErro } from "@/lib/erros";
import {
  brl, dataBR, diaDoMes, diaPorExtenso, diaSemanaCurto, hojeISO, horaAgora, horaDeMinutos, horaHM,
  inicioSemana, mesAno, minutos, somarDias,
} from "@/lib/format";
import { gradeMes } from "@/lib/agenda";
import { linkGoogleAgenda, linkWhatsapp } from "@/lib/links";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  // ?cliente=<id> abre "Agendar" com a cliente pré-selecionada (vindo de Clientes › Para retorno).
  // ?dia=YYYY-MM-DD abre a visão de Dia nesse dia (vindo da ficha da cliente › Próximos).
  validateSearch: (s: Record<string, unknown>): { cliente?: string; dia?: string } => {
    const cliente = s["cliente"];
    const dia = s["dia"];
    return {
      ...(typeof cliente === "string" && cliente ? { cliente } : {}),
      ...(typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) && somarDias(dia, 0) === dia ? { dia } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Agenda — Lunula" },
      { name: "description", content: "Agendamentos do dia e da semana." },
      { property: "og:title", content: "Agenda — Lunula" },
      { property: "og:description", content: "Agendamentos do dia e da semana." },
    ],
  }),
  component: Page,
});

const STATUS: Record<Status, { label: string; badge: string; borda: string }> = {
  agendado: { label: "Agendado", badge: "bg-sky-100 text-sky-800", borda: "border-l-sky-400" },
  realizado: { label: "Realizado", badge: "bg-emerald-100 text-emerald-800", borda: "border-l-emerald-500" },
  cancelado: { label: "Cancelado", badge: "bg-zinc-200 text-zinc-700", borda: "border-l-zinc-400" },
  faltou: { label: "Faltou", badge: "bg-amber-100 text-amber-800", borda: "border-l-amber-500" },
};

const ativo = (a: Atendimento) => STATUS_ATIVOS.includes(a.status);
const intervalo = (a: Atendimento) =>
  a.hora ? `${horaHM(a.hora)}–${horaDeMinutos(minutos(a.hora) + a.duracao_min)}` : "Sem horário";

function Page() {
  const hoje = hojeISO();
  const [dia, setDia] = useState(hoje);
  const [visao, setVisao] = useState<"dia" | "mes">("dia");
  const inicio = inicioSemana(dia);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const mes = dia.slice(0, 7);
  const grade = gradeMes(mes);
  // Uma consulta só: a semana na visão de Dia, a grade inteira (com semanas parciais) na de Mês.
  const { data: semana = [], isLoading } = useAgenda(
    visao === "mes" ? grade[0]! : inicio,
    visao === "mes" ? grade[grade.length - 1]! : dias[6]!,
  );
  const { data: cfg } = useConfig();
  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();
  const { data: series } = useMembrosSeries(semana.flatMap((a) => (a.serie_id ? [a.serie_id] : [])));
  const membrosDe = (a: Atendimento) => (a.serie_id ? series?.get(a.serie_id) ?? [] : []);
  const [cancelarSerie, setCancelarSerie] = useState<Atendimento | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Atendimento | null>(null);
  const [acoes, setAcoes] = useState<Atendimento | null>(null);
  const [concluir, setConcluir] = useState<Atendimento | null>(null);
  const [editRealizado, setEditRealizado] = useState<Atendimento | null>(null);
  const [clienteInicial, setClienteInicial] = useState<string>();
  const { cliente: clienteBusca, dia: diaBusca } = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    if (!clienteBusca && !diaBusca) return;
    if (diaBusca) {
      setDia(diaBusca);
      setVisao("dia");
    }
    if (clienteBusca) {
      setClienteInicial(clienteBusca);
      setEditing(null);
      setFormOpen(true);
    }
    // Limpa a URL para não reaplicar ao recarregar.
    navigate({ search: {}, replace: true });
  }, [clienteBusca, diaBusca, navigate]);

  const comAgenda = new Set(semana.filter(ativo).map((a) => a.data));
  const ativosPorDia = new Map<string, number>();
  for (const a of semana.filter(ativo)) ativosPorDia.set(a.data, (ativosPorDia.get(a.data) ?? 0) + 1);
  const doDia = semana.filter((a) => a.data === dia);

  const inicioExp = horaHM(cfg?.hora_inicio) || "08:00";
  const fimExp = horaHM(cfg?.hora_fim) || "19:00";
  // Sugere o fim do último agendamento ativo do dia (hoje: nunca antes de agora, arredondado a 15 min),
  // se ainda couber no expediente.
  const agoraArredondado = dia === hoje ? Math.ceil(minutos(horaAgora()) / 15) * 15 : 0;
  const ultimoFim = Math.max(
    ...doDia.filter((a) => ativo(a) && a.hora).map((a) => minutos(a.hora!) + a.duracao_min),
    minutos(inicioExp),
    agoraArredondado,
  );
  const horaSugerida = ultimoFim < minutos(fimExp) ? horaDeMinutos(ultimoFim) : inicioExp;

  const abrir = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  function confirmarWhatsapp(a: Atendimento) {
    const cliente = clientes.find((c) => c.id === a.cliente_id);
    const url = linkWhatsapp({
      telefone: cliente?.telefone,
      cliente: a.clientes?.nome ?? cliente?.nome ?? "",
      servico: nomesItens(a.itens),
      data: a.data,
      hora: a.hora,
    });
    if (!url) return void toast.error("Cliente sem telefone válido");
    abrir(url);
  }

  function adicionarGoogleAgenda(a: Atendimento) {
    // Só observações do agendamento; nada da anamnese vai para o Google.
    const url = linkGoogleAgenda({
      servico: nomesItens(a.itens),
      cliente: a.clientes?.nome ?? "—",
      data: a.data,
      hora: a.hora,
      duracaoMin: a.duracao_min,
      observacoes: a.observacoes,
    });
    if (!url) return void toast.error("Agendamento sem horário");
    abrir(url);
  }

  const [mudandoStatus, setMudandoStatus] = useState(false);

  /** Muda o status de `a` (e de `outros`, na mesma situação). O Desfazer volta exatamente esses ids. */
  async function mudarStatus(a: Atendimento, status: Status, msg: string, outros: string[] = []) {
    if (mudandoStatus) return;
    setMudandoStatus(true);
    const ids = [a.id, ...outros];
    const patch: TablesUpdate<"atendimentos"> & { status: Status } = { status };
    const { error } = await supabase.from("atendimentos").update(patch).in("id", ids);
    setMudandoStatus(false);
    if (error) return void toast.error("Não foi possível salvar.");
    setAcoes(null);
    setCancelarSerie(null);
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
    toast.success(msg, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const volta: TablesUpdate<"atendimentos"> & { status: Status } = { status: a.status };
          const { error: e } = await supabase.from("atendimentos").update(volta).in("id", ids);
          if (e) return void toast.error("Não foi possível desfazer.");
          qc.invalidateQueries({ queryKey: ["atendimentos"] });
        },
      },
    });
  }

  return (
    <>
      <PageHeader title="Agenda">
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => setDia(hoje)}>Hoje</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 px-5 pb-3" role="group" aria-label="Visão da agenda">
        {(["dia", "mes"] as const).map((v) => (
          <Button
            key={v}
            type="button"
            variant={visao === v ? "default" : "outline"}
            className="h-11 rounded-xl text-base"
            aria-pressed={visao === v}
            onClick={() => setVisao(v)}
          >
            {v === "dia" ? "Dia" : "Mês"}
          </Button>
        ))}
      </div>

      {visao === "mes" ? (
        <div className="px-2">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="size-11 shrink-0 px-0" aria-label="Mês anterior" onClick={() => setDia(`${somarDias(`${mes}-01`, -1).slice(0, 7)}-01`)}>
              <ChevronLeft className="size-6" />
            </Button>
            <h2 className="text-xl">{mesAno(mes)}</h2>
            <Button variant="ghost" className="size-11 shrink-0 px-0" aria-label="Próximo mês" onClick={() => setDia(proximoMes(mes))}>
              <ChevronRight className="size-6" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 px-1 pt-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
            {grade.slice(0, 7).map((d) => <div key={d}>{diaSemanaCurto(d)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 px-1 pt-1">
            {grade.map((d) => {
              const n = ativosPorDia.get(d) ?? 0;
              const foraDoMes = !d.startsWith(mes);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDia(d); setVisao("dia"); }}
                  aria-label={`${diaPorExtenso(d)}${d === hoje ? " (hoje)" : ""}, ${plural(n, "agendamento", "agendamentos")}`}
                  className={cn(
                    "flex h-16 flex-col items-center justify-start gap-1 rounded-xl pt-1.5 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    foraDoMes && "text-muted-foreground/60",
                    d === hoje && "bg-secondary font-semibold text-primary ring-1 ring-primary",
                  )}
                >
                  <span className="text-base leading-tight">{diaDoMes(d)}</span>
                  {n > 0 && (
                    <span
                      className={cn(
                        "min-w-6 rounded-full px-1.5 text-xs font-semibold leading-5 tabular-nums",
                        foraDoMes ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isLoading && <Empty>Carregando...</Empty>}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 px-2">
            <Button variant="ghost" className="h-16 w-11 shrink-0 px-0" aria-label="Semana anterior" onClick={() => setDia(somarDias(dia, -7))}>
              <ChevronLeft className="size-6" />
            </Button>
            <div className="grid flex-1 grid-cols-7 gap-1">
              {dias.map((d) => {
                const sel = d === dia;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDia(d)}
                    aria-pressed={sel}
                    aria-label={`${diaPorExtenso(d)}${d === hoje ? " (hoje)" : ""}${comAgenda.has(d) ? ", com agendamentos" : ""}`}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center rounded-xl transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      sel ? "bg-primary text-primary-foreground shadow-soft" : "active:bg-muted",
                      d === hoje && !sel && "bg-secondary font-semibold text-primary ring-1 ring-primary",
                    )}
                  >
                    <span className="text-[11px] uppercase tracking-wide">{diaSemanaCurto(d)}</span>
                    <span className="text-lg font-semibold leading-tight">{diaDoMes(d)}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 size-1.5 rounded-full",
                        comAgenda.has(d) ? (sel ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" className="h-16 w-11 shrink-0 px-0" aria-label="Próxima semana" onClick={() => setDia(somarDias(dia, 7))}>
              <ChevronRight className="size-6" />
            </Button>
          </div>

          <div className="space-y-4 px-5 pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl">{diaPorExtenso(dia)}</h2>
              <span className="shrink-0 text-sm text-muted-foreground">{inicioExp}–{fimExp}</span>
            </div>
            <Button size="xl" onClick={() => { setEditing(null); setClienteInicial(undefined); setFormOpen(true); }}>
              <Plus /> Agendar
            </Button>

            {isLoading ? <Empty>Carregando...</Empty> : doDia.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-rose-gradient px-5 py-10 text-center">
                <CalendarDays className="size-8 text-primary" aria-hidden />
                <p className="font-semibold">Dia livre por enquanto</p>
                <p className="text-sm text-muted-foreground">Toque em “Agendar” para marcar uma cliente.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {doDia.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setAcoes(a)}
                      className={cn(
                        "w-full rounded-2xl border border-l-4 bg-card px-4 py-3 text-left transition-transform duration-150 ease-out active:scale-[0.98] active:bg-muted motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        STATUS[a.status].borda,
                        !ativo(a) && "opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{intervalo(a)}</span>
                        <SeloSerie a={a} membros={membrosDe(a)} />
                        <span className={cn("ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[a.status].badge)}>
                          {STATUS[a.status].label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-3">
                        <span className={cn("min-w-0 truncate text-lg font-semibold", !ativo(a) && "line-through")}>
                          {a.clientes?.nome ?? "—"}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{brl(a.valor_bruto)}</span>
                      </div>
                      <div className="line-clamp-2 text-sm text-muted-foreground">{nomesItens(a.itens)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Drawer open={!!acoes} onOpenChange={(o) => !o && setAcoes(null)}>
        <DrawerContent className="max-h-[92vh]">
          {acoes && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="font-display text-2xl">{acoes.clientes?.nome ?? "—"}</DrawerTitle>
                <DrawerDescription>
                  {diaPorExtenso(acoes.data)} · {intervalo(acoes)} · {nomesItens(acoes.itens)} · {brl(acoes.valor_bruto)}
                </DrawerDescription>
              </DrawerHeader>
              <div className="space-y-3 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <QuadroSerie a={acoes} membros={membrosDe(acoes)} />
                {acoes.status === "agendado" && <AvisoSaude cliente={clientes.find((c) => c.id === acoes.cliente_id)} />}
                {acoes.status === "agendado" && (
                  <>
                    <Button size="xl" onClick={() => { setConcluir(acoes); setAcoes(null); }}><Check /> Concluir</Button>
                    <Button size="xl" variant="secondary" onClick={() => { setEditing(acoes); setAcoes(null); setFormOpen(true); }}><Pencil /> Editar</Button>
                    <Button size="xl" variant="outline" onClick={() => confirmarWhatsapp(acoes)}><MessageCircle /> Confirmar por WhatsApp</Button>
                    <Button size="xl" variant="outline" onClick={() => adicionarGoogleAgenda(acoes)}><CalendarPlus /> Adicionar ao Google Agenda</Button>
                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" className="h-14 rounded-2xl text-base" disabled={mudandoStatus} onClick={() => mudarStatus(acoes, "faltou", "Marcado como falta")}><UserX /> Faltou</Button>
                      <Button
                        variant="outline"
                        className="h-14 rounded-2xl text-base text-destructive"
                        disabled={mudandoStatus}
                        onClick={() =>
                          proximosDaSerie(acoes.data, membrosDe(acoes)).length > 0
                            ? setCancelarSerie(acoes)
                            : mudarStatus(acoes, "cancelado", "Agendamento cancelado")
                        }
                      >
                        <Ban /> Cancelar
                      </Button>
                    </div>
                  </>
                )}
                {(acoes.status === "cancelado" || acoes.status === "faltou") && (
                  <>
                    <Button size="xl" disabled={mudandoStatus} onClick={() => mudarStatus(acoes, "agendado", "Voltou para agendado")}><RotateCcw /> Voltar para agendado</Button>
                    <Button size="xl" variant="secondary" onClick={() => { setEditing(acoes); setAcoes(null); setFormOpen(true); }}><Pencil /> Editar</Button>
                  </>
                )}
                {acoes.status === "realizado" && (
                  <>
                    <Button size="xl" variant="secondary" onClick={() => { setEditRealizado(acoes); setAcoes(null); }}><Pencil /> Editar atendimento</Button>
                    <Button size="xl" variant="outline" disabled={mudandoStatus} onClick={() => mudarStatus(acoes, "agendado", "Voltou para agendado")}><RotateCcw /> Voltar para agendado</Button>
                  </>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <AlertDialog open={!!cancelarSerie} onOpenChange={(o) => !o && !mudandoStatus && setCancelarSerie(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Este horário faz parte de uma série. Concluídos e datas anteriores não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelarSerie && (
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="h-12 rounded-xl text-base text-destructive"
                disabled={mudandoStatus}
                onClick={() => mudarStatus(cancelarSerie, "cancelado", "Agendamento cancelado")}
              >
                Só este ({cancelarSerie.data.slice(8, 10)}/{cancelarSerie.data.slice(5, 7)})
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl text-base text-destructive"
                disabled={mudandoStatus}
                onClick={() => {
                  const outros = proximosDaSerie(cancelarSerie.data, membrosDe(cancelarSerie)).map((m) => m.id);
                  void mudarStatus(cancelarSerie, "cancelado", `${plural(outros.length + 1, "agendamento cancelado", "agendamentos cancelados")}`, outros);
                }}
              >
                Este e os próximos ({proximosDaSerie(cancelarSerie.data, membrosDe(cancelarSerie)).length + 1})
              </Button>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mudandoStatus}>Voltar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgendaForm open={formOpen} onOpenChange={setFormOpen} editing={editing} dia={dia} horaSugerida={horaSugerida} clienteInicial={clienteInicial} />
      <ConcluirForm atendimento={concluir} onClose={() => setConcluir(null)} />
      <AtendimentoForm open={!!editRealizado} onOpenChange={(o) => !o && setEditRealizado(null)} editing={editRealizado} />
    </>
  );
}

/** "↻ 3 de 12" no card de um agendamento em série. */
function SeloSerie({ a, membros }: { a: Atendimento; membros: Membro[] }) {
  const pos = a.serie_id ? posicaoNaSerie(a.id, membros) : null;
  if (!pos) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
      <Repeat className="size-3.5" aria-hidden />
      <span className="sr-only">Série, </span>{pos.n} de {pos.m}
    </span>
  );
}

/** Quadro "Série · a cada X dias · N de M · próxima dd/mm" nas ações do agendamento. */
function QuadroSerie({ a, membros }: { a: Atendimento; membros: Membro[] }) {
  const pos = a.serie_id ? posicaoNaSerie(a.id, membros) : null;
  if (!pos) return null;
  const cada = intervaloDaSerie(membros);
  const proxima = proximosDaSerie(a.data, membros)[0];
  return (
    <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
      <Repeat className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="tabular-nums">
        Série{cada ? ` · a cada ${cada} dias` : ""} · <b>{pos.n} de {pos.m}</b>
        {proxima ? ` · próxima ${proxima.data.slice(8, 10)}/${proxima.data.slice(5, 7)}` : ""}
      </span>
    </div>
  );
}

function ConcluirForm({ atendimento, onClose }: { atendimento: Atendimento | null; onClose: () => void }) {
  const qc = useQueryClient();
  const hoje = hojeISO();
  const { data: cfg } = useConfig();
  const { data: clientes = [] } = useClientes();
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [partes, setPartes] = useState<ParteForm[]>([]);
  const [saving, setSaving] = useState(false);
  const total = totaisForm(itens).valor;
  const duracao = totaisForm(itens).duracao;
  const taxas = { debito: Number(cfg?.taxa_debito ?? 0), credito: Number(cfg?.taxa_credito ?? 0) };

  // Retorno: oferecido quando a cliente não tem outro agendamento futuro.
  const cliente = clientes.find((c) => c.id === atendimento?.cliente_id);
  const { data: futuros, isLoading: carregandoFuturos } = useProximosDaCliente(atendimento?.cliente_id ?? "", hoje);
  const jaTem = (futuros ?? []).find((p) => p.id !== atendimento?.id);
  const [retorno, setRetorno] = useState(false);
  const [intervalo, setIntervalo] = useState(INTERVALO_PADRAO);
  const [vezes, setVezes] = useState(1);
  const [inicio, setInicio] = useState(hoje);
  const [horaRetorno, setHoraRetorno] = useState("");
  const [puladas, setPuladas] = useState<Set<string>>(new Set());
  const base = atendimento ? (atendimento.data > hoje ? atendimento.data : hoje) : hoje;

  useEffect(() => {
    if (!atendimento) return;
    setItens(itensParaForm(atendimento.itens));
    // Agendado ainda não tem partes de verdade (a forma é provisória): começa com Pix no total.
    const gravadas = atendimento.atendimento_pagamentos.length > 0 ? atendimento.pagamentos : [];
    setPartes(partesIniciais(gravadas, Number(atendimento.valor_bruto)));
    setVezes(1);
    setHoraRetorno(horaHM(atendimento.hora) || "09:00");
  }, [atendimento]);

  // Intervalo e liga/desliga vêm da ficha da cliente.
  useEffect(() => {
    if (!atendimento) return;
    setIntervalo(cliente?.retorno_dias ?? INTERVALO_PADRAO);
    setRetorno(!!cliente?.retorno_dias);
  }, [atendimento, cliente?.retorno_dias]);

  // Primeira data do retorno = data do atendimento (ou hoje) + intervalo; muda junto com o intervalo.
  useEffect(() => {
    setInicio(somarDias(base, intervalo));
    setPuladas(new Set());
  }, [base, intervalo]);

  const oferecerRetorno = !!atendimento && !carregandoFuturos && !jaTem;
  const agendarRetorno = oferecerRetorno && retorno;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!atendimento) return;
    const v = validarItens(itens);
    if ("erro" in v) return void toast.error(v.erro);
    const pg = validarPagamentos(partes, somaItens(v.itens).valor);
    if ("erro" in pg) return void toast.error(pg.erro);
    if (agendarRetorno && !horaRetorno) return void toast.error("Informe a hora do retorno.");
    setSaving(true);
    try {
      // O total vem da soma dos itens; o líquido, das taxas de cada parte (calculados no banco).
      const { atendimento: lido, duracaoAjustada } = await salvarAtendimentoComItens(
        atendimento.id,
        { status: "realizado", forma_pagamento: formaPrincipal(pg.pagamentos) },
        v.itens,
        pg.pagamentos,
      );
      toast.success(`Atendimento concluído · ${brl(lido.valor_bruto)}`);
      if (duracaoAjustada) toast.warning(`A duração total foi limitada a ${lido.duracao_min} min.`);
    } catch (err) {
      console.error(err);
      toast.error(mensagemErro(err, "Não foi possível concluir."));
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
      return;
    }

    if (agendarRetorno) {
      const datas = gerarDatas(inicio, intervalo, vezes).filter((d) => !puladas.has(d));
      try {
        const ids = await criarAgendamentosRecorrentes({
          clienteId: atendimento.cliente_id, datas, hora: horaRetorno, duracao, observacoes: "", itens: v.itens, intervaloDias: intervalo,
        });
        toast.success(
          ids.length === 1
            ? `Retorno agendado para ${datas[0]!.slice(8, 10)}/${datas[0]!.slice(5, 7)} às ${horaRetorno}`
            : `${plural(ids.length, "retorno agendado", "retornos agendados")} · a cada ${intervalo} dias`,
        );
        qc.invalidateQueries({ queryKey: ["clientes"] });
      } catch (err) {
        console.error(err);
        toast.error("Atendimento concluído, mas o retorno não foi agendado.");
      }
    }
    setSaving(false);
    onClose();
    // Atualiza Histórico, ficha da cliente, Acerto e a própria agenda.
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
  }

  return (
    <Drawer open={!!atendimento} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl">Concluir atendimento</DrawerTitle>
          <DrawerDescription className="truncate">
            {atendimento?.clientes?.nome ?? "—"}
            {atendimento ? ` · ${dataBR(atendimento.data).slice(0, 5)}${atendimento.hora ? ` · ${horaHM(atendimento.hora)}` : ""}` : ""}
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={salvar} className="space-y-5 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <ServicosPicker itens={itens} onChange={setItens} />
          <PagamentosPicker total={total} partes={partes} onChange={setPartes} taxas={taxas} />

          {jaTem ? (
            <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
              <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
              Já tem próximo agendamento em {dataBR(jaTem.data).slice(0, 5)}{jaTem.hora ? ` às ${horaHM(jaTem.hora)}` : ""}.
            </p>
          ) : oferecerRetorno ? (
            <section className="space-y-4 rounded-2xl border bg-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="agendar-retorno" className="flex items-center gap-2 font-semibold">
                  <CalendarPlus className="size-5 text-primary" aria-hidden /> Agendar retorno
                </label>
                <Switch id="agendar-retorno" checked={retorno} onCheckedChange={setRetorno} />
              </div>
              {retorno && (
                <>
                  <p className="-mt-2 text-xs text-muted-foreground">
                    {cliente?.retorno_dias ? "Intervalo da ficha da cliente." : "O intervalo fica salvo na ficha da cliente."} Mesmos serviços ({duracao} min).
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="hora-retorno">Hora do retorno</Label>
                    <Input id="hora-retorno" className="h-12 text-base" type="time" step={60} value={horaRetorno} onChange={(e) => setHoraRetorno(e.target.value)} />
                  </div>
                  <RecorrenciaPicker
                    inicio={inicio}
                    onInicio={setInicio}
                    hora={horaRetorno}
                    duracao={duracao}
                    intervalo={intervalo}
                    onIntervalo={setIntervalo}
                    vezes={vezes}
                    onVezes={setVezes}
                    puladas={puladas}
                    onPuladas={setPuladas}
                    hoje={hoje}
                    textoVezes="1 = só o próximo"
                  />
                </>
              )}
            </section>
          ) : null}

          <Button type="submit" size="xl" disabled={saving}>
            {saving ? "Salvando..." : agendarRetorno ? "Concluir e agendar retorno" : "Concluir"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
