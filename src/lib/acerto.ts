import { brl } from "./format";
import type { Pagamento, Recebedor } from "./pagamentos";

/**
 * Primeiro dia do acerto diário entre a Ana e a dona do salão. Até 14/11/2026 ficou tudo
 * acertado (ninguém deve ninguém), então dias anteriores não entram em pendência.
 */
export const INICIO_ACERTO_DIARIO = "2026-11-15";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Diferença menor que 1 centavo conta como zero. */
export const zerado = (n: number) => Math.round(n * 100) === 0;

export type AtendimentoDivisao = {
  data: string;
  status: string;
  valor_bruto: number | string;
  valor_liquido: number | string;
  percentual_ana: number | string;
  pagamentos: Pick<Pagamento, "valor" | "taxa_percentual" | "recebedor">[];
};

export type Divisao = {
  /** Atendimentos concluídos considerados. */
  atendimentos: number;
  bruto: number;
  liquido: number;
  taxas: number;
  /** Parte da Ana: líquido × % da Ana gravado em cada atendimento. */
  ana: number;
  /** Parte da dona do salão: o resto do líquido. */
  dona: number;
  /** Líquido que ficou na mão de cada uma (pelas partes do pagamento). */
  recebido: Record<Recebedor, number>;
};

/**
 * Produção e divisão dos atendimentos concluídos. O que a dona recebeu vem das partes marcadas
 * "simone" (descontada a taxa da parte); o resto do líquido ficou com a Ana — assim
 * recebido.ana + recebido.simone = líquido, sem diferença de centavo.
 */
export function divisao(atendimentos: AtendimentoDivisao[]): Divisao {
  let n = 0, bruto = 0, liquido = 0, ana = 0, recebidoDona = 0;
  for (const a of atendimentos) {
    if (a.status !== "realizado") continue;
    n++;
    const liq = Number(a.valor_liquido) || 0;
    bruto += Number(a.valor_bruto) || 0;
    liquido += liq;
    ana += (liq * (Number(a.percentual_ana) || 0)) / 100;
    const dona = a.pagamentos
      .filter((p) => p.recebedor === "simone")
      .reduce((s, p) => s + p.valor * (1 - (Number(p.taxa_percentual) || 0) / 100), 0);
    recebidoDona += Math.min(Math.max(dona, 0), liq);
  }
  const L = r2(liquido);
  const A = r2(ana);
  const RD = r2(recebidoDona);
  return {
    atendimentos: n,
    bruto: r2(bruto),
    liquido: L,
    taxas: r2(bruto - liquido),
    ana: A,
    dona: r2(L - A),
    recebido: { ana: r2(L - RD), simone: RD },
  };
}

/** Positivo: a Ana manda isso pra dona. Negativo: a dona manda pra Ana. */
export const devidoDaDivisao = (d: Divisao) => r2(d.recebido.ana - d.ana);

export type RepasseDiario = { id: string; dia: string; de: Recebedor; valor: number | string; created_at: string };

/** Soma dos repasses com sinal: Ana → dona positivo, dona → Ana negativo. */
export const somaRepasses = (repasses: Pick<RepasseDiario, "de" | "valor">[]) =>
  r2(repasses.reduce((s, r) => s + (r.de === "ana" ? 1 : -1) * Number(r.valor), 0));

export type AcertoDia = Divisao & {
  dia: string;
  /** O que o dia pede (antes dos repasses): positivo = Ana → dona. */
  devido: number;
  /** Repasses já confirmados para o dia, com o mesmo sinal. */
  repassado: number;
  /** O que ainda falta: devido − repassado. */
  falta: number;
  repasses: RepasseDiario[];
};

export function acertoDoDia(dia: string, atendimentos: AtendimentoDivisao[], repasses: RepasseDiario[]): AcertoDia {
  const d = divisao(atendimentos.filter((a) => a.data === dia));
  const doDia = repasses.filter((r) => r.dia === dia).sort((x, y) => x.created_at.localeCompare(y.created_at));
  const devido = devidoDaDivisao(d);
  const repassado = somaRepasses(doDia);
  return { ...d, dia, devido, repassado, falta: r2(devido - repassado), repasses: doDia };
}

/** Um acerto por dia com movimento (concluídos ou repasses) desde `desde`, do mais recente ao mais antigo. */
export function acertosPorDia(
  atendimentos: AtendimentoDivisao[],
  repasses: RepasseDiario[],
  desde: string = INICIO_ACERTO_DIARIO,
): AcertoDia[] {
  const dias = new Set<string>();
  for (const a of atendimentos) if (a.status === "realizado" && a.data >= desde) dias.add(a.data);
  for (const r of repasses) if (r.dia >= desde) dias.add(r.dia);
  return [...dias].sort().reverse().map((dia) => acertoDoDia(dia, atendimentos, repasses));
}

export type Pendencia = {
  /** Saldo líquido de todos os dias: positivo = Ana deve à dona; negativo = dona deve à Ana. */
  falta: number;
  /** Dias com algo a acertar, do mais antigo ao mais recente. */
  dias: AcertoDia[];
};

export function pendencias(acertos: AcertoDia[]): Pendencia {
  const dias = acertos.filter((a) => !zerado(a.falta)).sort((x, y) => x.dia.localeCompare(y.dia));
  return { falta: r2(dias.reduce((s, a) => s + a.falta, 0)), dias };
}

/** Repasses que zeram os dias informados: um por dia, no sentido de cada dia. */
export const repassesParaAcertar = (dias: Pick<AcertoDia, "dia" | "falta">[]) =>
  dias
    .filter((d) => !zerado(d.falta))
    .map((d) => ({ dia: d.dia, de: (d.falta > 0 ? "ana" : "simone") as Recebedor, valor: r2(Math.abs(d.falta)) }));

/** "Ana manda R$ 35,00 pra Simone" · "Simone manda R$ 10,00 pra Ana" · "Tudo acertado". */
export function quemManda(falta: number, dona: string): { texto: string; de: Recebedor | null; valor: number } {
  if (zerado(falta)) return { texto: "Tudo acertado", de: null, valor: 0 };
  const valor = r2(Math.abs(falta));
  return falta > 0
    ? { texto: `Ana manda ${brl(valor)} pra ${dona}`, de: "ana", valor }
    : { texto: `${dona} manda ${brl(valor)} pra Ana`, de: "simone", valor };
}
