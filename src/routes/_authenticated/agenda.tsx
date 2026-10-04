import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, MessageCircle, Pencil, Plus, RotateCcw, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { PageHeader, Empty } from "@/components/app/ui-bits";
import { AgendaForm, AvisoSaude } from "@/components/app/AgendaForm";
import { AtendimentoForm } from "@/components/app/AtendimentoForm";
import { STATUS_ATIVOS, proximoMes, useAgenda, useClientes, useConfig, type Atendimento, type Status } from "@/lib/data";
import {
  FORMAS, brl, diaDoMes, diaPorExtenso, diaSemanaCurto, hojeISO, horaDeMinutos, horaHM,
  inicioSemana, mesAno, minutos, somarDias, type Forma,
} from "@/lib/format";
import { gradeMes } from "@/lib/agenda";
import { linkGoogleAgenda, linkWhatsapp } from "@/lib/links";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  // ?cliente=<id> abre "Agendar" com a cliente pré-selecionada (vindo de Clientes › Para retorno).
  validateSearch: (s: Record<string, unknown>): { cliente?: string } =>
    typeof s["cliente"] === "string" && s["cliente"] ? { cliente: s["cliente"] } : {},
  head: () => ({
    meta: [
      { title: "Agenda — Caderno da Nail" },
      { name: "description", content: "Agendamentos do dia e da semana." },
      { property: "og:title", content: "Agenda — Caderno da Nail" },
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Atendimento | null>(null);
  const [acoes, setAcoes] = useState<Atendimento | null>(null);
  const [concluir, setConcluir] = useState<Atendimento | null>(null);
  const [editRealizado, setEditRealizado] = useState<Atendimento | null>(null);
  const [clienteInicial, setClienteInicial] = useState<string>();
  const { cliente: clienteBusca } = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    if (!clienteBusca) return;
    setClienteInicial(clienteBusca);
    setEditing(null);
    setFormOpen(true);
    // Limpa a URL para não reabrir o formulário ao recarregar.
    navigate({ search: {}, replace: true });
  }, [clienteBusca, navigate]);

  const comAgenda = new Set(semana.filter(ativo).map((a) => a.data));
  const ativosPorDia = new Map<string, number>();
  for (const a of semana.filter(ativo)) ativosPorDia.set(a.data, (ativosPorDia.get(a.data) ?? 0) + 1);
  const doDia = semana.filter((a) => a.data === dia);

  const inicioExp = horaHM(cfg?.hora_inicio) || "08:00";
  const fimExp = horaHM(cfg?.hora_fim) || "19:00";
  // Sugere o fim do último agendamento ativo do dia, se ainda couber no expediente.
  const ultimoFim = Math.max(
    ...doDia.filter((a) => ativo(a) && a.hora).map((a) => minutos(a.hora!) + a.duracao_min),
    minutos(inicioExp),
  );
  const horaSugerida = ultimoFim < minutos(fimExp) ? horaDeMinutos(ultimoFim) : inicioExp;

  const abrir = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  function confirmarWhatsapp(a: Atendimento) {
    const cliente = clientes.find((c) => c.id === a.cliente_id);
    const url = linkWhatsapp({
      telefone: cliente?.telefone,
      cliente: a.clientes?.nome ?? cliente?.nome ?? "",
      servico: a.servicos?.nome ?? "Serviço",
      data: a.data,
      hora: a.hora,
    });
    if (!url) return void toast.error("Cliente sem telefone válido");
    abrir(url);
  }

  function adicionarGoogleAgenda(a: Atendimento) {
    // Só observações do agendamento; nada da anamnese vai para o Google.
    const url = linkGoogleAgenda({
      servico: a.servicos?.nome ?? "Serviço",
      cliente: a.clientes?.nome ?? "—",
      data: a.data,
      hora: a.hora,
      duracaoMin: a.duracao_min,
      observacoes: a.observacoes,
    });
    if (!url) return void toast.error("Agendamento sem horário");
    abrir(url);
  }

  async function mudarStatus(a: Atendimento, status: Status, msg: string) {
    const patch: TablesUpdate<"atendimentos"> & { status: Status } = { status };
    const { error } = await supabase.from("atendimentos").update(patch).eq("id", a.id);
    if (error) return void toast.error("Não foi possível salvar.");
    setAcoes(null);
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
    toast.success(msg, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const volta: TablesUpdate<"atendimentos"> & { status: Status } = { status: a.status };
          const { error: e } = await supabase.from("atendimentos").update(volta).eq("id", a.id);
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
            <Button variant="ghost" className="h-12 w-10 shrink-0 px-0" aria-label="Mês anterior" onClick={() => setDia(`${somarDias(`${mes}-01`, -1).slice(0, 7)}-01`)}>
              <ChevronLeft className="size-6" />
            </Button>
            <h2 className="text-xl">{mesAno(mes)}</h2>
            <Button variant="ghost" className="h-12 w-10 shrink-0 px-0" aria-label="Próximo mês" onClick={() => setDia(proximoMes(mes))}>
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
                  aria-label={`${diaPorExtenso(d)}${d === hoje ? " (hoje)" : ""}, ${n} agendamento(s)`}
                  className={cn(
                    "flex h-16 flex-col items-center justify-start gap-1 rounded-xl pt-1.5 active:bg-muted",
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
            <Button variant="ghost" className="h-16 w-10 shrink-0 px-0" aria-label="Semana anterior" onClick={() => setDia(somarDias(dia, -7))}>
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
                      "flex h-16 flex-col items-center justify-center rounded-xl",
                      sel ? "bg-primary text-primary-foreground shadow-soft" : "active:bg-muted",
                      d === hoje && !sel && "bg-secondary font-semibold text-primary ring-1 ring-primary",
                    )}
                  >
                    <span className="text-[11px] uppercase tracking-wide">{diaSemanaCurto(d)}</span>
                    <span className="text-lg font-semibold leading-tight">{diaDoMes(d)}</span>
                    <span
                      className={cn(
                        "mt-0.5 size-1.5 rounded-full",
                        comAgenda.has(d) ? (sel ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" className="h-16 w-10 shrink-0 px-0" aria-label="Próxima semana" onClick={() => setDia(somarDias(dia, 7))}>
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
                <CalendarDays className="size-8 text-primary" />
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
                        "w-full rounded-2xl border border-l-4 bg-card px-4 py-3 text-left active:bg-muted",
                        STATUS[a.status].borda,
                        !ativo(a) && "opacity-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold tabular-nums">{intervalo(a)}</span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[a.status].badge)}>
                          {STATUS[a.status].label}
                        </span>
                      </div>
                      <div className={cn("mt-1 truncate text-lg font-semibold", !ativo(a) && "line-through")}>
                        {a.clientes?.nome ?? "—"}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {a.servicos?.nome ?? "Serviço"} · {brl(a.valor_bruto)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Drawer open={!!acoes} onOpenChange={(o) => !o && setAcoes(null)}>
        <DrawerContent>
          {acoes && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="font-display text-2xl">{acoes.clientes?.nome ?? "—"}</DrawerTitle>
                <DrawerDescription>
                  {diaPorExtenso(acoes.data)} · {intervalo(acoes)} · {acoes.servicos?.nome ?? "Serviço"} · {brl(acoes.valor_bruto)}
                </DrawerDescription>
              </DrawerHeader>
              <div className="space-y-3 px-4 pb-8">
                {acoes.status === "agendado" && <AvisoSaude cliente={clientes.find((c) => c.id === acoes.cliente_id)} />}
                {acoes.status === "agendado" && (
                  <>
                    <Button size="xl" onClick={() => { setConcluir(acoes); setAcoes(null); }}><Check /> Concluir</Button>
                    <Button size="xl" variant="secondary" onClick={() => { setEditing(acoes); setAcoes(null); setFormOpen(true); }}><Pencil /> Editar</Button>
                    <Button size="xl" variant="outline" onClick={() => confirmarWhatsapp(acoes)}><MessageCircle /> Confirmar por WhatsApp</Button>
                    <Button size="xl" variant="outline" onClick={() => adicionarGoogleAgenda(acoes)}><CalendarPlus /> Adicionar ao Google Agenda</Button>
                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" className="h-14 rounded-2xl text-base" onClick={() => mudarStatus(acoes, "faltou", "Marcado como falta")}><UserX /> Faltou</Button>
                      <Button variant="outline" className="h-14 rounded-2xl text-base text-destructive" onClick={() => mudarStatus(acoes, "cancelado", "Agendamento cancelado")}><Ban /> Cancelar</Button>
                    </div>
                  </>
                )}
                {(acoes.status === "cancelado" || acoes.status === "faltou") && (
                  <>
                    <Button size="xl" onClick={() => mudarStatus(acoes, "agendado", "Voltou para agendado")}><RotateCcw /> Voltar para agendado</Button>
                    <Button size="xl" variant="secondary" onClick={() => { setEditing(acoes); setAcoes(null); setFormOpen(true); }}><Pencil /> Editar</Button>
                  </>
                )}
                {acoes.status === "realizado" && (
                  <Button size="xl" variant="secondary" onClick={() => { setEditRealizado(acoes); setAcoes(null); }}><Pencil /> Editar atendimento</Button>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <AgendaForm open={formOpen} onOpenChange={setFormOpen} editing={editing} dia={dia} horaSugerida={horaSugerida} clienteInicial={clienteInicial} />
      <ConcluirForm atendimento={concluir} onClose={() => setConcluir(null)} />
      <AtendimentoForm open={!!editRealizado} onOpenChange={(o) => !o && setEditRealizado(null)} editing={editRealizado} />
    </>
  );
}

function ConcluirForm({ atendimento, onClose }: { atendimento: Atendimento | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<Forma | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!atendimento) return;
    setValor(String(atendimento.valor_bruto));
    setForma("");
  }, [atendimento]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!atendimento) return;
    const v = Number(valor.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return void toast.error("Valor inválido.");
    if (!forma) return void toast.error("Escolha a forma de pagamento.");
    setSaving(true);
    const patch: TablesUpdate<"atendimentos"> & { status: Status } = {
      status: "realizado", valor_bruto: v, forma_pagamento: forma,
    };
    const { error } = await supabase.from("atendimentos").update(patch).eq("id", atendimento.id);
    setSaving(false);
    if (error) return void toast.error("Não foi possível concluir.");
    // Atualiza Atendimentos, ficha da cliente, Acerto e a própria agenda.
    qc.invalidateQueries({ queryKey: ["atendimentos"] });
    toast.success("Atendimento concluído");
    onClose();
  }

  return (
    <Drawer open={!!atendimento} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl">Concluir atendimento</DrawerTitle>
          <DrawerDescription>
            {atendimento?.clientes?.nome ?? "—"} · {atendimento?.servicos?.nome ?? "Serviço"}
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={salvar} className="space-y-4 px-4 pb-8">
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input className="h-12 text-base" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
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
          <Button type="submit" size="xl" disabled={saving}>{saving ? "Salvando..." : "Concluir"}</Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
