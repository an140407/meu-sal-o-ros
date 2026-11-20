import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Lock, Minus, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MiniCalendario } from "./MiniCalendario";
import { atualizarBloqueios, criarBloqueios, useOcupadosNasDatas, useSerieDeBloqueios } from "@/lib/data";
import {
  FREQUENCIAS, MAX_BLOQUEIOS, MAX_DESCRICAO, SEMANA_INICIAIS, SEMANA_NOMES, cobre, descreverRepeticao, diaInteiro,
  erroHoras, gerarRepeticao, textoMensal, type Bloqueio, type Repeticao,
} from "@/lib/bloqueios";
import { dataBR, diaDaSemana, diaSemanaCurto, hojeISO, horaDeMinutos, horaHM, minutos, somarDias } from "@/lib/format";
import { mensagemErro } from "@/lib/erros";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";

type Modo = "um" | "varios" | "repetir";
const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "um", rotulo: "Um dia" },
  { valor: "varios", rotulo: "Vários dias" },
  { valor: "repetir", rotulo: "Repetir" },
];

const ddmm = (iso: string) => dataBR(iso).slice(0, 5);
const diaCurto = (iso: string) => `${diaSemanaCurto(iso)}, ${ddmm(iso)}`;
/** Fim padrão: `duracao` minutos depois do início (até 23:59). */
const depoisDe = (h: string, duracao = 60) => (h ? horaDeMinutos(minutos(h) + duracao) : "");

const repeticaoPadrao = (inicio: string): Repeticao => ({
  inicio, frequencia: "semanal", diasSemana: [diaDaSemana(inicio)], cadaSemanas: 1, mensal: "dia", cadaDias: 2,
  termina: "vezes", vezes: 4, ate: somarDias(inicio, 28),
});

const estiloOpcao = (ativa: boolean) =>
  cn(
    "min-h-11 rounded-full border px-4 text-base transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    ativa ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card",
  );

function Opcao({ ativa, onClick, children, className }: { ativa: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" role="radio" aria-checked={ativa} onClick={onClick} className={cn(estiloOpcao(ativa), className)}>
      {children}
    </button>
  );
}

/** [−] número [+], com o número editável. */
function Contador({
  id, rotulo, dica, valor, min, max, onChange, menos, mais,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  valor: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  menos: string;
  mais: string;
}) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const mudar = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  const botao = "flex size-11 items-center justify-center rounded-xl border bg-card transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{rotulo}</label>
        {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => mudar(valor - 1)} disabled={valor <= min} className={botao} aria-label={menos}>
          <Minus className="size-5" />
        </button>
        <Input
          id={id}
          className="h-11 w-14 px-1 text-center text-lg font-semibold tabular-nums"
          inputMode="numeric"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= min) mudar(n);
          }}
          onBlur={() => setTexto(String(valor))}
        />
        <button type="button" onClick={() => mudar(valor + 1)} disabled={valor >= max} className={botao} aria-label={mais}>
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Formulário de bloqueio de horário: um dia, vários dias (escolhidos no calendário) ou repetição
 * (todo dia, seg a sex, semanal em dias escolhidos, mensal, a cada X dias; termina depois de N vezes
 * ou numa data). O dia inteiro ou das tantas às tantas. Agendamentos que já estão no horário
 * continuam marcados: o formulário avisa quais são. Ao editar um bloqueio de série, dá para mudar
 * só este ou este e os próximos (horário e descrição; a data de cada um não muda).
 */
