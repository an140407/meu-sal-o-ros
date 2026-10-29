import { minutos, somarDias } from "./format";

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

/** Datas que serão criadas (sem as puladas), a última e quantas têm conflito. */
export function resumoSerie(datas: string[], puladas: Set<string>, conflitos: Map<string, unknown>) {
  const ativas = datas.filter((d) => !puladas.has(d));
  return {
    ativas,
    primeira: ativas[0] ?? null,
    ultima: ativas[ativas.length - 1] ?? null,
    conflitos: ativas.filter((d) => conflitos.has(d)).length,
    puladas: datas.length - ativas.length,
  };
}

export type Membro = { id: string; data: string; status: string; serie_id: string | null };

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
