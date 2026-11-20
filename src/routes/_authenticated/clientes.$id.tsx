import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarPlus, Lock, MessageCircle, Phone, Plus, Repeat, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty } from "@/components/app/ui-bits";
import { ClienteForm } from "@/components/app/ClienteForm";
import { AtendimentoList } from "@/components/app/AtendimentoList";
import { AtendimentoForm } from "@/components/app/AtendimentoForm";
import {
  alterarRetornoCliente, excluirCliente, useAtendimentos, useBloqueiosNasDatas, useClientes, useMembrosSeries,
  useOcupadosNasDatas, useProximosDaCliente, type Atendimento, type Cliente,
} from "@/lib/data";
import { bloqueioQueImpede, horarioDoBloqueio, tituloBloqueio } from "@/lib/bloqueios";
import { conflitosDasDatas, intervaloValido, planoReorganizacao, posicaoNaSerie, type Mudanca } from "@/lib/recorrencia";
import { mensagemErro } from "@/lib/erros";
import { plural } from "@/lib/texto";
import { brl, dataBR, diaPorExtenso, diaSemanaCurto, hojeISO, horaDeMinutos, horaHM, minutos } from "@/lib/format";
import { formatarTelefone, linkWhatsappTexto, normalizarTelefone } from "@/lib/links";
import { nomesItens } from "@/lib/itens";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  head: () => ({
    meta: [
      { title: "Ficha da cliente — Lunula" },
      { name: "description", content: "Anamnese e histórico de atendimentos da cliente." },
      { property: "og:title", content: "Ficha da cliente — Lunula" },
      { property: "og:description", content: "Anamnese e histórico de atendimentos da cliente." },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { data: clientes, isLoading } = useClientes();
  const { data: hist = [] } = useAtendimentos(id);
  const hoje = hojeISO();
  const { data: proximos = [] } = useProximosDaCliente(id, hoje);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Atendimento | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const c = clientes?.find((x) => x.id === id);
  const { data: series } = useMembrosSeries(proximos.flatMap((a) => (a.serie_id ? [a.serie_id] : [])));

  if (isLoading) return <Empty>Carregando...</Empty>;
  if (!c) return <Empty>Cliente não encontrada.</Empty>;

  const total = hist.reduce((s, a) => s + Number(a.valor_bruto), 0);
  const tel = normalizarTelefone(c.telefone);
  const whatsapp = linkWhatsappTexto(c.telefone);
  const { id: _i, user_id: _u, created_at: _c, retorno_dias: _r, ...initial } = c;

  // Apaga a ficha e tudo o que é dela (função excluir_cliente, SQL 0007).
  async function excluir() {
    setExcluindo(true);
    try {
      await excluirCliente(id);
    } catch (err) {
      setExcluindo(false);
      return void toast.error(mensagemErro(err, "Não foi possível excluir a ficha."));
    }
    toast.success(`Ficha de ${c!.nome} excluída`);
    await navigate({ to: "/clientes" });
    void qc.invalidateQueries();
  }

  return (
    <>
      <header className="bg-rose-gradient px-5 pb-5 pt-5">
        <div className="flex items-center justify-between">
          <Link
            to="/clientes"
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden /> Clientes
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="-mr-2 size-11 px-0 text-muted-foreground"
            aria-label="Excluir ficha"
            title="Excluir ficha"
            onClick={() => setConfirmDel(true)}
          >
            <Trash2 className="size-5" aria-hidden />
          </Button>
        </div>
        <h1 className="mt-1 text-3xl">{c.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {plural(hist.length, "atendimento", "atendimentos")} · {brl(total)}
          {c.consentimento_data && ` · consentimento em ${dataBR(c.consentimento_data)}`}
        </p>
        <p className="mt-3 text-base tabular-nums">{c.telefone ? formatarTelefone(c.telefone) : <span className="text-muted-foreground">Sem telefone</span>}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-12 rounded-xl bg-card text-base"
            disabled={!whatsapp}
            onClick={() => whatsapp && window.open(whatsapp, "_blank", "noopener,noreferrer")}
          >
            <MessageCircle /> WhatsApp
          </Button>
          {tel ? (
            <Button asChild variant="outline" className="h-12 rounded-xl bg-card text-base">
              <a href={`tel:+${tel}`}><Phone /> Ligar</a>
            </Button>
          ) : (
            <Button variant="outline" className="h-12 rounded-xl bg-card text-base" disabled><Phone /> Ligar</Button>
          )}
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate({ to: "/agenda", search: { cliente: id } })}>
            <CalendarPlus /> Agendar
          </Button>
        </div>
        <RetornoDaCliente cliente={c} proximos={proximos} hoje={hoje} />
      </header>
      <Tabs defaultValue="historico" className="px-5 pt-4">
        <TabsList className="grid h-14 w-full grid-cols-2 rounded-2xl p-1.5">
          <TabsTrigger value="historico" className="h-11 rounded-xl text-base">Histórico</TabsTrigger>
          <TabsTrigger value="ficha" className="h-11 rounded-xl text-base">Ficha</TabsTrigger>
        </TabsList>
        <TabsContent value="historico" className="-mx-5 mt-4 space-y-4">
          <div className="px-5">
            <Button size="xl" onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Novo atendimento</Button>
          </div>
          {proximos.length > 0 && (
            <section className="space-y-2 px-5">
              <h2 className="text-xl">Próximos</h2>
              <ul className="divide-y overflow-hidden rounded-2xl border border-l-4 border-l-sky-400 bg-card">
                {proximos.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/agenda"
                      search={{ dia: a.data }}
                      className="flex items-start justify-between gap-3 px-4 py-3 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">{diaPorExtenso(a.data)}</div>
                        <div className="line-clamp-2 text-sm text-muted-foreground">
                          {a.hora ? `${horaHM(a.hora)}–${horaDeMinutos(minutos(a.hora) + a.duracao_min)} · ` : ""}
                          {nomesItens(a.itens)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold tabular-nums">{brl(a.valor_bruto)}</div>
                        {(() => {
                          const pos = a.serie_id ? posicaoNaSerie(a.id, series?.get(a.serie_id) ?? []) : null;
                          return pos ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                              <Repeat className="size-3" aria-hidden /><span className="sr-only">Série, </span>{pos.n} de {pos.m}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {hist.length === 0 ? <Empty>Nenhum atendimento ainda.</Empty> : (
            <AtendimentoList itens={hist} mostrarCliente={false} onSelect={(a) => { setEditing(a); setOpen(true); }} />
          )}
        </TabsContent>
        <TabsContent value="ficha" className="mt-4 space-y-4 pb-6">
          <ClienteForm
            key={c.id}
            initial={initial}
            submitLabel="Salvar ficha"
            onSubmit={async (v) => {
              const { error } = await supabase.from("clientes").update(v).eq("id", id);
              if (error) throw error;
              await qc.invalidateQueries({ queryKey: ["clientes"] });
              toast.success("Ficha atualizada");
            }}
          />
          <Button variant="ghost" className="h-12 w-full text-destructive" onClick={() => setConfirmDel(true)}>
            <Trash2 aria-hidden /> Excluir ficha
          </Button>
        </TabsContent>
      </Tabs>
      <AtendimentoForm open={open} onOpenChange={setOpen} editing={editing} clienteFixo={id} />
      <AlertDialog open={confirmDel} onOpenChange={(o) => !excluindo && setConfirmDel(o)}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Excluir a ficha de {c.nome}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>Apaga para sempre a ficha (contato e anamnese) e tudo o que está na agenda dela:</p>
                {proximos.length === 0 && hist.length === 0 ? (
                  <p>Ela não tem atendimentos nem agendamentos futuros.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5">
                    {proximos.length > 0 && <li>{plural(proximos.length, "agendamento futuro", "agendamentos futuros")}</li>}
                    {hist.length > 0 && (
                      <li>
                        <b className="text-foreground">
                          {plural(hist.length, "atendimento realizado", "atendimentos realizados")} ({brl(total)})
                        </b>
                        : saem do Acerto e das Estatísticas dos meses em que aconteceram
                      </li>
                    )}
                    <li>faltas e cancelamentos registrados</li>
                  </ul>
                )}
                <p className="font-medium text-foreground">Não dá para desfazer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 h-11" disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluindo}
              onClick={(e) => { e.preventDefault(); void excluir(); }}
            >
              {excluindo ? "Excluindo…" : "Excluir ficha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * "Retorno a cada X dias" com edição rápida (1–365 ou sem intervalo). Se a cliente tem séries
 * agendadas, mudar o intervalo mostra as novas datas e oferece reorganizar os próximos.
 */
function RetornoDaCliente({ cliente, proximos, hoje }: { cliente: Cliente; proximos: Atendimento[]; hoje: string }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [plano, setPlano] = useState<{ dias: number; mudancas: Mudanca<Atendimento>[] } | null>(null);
  const temSerie = proximos.some((a) => a.serie_id);

  const fechar = () => { setPlano(null); setEditando(false); };

  // Só o intervalo (sem mexer na agenda): "Tirar o intervalo", "Só salvar o intervalo" ou sem série.
  async function salvarIntervalo(valor: number | null) {
    setSalvando(true);
    const { error } = await supabase.from("clientes").update({ retorno_dias: valor }).eq("id", cliente.id);
    setSalvando(false);
    if (error) return void toast.error(mensagemErro(error, "Não foi possível salvar."));
    await qc.invalidateQueries({ queryKey: ["clientes"] });
    toast.success(valor ? `Retorno a cada ${valor} dias` : "Sem intervalo de retorno");
    fechar();
  }

  async function reorganizar(dias: number) {
    setSalvando(true);
    try {
      const n = await alterarRetornoCliente({ clienteId: cliente.id, dias, reorganizar: true, hoje });
      await qc.invalidateQueries();
      toast.success(`Retorno a cada ${dias} dias · ${plural(n, "agendamento reorganizado", "agendamentos reorganizados")}`);
      fechar();
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível reorganizar os agendamentos."));
    } finally {
      setSalvando(false);
    }
  }

  function enviar(dias: number) {
    const mudancas = planoReorganizacao(proximos, dias, hoje);
    if (mudancas.length > 0) setPlano({ dias, mudancas });
    else if (dias !== cliente.retorno_dias) void salvarIntervalo(dias);
    else fechar();
  }

  if (!editando) {
    return (
      <div className="mt-3 flex min-h-12 items-center gap-2 rounded-xl bg-card/70 pl-3 text-[15px]">
        <Repeat className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1">
          {cliente.retorno_dias ? <>Retorno a cada <b className="tabular-nums">{cliente.retorno_dias} dias</b></> : <span className="text-muted-foreground">Sem intervalo de retorno</span>}
        </span>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-3 font-semibold text-primary"
          onClick={() => { setTexto(String(cliente.retorno_dias ?? "")); setEditando(true); }}
        >
          {cliente.retorno_dias ? "Alterar" : "Definir"}
        </Button>
      </div>
    );
  }

  const n = intervaloValido(Number(texto));
  return (
    <>
      <form
        className="mt-3 space-y-2 rounded-xl bg-card/80 p-3"
        onSubmit={(e) => { e.preventDefault(); if (n) enviar(n); else toast.error("Use de 1 a 365 dias."); }}
      >
        <label htmlFor="retorno-dias" className="text-sm font-medium">Retorno a cada (dias)</label>
        <div className="flex gap-2">
          <Input
            id="retorno-dias"
            autoFocus
            className="h-12 w-24 text-base tabular-nums"
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-describedby={temSerie ? "retorno-dica" : undefined}
          />
          <Button type="submit" className="h-12 flex-1 rounded-xl" disabled={salvando}>Salvar</Button>
          <Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={fechar}>Voltar</Button>
        </div>
        {temSerie && (
          <p id="retorno-dica" className="text-xs text-muted-foreground">
            Ao salvar, você vê as novas datas e escolhe se reorganiza os próximos agendamentos.
          </p>
        )}
        {cliente.retorno_dias && (
          <Button type="button" variant="ghost" className="h-11 w-full text-muted-foreground" disabled={salvando} onClick={() => void salvarIntervalo(null)}>
            Tirar o intervalo
          </Button>
        )}
      </form>
      {plano && (
        <ReorganizarDialog
          nome={cliente.nome}
          dias={plano.dias}
          mudancas={plano.mudancas}
          salvando={salvando}
          onReorganizar={() => void reorganizar(plano.dias)}
          onSoSalvar={() => void salvarIntervalo(plano.dias)}
          onCancelar={() => setPlano(null)}
        />
      )}
    </>
  );
}

/**
 * Confirmação com as datas de antes → depois e aviso de horário ocupado. Se alguma data nova cai
 * num bloqueio, o banco recusaria a reorganização inteira: o botão fica desligado e explica.
 */
function ReorganizarDialog({
  nome, dias, mudancas, salvando, onReorganizar, onSoSalvar, onCancelar,
}: {
  nome: string;
  dias: number;
  mudancas: Mudanca<Atendimento>[];
  salvando: boolean;
  onReorganizar: () => void;
  onSoSalvar: () => void;
  onCancelar: () => void;
}) {
  const { data: ocupados = [], isFetching } = useOcupadosNasDatas(mudancas.map((m) => m.para));
  const { data: bloqueios = [], isFetching: buscandoBloqueios } = useBloqueiosNasDatas(mudancas.map((m) => m.para));
  const ids = mudancas.map((m) => m.item.id);
  const ocupado = (m: Mudanca<Atendimento>) =>
    conflitosDasDatas([m.para], m.item.hora ?? "", m.item.duracao_min, ocupados, ids).get(m.para);
  // Mesma regra do banco: só a data muda (hora e duração ficam).
  const bloqueado = (m: Mudanca<Atendimento>) =>
    bloqueioQueImpede(
      bloqueios,
      { data: m.para, hora: m.item.hora, duracao: m.item.duracao_min },
      { data: m.de, hora: m.item.hora, duracao: m.item.duracao_min },
    );
  const conflitos = mudancas.filter((m) => ocupado(m)).length;
  const bloqueadas = mudancas.filter((m) => bloqueado(m)).length;
  const conferindo = isFetching || buscandoBloqueios;
  const primeiroNome = nome.split(" ")[0];

  return (
    <AlertDialog open onOpenChange={(o) => !o && !salvando && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Reorganizar os próximos agendamentos?</AlertDialogTitle>
          <AlertDialogDescription>
            Com retorno a cada {dias} dias, {plural(mudancas.length, "agendamento", "agendamentos")} de {primeiroNome}{" "}
            {mudancas.length === 1 ? "muda" : "mudam"} de data. O próximo de cada série continua no mesmo dia e horário.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-muted p-3 text-sm tabular-nums" aria-label="Datas que mudam">
          {mudancas.map((m) => {
            const o = ocupado(m);
            const b = bloqueado(m);
            return (
              <li key={m.item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="whitespace-nowrap text-muted-foreground line-through"><span className="sr-only">de </span>{dataBR(m.de).slice(0, 5)}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="whitespace-nowrap font-semibold"><span className="sr-only">para </span>{diaSemanaCurto(m.para)}, {dataBR(m.para).slice(0, 5)}</span>
                {b && (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-foreground ring-1 ring-border">
                    <Lock className="size-3" aria-hidden /> bloqueado · {horarioDoBloqueio(b)} · {tituloBloqueio(b)}
                  </span>
                )}
                {o && !b && (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-500">
                    <AlertTriangle className="size-3" aria-hidden /> ocupado · {o.cliente.split(" ")[0]} {horaHM(o.hora ?? "")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p role="status" className={bloqueadas > 0 ? "text-sm font-medium text-foreground" : conflitos > 0 ? "text-sm text-amber-900" : "text-sm text-muted-foreground"}>
          {conferindo
            ? "Conferindo horários…"
            : bloqueadas > 0
              ? `${plural(bloqueadas, "data nova cai", "datas novas caem")} num horário bloqueado, então não dá para reorganizar assim. Mude o bloqueio na Agenda ou só salve o intervalo.`
              : conflitos > 0
                ? `${plural(conflitos, "data cai", "datas caem")} em horário já ocupado. Dá para reorganizar mesmo assim e ajustar depois na Agenda.`
                : "Nenhum horário ocupado nas novas datas."}
        </p>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="mt-0 h-11" disabled={salvando}>Cancelar</AlertDialogCancel>
          <Button type="button" variant="outline" className="h-11" disabled={salvando} onClick={onSoSalvar}>
            Só salvar o intervalo
          </Button>
          <AlertDialogAction
            className="h-11"
            disabled={salvando || conferindo || bloqueadas > 0}
            onClick={(e) => { e.preventDefault(); onReorganizar(); }}
          >
            {salvando ? "Salvando…" : "Reorganizar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