export function BloqueioForm({
  dia, horaSugerida, editing, onPronto,
}: {
  /** Dia aberto na agenda: primeira data sugerida. */
  dia: string;
  horaSugerida: string;
  editing: Bloqueio | null;
  onPronto: () => void;
}) {
  const id = useId();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const inicio = editing ? editing.data : dia < hoje ? hoje : dia;
  const horaPadrao = (editing && !diaInteiro(editing) ? horaHM(editing.hora_inicio) : horaHM(horaSugerida)) || "09:00";

  const [modo, setModo] = useState<Modo>("um");
  const [data, setData] = useState(inicio);
  const [dias, setDias] = useState<Set<string>>(() => new Set([inicio]));
  const [mesVarios, setMesVarios] = useState(inicio.slice(0, 7));
  const [rep, setRep] = useState<Repeticao>(() => repeticaoPadrao(inicio));
  const [puladas, setPuladas] = useState<Set<string>>(new Set());
  const [mesRep, setMesRep] = useState(inicio.slice(0, 7));
  const [textoCada, setTextoCada] = useState("2");
  const [diaTodo, setDiaTodo] = useState(editing ? diaInteiro(editing) : false);
  const [horaIni, setHoraIni] = useState(horaPadrao);
  const [horaFim, setHoraFim] = useState(editing && !diaInteiro(editing) ? horaHM(editing.hora_fim) : depoisDe(horaPadrao));
  const [descricao, setDescricao] = useState(editing?.descricao ?? "");
  const [modoSerie, setModoSerie] = useState<"este" | "proximos">("este");
  const [salvando, setSalvando] = useState(false);

  // Série do bloqueio em edição (para "Este e os próximos").
  const { data: serie = [] } = useSerieDeBloqueios(editing?.serie_id);
  const proximos = editing ? serie.filter((b) => b.data > editing.data) : [];
  const emSerie = !!editing?.serie_id && proximos.length > 0;
  const paraProximos = emSerie && modoSerie === "proximos";

  const gerado = useMemo(() => gerarRepeticao(rep), [rep]);
  const naRepeticao = useMemo(() => new Set(gerado.datas), [gerado]);
  const datasRep = gerado.datas.filter((d) => !puladas.has(d));

  const datas = editing
    ? paraProximos ? [editing.data, ...proximos.map((b) => b.data)] : [data]
    : modo === "um" ? [data] : modo === "varios" ? [...dias].sort() : datasRep;

  // Agendamentos que já estão dentro do horário bloqueado (ficam marcados; só avisa).
  const msgHoras = erroHoras(diaTodo, horaIni, horaFim);
  const faixa = { hora_inicio: diaTodo ? null : horaIni, hora_fim: diaTodo ? null : horaFim };
  const { data: ocupados = [] } = useOcupadosNasDatas(datas.filter(Boolean), datas.length > 0);
  const dentro = msgHoras
    ? []
    : ocupados
        .filter((o) => o.status === "agendado" && datas.includes(o.data) && cobre({ data: o.data, ...faixa }, { data: o.data, hora: o.hora, duracao: o.duracao_min }))
        .sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""));
  const comAgendamento = new Set(dentro.map((o) => o.data));

  const mudarRep = (o: Partial<Repeticao>) => {
    setRep((r) => ({ ...r, ...o }));
    setPuladas(new Set());
  };
  function mudarInicioRep(novo: string) {
    if (!novo) return;
    // "Toda semana" no dia do início acompanha o novo dia; vários dias escolhidos ficam.
    const mesmoDia = rep.diasSemana.length === 1 && rep.diasSemana[0] === diaDaSemana(rep.inicio);
    mudarRep({
      inicio: novo,
      ...(mesmoDia ? { diasSemana: [diaDaSemana(novo)] } : {}),
      ...(rep.ate < novo ? { ate: somarDias(novo, 28) } : {}),
    });
    setMesRep(novo.slice(0, 7));
  }
  function alternarDiaSemana(i: number) {
    const s = new Set(rep.diasSemana);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    mudarRep({ diasSemana: [...s].sort((a, b) => a - b) });
  }
  function alternarVarios(d: string) {
    const s = new Set(dias);
    if (s.has(d)) s.delete(d);
    else if (s.size >= MAX_BLOQUEIOS) return void toast.error(`Até ${MAX_BLOQUEIOS} dias de uma vez.`);
    else s.add(d);
    setDias(s);
  }
  function alternarPulada(d: string) {
    if (!naRepeticao.has(d)) return;
    const s = new Set(puladas);
    if (s.has(d)) s.delete(d);
    else s.add(d);
    setPuladas(s);
  }
  // Mudar o início leva o fim junto (mantém a duração), como no Google Agenda.
  function mudarHoraIni(h: string) {
    const dur = horaIni && horaFim ? minutos(horaFim) - minutos(horaIni) : 60;
    setHoraIni(h);
    if (h) setHoraFim(depoisDe(h, dur > 0 ? dur : 60));
  }

  function erro(): string | null {
    if (editing) {
      if (!paraProximos && !data) return "Informe a data.";
    } else {
      if (modo === "um" && !data) return "Informe a data.";
      if (datas.length === 0) {
        return modo === "varios" ? "Toque nos dias que quer bloquear." : "Essa repetição não tem nenhuma data. Confira os dias e o fim.";
      }
      if (datas.some((d) => d < hoje)) return "Escolha datas de hoje em diante.";
      if (datas.length > MAX_BLOQUEIOS) return `Até ${MAX_BLOQUEIOS} dias de uma vez.`;
    }
    return msgHoras;
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const msg = erro();
    if (msg) return void toast.error(msg);
    setSalvando(true);
    const campos = { ...faixa, descricao: descricao.trim() || null };
    const quando = diaTodo ? "dia inteiro" : `${horaIni}–${horaFim}`;
    try {
      if (editing) {
        const n = await atualizarBloqueios(
          paraProximos ? { serieId: editing.serie_id!, aPartirDe: editing.data } : { id: editing.id },
          paraProximos ? campos : { ...campos, data },
        );
        toast.success(n > 1 ? `${plural(n, "bloqueio atualizado", "bloqueios atualizados")} · ${quando}` : `Bloqueio atualizado · ${diaCurto(data)} · ${quando}`);
      } else {
        const n = await criarBloqueios({ datas, ...campos });
        toast.success(n > 1 ? `${n} dias bloqueados · ${quando}` : `Bloqueado · ${diaCurto(datas[0]!)} · ${quando}`);
      }
      if (dentro.length > 0) {
        toast.warning(`${plural(dentro.length, "agendamento ficou", "agendamentos ficaram")} dentro do bloqueio. Remarque se precisar.`);
      }
      qc.invalidateQueries({ queryKey: ["bloqueios"] });
      onPronto();
    } catch (err) {
      console.error(err);
      toast.error(mensagemErro(err, "Não foi possível salvar o bloqueio."));
    } finally {
      setSalvando(false);
    }
  }

  const n = datas.length;
  const rotuloBotao = salvando
    ? "Salvando..."
    : editing
      ? paraProximos ? `Salvar ${n} bloqueios` : "Salvar"
      : n > 1 ? `Bloquear ${n} dias` : "Bloquear";
  const listaVarios = [...dias].sort();
  const puladasRep = gerado.datas.length - datasRep.length;

  return (
    <form onSubmit={salvar} className="space-y-4">
      {!editing && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Como bloquear">
          {MODOS.map((m) => (
            <Opcao key={m.valor} ativa={modo === m.valor} onClick={() => setModo(m.valor)} className="px-2">
              {m.rotulo}
            </Opcao>
          ))}
        </div>
      )}

      {emSerie && (
        <section className="space-y-3 rounded-2xl border bg-card p-3.5" aria-labelledby={`${id}-serie`}>
          <p id={`${id}-serie`} className="flex items-center gap-2 font-semibold">
            <Repeat className="size-5 text-primary" aria-hidden /> Série · {plural(proximos.length, "próximo bloqueio", "próximos bloqueios")}
          </p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={`${id}-serie`}>
            {(["este", "proximos"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={modoSerie === v}
                onClick={() => setModoSerie(v)}
                className={cn(
                  "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  modoSerie === v ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                <span className="font-semibold">{v === "este" ? "Só este" : "Este e os próximos"}</span>
                <span className={cn("text-xs", modoSerie === v ? "text-primary-foreground/85" : "text-muted-foreground")}>
                  {v === "este" ? "os próximos ficam como estão" : `+ ${plural(proximos.length, "bloqueio", "bloqueios")}`}
                </span>
              </button>
            ))}
          </div>
          {paraProximos && (
            <p className="text-sm text-muted-foreground">Horário e descrição mudam em todos; a data de cada um continua a mesma.</p>
          )}
        </section>
      )}

      {(editing || modo === "um") && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-data`}>Data</Label>
          <Input
            id={`${id}-data`}
            className="h-12 text-base"
            type="date"
            required={!paraProximos}
            disabled={paraProximos}
            min={editing ? undefined : hoje}
            value={paraProximos && editing ? editing.data : data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
      )}

      {!editing && modo === "varios" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Toque nos dias para marcar ou desmarcar.</p>
          <MiniCalendario
            mes={mesVarios}
            onMes={setMesVarios}
            hoje={hoje}
            rotulo="Dias para bloquear"
            estado={(d) => ({
              marcado: dias.has(d),
              inativo: d < hoje,
              aviso: comAgendamento.has(d),
              rotulo: d < hoje ? "" : dias.has(d) ? "toque para desmarcar" : "toque para marcar",
            })}
            onTocar={alternarVarios}
          />
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Dias marcados">
            {listaVarios.slice(0, 6).map((d) => (
              <span key={d} className="rounded-full bg-secondary px-2.5 py-1 text-[13px] font-semibold text-secondary-foreground tabular-nums">
                {diaCurto(d)}
              </span>
            ))}
            {listaVarios.length > 6 && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-[13px] font-semibold text-muted-foreground">+{listaVarios.length - 6}</span>
            )}
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span role="status" className="text-sm text-muted-foreground tabular-nums">
              {listaVarios.length === 0 ? "Nenhum dia marcado" : plural(listaVarios.length, "dia marcado", "dias marcados")}
            </span>
            {listaVarios.length > 0 && (
              <Button type="button" variant="ghost" className="h-11 px-3 text-muted-foreground" onClick={() => setDias(new Set())}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      )}

      {!editing && modo === "repetir" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-inicio`}>Começa em</Label>
            <Input id={`${id}-inicio`} className="h-12 text-base" type="date" min={hoje} value={rep.inicio} onChange={(e) => mudarInicioRep(e.target.value)} />
          </div>

          <div className="space-y-2">
            <span id={`${id}-freq`} className="text-sm font-medium">Repete</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-freq`}>
              {FREQUENCIAS.map((f) => (
                <Opcao key={f.valor} ativa={rep.frequencia === f.valor} onClick={() => mudarRep({ frequencia: f.valor })}>
                  {f.rotulo}
                </Opcao>
              ))}
            </div>
          </div>

          {rep.frequencia === "semanal" && (
            <>
              <div className="space-y-2">
                <span id={`${id}-dias`} className="text-sm font-medium">Nos dias</span>
                <div className="grid grid-cols-7 gap-1.5" role="group" aria-labelledby={`${id}-dias`}>
                  {SEMANA_INICIAIS.map((l, i) => {
                    const on = rep.diasSemana.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        aria-label={SEMANA_NOMES[i]}
                        onClick={() => alternarDiaSemana(i)}
                        className={cn(
                          "h-11 rounded-full border text-base font-semibold transition-transform duration-150 ease-out active:scale-[0.95] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                        )}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Contador
                id={`${id}-semanas`}
                rotulo="A cada"
                dica={rep.cadaSemanas === 1 ? "semana" : "semanas"}
                valor={rep.cadaSemanas}
                min={1}
                max={8}
                onChange={(v) => mudarRep({ cadaSemanas: v })}
                menos="Menos uma semana"
                mais="Mais uma semana"
              />
            </>
          )}

          {rep.frequencia === "mensal" && (
            <div className="grid gap-2" role="radiogroup" aria-label="Em que dia de cada mês">
              {(["dia", "semana"] as const).map((m) => (
                <Opcao key={m} ativa={rep.mensal === m} onClick={() => mudarRep({ mensal: m })} className="rounded-xl text-left">
                  {textoMensal(rep.inicio, m)}
                </Opcao>
              ))}
            </div>
          )}

          {rep.frequencia === "intervalo" && (
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-cada`} className="text-sm font-medium">A cada</label>
              <Input
                id={`${id}-cada`}
                className="h-12 w-20 text-base tabular-nums"
                inputMode="numeric"
                value={textoCada}
                onChange={(e) => {
                  setTextoCada(e.target.value);
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 1 && v <= 365) mudarRep({ cadaDias: v });
                }}
                onBlur={() => setTextoCada(String(rep.cadaDias))}
              />
              <span className="text-sm text-muted-foreground">dias (1 a 365)</span>
            </div>
          )}

          <div className="space-y-2">
            <span id={`${id}-fim-rep`} className="text-sm font-medium">Termina</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={`${id}-fim-rep`}>
              <Opcao ativa={rep.termina === "vezes"} onClick={() => mudarRep({ termina: "vezes" })} className="px-2">Depois de X vezes</Opcao>
              <Opcao ativa={rep.termina === "data"} onClick={() => mudarRep({ termina: "data" })} className="px-2">Numa data</Opcao>
            </div>
            {rep.termina === "vezes" ? (
              <Contador
                id={`${id}-vezes`}
                rotulo="Quantas vezes"
                dica={`até ${MAX_BLOQUEIOS}`}
                valor={Math.min(MAX_BLOQUEIOS, Math.max(1, rep.vezes))}
                min={1}
                max={MAX_BLOQUEIOS}
                onChange={(v) => mudarRep({ vezes: v })}
                menos="Menos uma vez"
                mais="Mais uma vez"
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`${id}-ate`}>Até (inclusive)</Label>
                <Input id={`${id}-ate`} className="h-12 text-base" type="date" min={rep.inicio} value={rep.ate} onChange={(e) => mudarRep({ ate: e.target.value })} />
              </div>
            )}
          </div>

          <MiniCalendario
            mes={mesRep}
            onMes={setMesRep}
            hoje={hoje}
            rotulo="Datas do bloqueio"
            estado={(d) => {
              const na = naRepeticao.has(d);
              return {
                marcado: na,
                pulado: na && puladas.has(d),
                inativo: !na,
                aviso: na && comAgendamento.has(d),
                rotulo: na ? (puladas.has(d) ? "toque para incluir" : "toque para pular") : "",
              };
            }}
            onTocar={alternarPulada}
          />
          <p role="status" className="text-sm text-muted-foreground tabular-nums">
            {descreverRepeticao(rep)} · {plural(datasRep.length, "bloqueio", "bloqueios")}
            {datasRep.length > 0 ? ` · ${ddmm(datasRep[0]!)} a ${dataBR(datasRep[datasRep.length - 1]!)}` : ""}
            {puladasRep > 0 ? ` · ${plural(puladasRep, "pulado", "pulados")}` : ""}
          </p>
          {gerado.cortado && (
            <p className="text-sm text-amber-900">
              Até {MAX_BLOQUEIOS} de uma vez: vai até {dataBR(gerado.datas[gerado.datas.length - 1]!)}. Depois, crie outro bloqueio.
            </p>
          )}
        </div>
      )}

      <section className="space-y-3 rounded-2xl border bg-card p-3.5">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor={`${id}-dia-todo`} className="font-semibold">Dia inteiro</label>
          <Switch id={`${id}-dia-todo`} checked={diaTodo} onCheckedChange={setDiaTodo} />
        </div>
        {!diaTodo && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${id}-ini`}>Início</Label>
              <Input id={`${id}-ini`} className="h-12 text-base" type="time" step={60} required value={horaIni} onChange={(e) => mudarHoraIni(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-fim`}>Fim</Label>
              <Input
                id={`${id}-fim`}
                className="h-12 text-base"
                type="time"
                step={60}
                required
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
                aria-invalid={!!msgHoras}
                aria-describedby={msgHoras ? `${id}-erro-horas` : undefined}
              />
            </div>
          </div>
        )}
        {msgHoras && (
          <p id={`${id}-erro-horas`} role="alert" className="text-sm font-medium text-destructive">{msgHoras}</p>
        )}
      </section>

      <div className="space-y-2">
        <Label htmlFor={`${id}-desc`}>
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id={`${id}-desc`}
          className="h-12 text-base"
          maxLength={MAX_DESCRICAO}
          placeholder="Ex.: consulta, curso, folga"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>

      {dentro.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {plural(dentro.length, "agendamento fica", "agendamentos ficam")} dentro do bloqueio
          </p>
          <ul className="space-y-0.5 pl-6 tabular-nums">
            {dentro.slice(0, 4).map((o) => (
              <li key={o.id}>{diaCurto(o.data)} · {horaHM(o.hora)} · {o.cliente.split(" ")[0]}</li>
            ))}
          </ul>
          {dentro.length > 4 && <p className="pl-6">e mais {dentro.length - 4}.</p>}
          <p className="pl-6">Eles continuam marcados. Remarque ou avise a cliente se precisar.</p>
        </div>
      )}

      <Button type="submit" size="xl" disabled={salvando}>
        <Lock /> {rotuloBotao}
      </Button>
    </form>
  );
}
