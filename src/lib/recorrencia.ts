import { diasDesde, horaHM, minutos, somarDias } from "./format";

/** Limite de agendamentos criados de uma vez (o banco também recusa acima disso). */
export const MAX_VEZES = 60;
/** Intervalos oferecidos em chips (dias). */
export const INTERVALOS = [7, 14, 21, 28, 30] as const;
export const INTERVALO_PADRAO = 21;

const ATIVOS = ["agendado", "realizado"];

/** `vezes` datas a partir de `inicio`, de `intervaloDias` em `intervaloDias` (limita 1–60 e intervalo ≥ 1). */
export function gerarDatas(inicio: string, intervaloDias: number, vezes: number): string[] {
  const n = Math.min(MAX_VEZES, Math.max(1, Math.floor(vezes)));
  const passo = Math.max(1, Math.floor(intervaloDias));
  return Array.from({ length: n }, (_, i) => somarDias(inicio, i * passo));
}

export type Ocupado = {
  id: string;
  data: string;
  hora: string | null;
  duracao_min: number;
  status: string;
  cliente: string;
};

/**
 * Para cada data, o primeiro agendamento ativo que se sobrepõe a `hora` + `duracao`
 * (mesma regra do AgendaForm: [ini, fim) se cruzam). Sem horário não ocupa.
 */
export function conflitosDasDatas(
  datas: string[],
  hora: string,
  duracao: number,
  ocupados: Ocupado[],
  ignorarIds: string[] = [],
): Map<string, Ocupado> {
  const out = new Map<string, Ocupado>();
  if (!hora || !Number.isFinite(duracao) || duracao <= 0) return out;
  const ini = minutos(hora);
  const fim = ini + duracao;
  const alvo = new Set(datas);
  const ordenados = [...ocupados].sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  for (const o of ordenados) {
    if (!alvo.has(o.data) || out.has(o.data) || !o.hora || ignorarIds.includes(o.id) || !ATIVOS.includes(o.status)) continue;
    const oIni = minutos(o.hora);
    if (oIni < fim && ini < oIni + o.duracao_min) out.set(o.data, o);
  }
  return out;
}

/**
 * Datas que serão criadas (sem as puladas e sem as que caem num bloqueio), a última, quantas
 * têm conflito e quantas ficam de fora por bloqueio.
 */
export function resumoSerie(
  datas: string[],
  puladas: Set<string>,
  conflitos: Map<string, unknown>,
  bloqueadas: Map<string, unknown> = new Map(),
) {
  const ativas = datas.filter((d) => !puladas.has(d) && !bloqueadas.has(d));
  const bloq = datas.filter((d) => !puladas.has(d) && bloqueadas.has(d)).length;
  return {
    ativas,
    primeira: ativas[0] ?? null,
    ultima: ativas[ativas.length - 1] ?? null,
    conflitos: ativas.filter((d) => conflitos.has(d)).length,
    puladas: datas.length - ativas.length - bloq,
    bloqueadas: bloq,
  };
}

export type Membro = {
  id: string;
  data: string;
  status: string;
  serie_id: string | null;
  hora?: string | null;
  duracao_min?: number;
};

/** Posição do agendamento na série, por data: { n: 3, m: 12 }. */
export function posicaoNaSerie(id: string, membros: Membro[]): { n: number; m: number } | null {
  const ordem = [...membros].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const i = ordem.findIndex((x) => x.id === id);
  return i < 0 ? null : { n: i + 1, m: ordem.length };
}

/** Menor distância (dias) entre datas consecutivas da série; null com menos de 2 datas. */
export function intervaloDaSerie(membros: { data: string }[]): number | null {
  const datas = [...new Set(membros.map((m) => m.data))].sort();
  let menor: number | null = null;
  for (let i = 1; i < datas.length; i++) {
    const [a, b] = [datas[i - 1]!, datas[i]!];
    const dias = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
    if (dias > 0 && (menor === null || dias < menor)) menor = dias;
  }
  return menor;
}

/** Agendamentos ainda 'agendado' da série depois de `data` (os que "este e os próximos" afetam). */
export const proximosDaSerie = (data: string, membros: Membro[]) =>
  membros.filter((m) => m.data > data && m.status === "agendado").sort((a, b) => a.data.localeCompare(b.data));

/** Intervalo válido para gravar (1–365) ou null. */
export function intervaloValido(n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : null;
}

export type Mudanca<T> = { item: T; de: string; para: string };

/**
 * O que acontece com os próximos da cliente ao mudar o intervalo de retorno — a mesma regra
 * da função `alterar_retorno_cliente` do banco: em cada série, os ainda 'agendado' a partir de
 * `hoje` são ordenados por data (e id); o primeiro fica, o k-ésimo seguinte vai para
 * primeiro + k × intervalo. Devolve só os que mudam de data, em ordem de data nova.
 */
export function planoReorganizacao<T extends Membro>(itens: T[], intervalo: number, hoje: string): Mudanca<T>[] {
  const passo = intervaloValido(intervalo);
  if (!passo) return [];
  const porSerie = new Map<string, T[]>();
  for (const a of itens) {
    if (!a.serie_id || a.status !== "agendado" || a.data < hoje) continue;
    porSerie.set(a.serie_id, [...(porSerie.get(a.serie_id) ?? []), a]);
  }
  const out: Mudanca<T>[] = [];
  for (const membros of porSerie.values()) {
    const ordem = [...membros].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const primeira = ordem[0]!.data;
    ordem.forEach((item, k) => {
      const para = somarDias(primeira, k * passo);
      if (para !== item.data) out.push({ item, de: item.data, para });
    });
  }
  return out.sort((a, b) => a.para.localeCompare(b.para));
}

export type Remarcacao<T> = { item: T; de: string; para: string; horaDe: string; horaPara: string };

/**
 * "Este e os próximos" ao editar um agendamento de série: cada próximo anda os mesmos dias que
 * este andou (data nova − data antiga, pode ser negativo) e fica no horário novo — o intervalo
 * entre eles não muda. Mesma regra da função remarcar_proximos_da_serie do banco.
 */
export function planoRemarcacao<T extends Membro>(
  proximos: T[],
  dataAntes: string,
  dataDepois: string,
  horaDepois: string,
): Remarcacao<T>[] {
  const delta = diasDesde(dataAntes, dataDepois);
  return [...proximos]
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
    .map((item) => ({
      item,
      de: item.data,
      para: somarDias(item.data, delta),
      horaDe: horaHM(item.hora),
      horaPara: horaHM(horaDepois) || horaHM(item.hora),
    }));
}

/** "+1 dia", "−2 dias", "" (mesmo dia). */
export function textoDeslocamento(dias: number): string {
  if (dias === 0) return "";
  const n = Math.abs(dias);
  return `${dias > 0 ? "+" : "−"}${n} ${n === 1 ? "dia" : "dias"}`;
}
