import { dataBR, diaDaSemana, diaDoMes, diasDesde, horaHM, inicioSemana, minutos, somarDias } from "./format";
import { MAX_VEZES } from "./recorrencia";

/** Bloqueio de um dia na agenda: com hora de início e fim, ou o dia inteiro (as duas nulas). */
export type Bloqueio = {
  id: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  descricao: string | null;
  serie_id: string | null;
};

/** O que importa para saber se um bloqueio cobre um horário. */
export type Faixa = Pick<Bloqueio, "data" | "hora_inicio" | "hora_fim">;
/** Onde um agendamento está (ou vai ficar). */
export type Lugar = { data: string; hora: string | null | undefined; duracao: number };

/** Limite de bloqueios criados de uma vez (o mesmo das séries de agendamento). */
export const MAX_BLOQUEIOS = MAX_VEZES;
export const MAX_DESCRICAO = 120;

export const diaInteiro = (b: Pick<Bloqueio, "hora_inicio" | "hora_fim">) => !b.hora_inicio || !b.hora_fim;

/**
 * O bloqueio cobre o agendamento em `l`? Mesma regra do gatilho do banco: o dia inteiro cobre
 * tudo naquela data; com horário, [início, fim) cruza com [hora, hora + duração). Sem hora, só o
 * dia inteiro cobre. Duração ainda desconhecida (sem serviço) conta como 1 minuto.
 */
export function cobre(b: Faixa, l: Lugar): boolean {
  if (b.data !== l.data) return false;
  if (diaInteiro(b)) return true;
  if (!l.hora) return false;
  const ini = minutos(l.hora);
  const dur = Number.isFinite(l.duracao) && l.duracao > 0 ? l.duracao : 1;
  return ini < minutos(b.hora_fim!) && minutos(b.hora_inicio!) < ini + dur;
}

/** Dia inteiro primeiro; depois por hora de início e de fim. */
export const ordemBloqueio = (a: Faixa, b: Faixa) =>
  a.data.localeCompare(b.data) ||
  (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "") ||
  (a.hora_fim ?? "").localeCompare(b.hora_fim ?? "");

/**
 * O bloqueio que impede marcar em `alvo`, ou null. `antes` = onde o agendamento estava (ao editar,
 * remarcar ou reorganizar): bloqueio em que ele já estava não impede — a mesma regra do banco.
 */
export function bloqueioQueImpede<B extends Faixa>(bloqueios: readonly B[], alvo: Lugar, antes?: Lugar | null): B | null {
  return [...bloqueios].sort(ordemBloqueio).find((b) => cobre(b, alvo) && !(antes && cobre(b, antes))) ?? null;
}

/** Para cada data, o bloqueio que impede marcar `hora` + `duracao` nela (agendamento novo). */
export function datasBloqueadas<B extends Faixa>(
  datas: readonly string[],
  hora: string,
  duracao: number,
  bloqueios: readonly B[],
): Map<string, B> {
  const out = new Map<string, B>();
  for (const data of datas) {
    const b = bloqueioQueImpede(bloqueios, { data, hora, duracao });
    if (b) out.set(data, b);
  }
  return out;
}

/** "14:00–15:00" ou "Dia inteiro". */
export const horarioDoBloqueio = (b: Pick<Bloqueio, "hora_inicio" | "hora_fim">) =>
  diaInteiro(b) ? "Dia inteiro" : `${horaHM(b.hora_inicio)}–${horaHM(b.hora_fim)}`;

/** A descrição, ou "Bloqueado" quando não tem. */
export const tituloBloqueio = (b: Pick<Bloqueio, "descricao">) => b.descricao?.trim() || "Bloqueado";

/** A mesma frase que o banco usa ao recusar um agendamento. */
export function textoImpedimento(b: Faixa & Pick<Bloqueio, "descricao">): string {
  const dia = dataBR(b.data).slice(0, 5);
  const desc = b.descricao?.trim() ? ` (${b.descricao.trim()})` : "";
  return diaInteiro(b)
    ? `Dia ${dia} está bloqueado${desc}`
    : `Horário bloqueado em ${dia}, das ${horaHM(b.hora_inicio)} às ${horaHM(b.hora_fim)}${desc}`;
}

/** Primeiro minuto a partir de `min` fora dos bloqueios com horário (pula os encadeados). */
export function pularBloqueios(min: number, bloqueios: readonly Faixa[]): number {
  let s = min;
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const b of bloqueios) {
      if (diaInteiro(b)) continue;
      const ini = minutos(b.hora_inicio!);
      const fim = minutos(b.hora_fim!);
      if (ini <= s && s < fim) {
        s = fim;
        mudou = true;
      }
    }
  }
  return s;
}

/** Confere as horas do formulário de bloqueio; devolve a mensagem de erro ou null. */
export function erroHoras(diaTodo: boolean, inicio: string, fim: string): string | null {
  if (diaTodo) return null;
  if (!inicio || !fim) return "Informe a hora de início e a de fim.";
  if (minutos(fim) <= minutos(inicio)) return "A hora de fim precisa ser depois da de início.";
  return null;
}

// ——— Repetição ———

export type Frequencia = "diaria" | "uteis" | "semanal" | "mensal" | "intervalo";

export const FREQUENCIAS: { valor: Frequencia; rotulo: string }[] = [
  { valor: "diaria", rotulo: "Todo dia" },
  { valor: "uteis", rotulo: "Seg a sex" },
  { valor: "semanal", rotulo: "Toda semana" },
  { valor: "mensal", rotulo: "Todo mês" },
  { valor: "intervalo", rotulo: "A cada X dias" },
];

export type Repeticao = {
  inicio: string;
  frequencia: Frequencia;
  /** Semanal: dias da semana (0 = domingo … 6 = sábado). */
  diasSemana: number[];
  /** Semanal: a cada N semanas (1–8). */
  cadaSemanas: number;
  /** Mensal: "dia" = mesmo dia do mês; "semana" = mesma posição do dia da semana (3ª sexta, último sábado). */
  mensal: "dia" | "semana";
  /** "A cada X dias": X (1–365). */
  cadaDias: number;
  termina: "vezes" | "data";
  vezes: number;
  /** Última data possível quando termina = "data" (inclusive). */
  ate: string;
};

export const SEMANA_INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;
export const SEMANA_NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const DIAS_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const pad = (n: number) => String(n).padStart(2, "0");
const mesDe = (iso: string) => iso.slice(0, 7);
const somarMeses = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
};
const diasNoMes = (mes: string) => diaDoMes(somarDias(`${somarMeses(mes, 1)}-01`, -1));
const limitar = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? Math.floor(n) : min));

/** Posição do dia da semana no mês: 20/11/2026 (sexta) → { n: 3, ultima: false }. */
export function posicaoNoMes(iso: string): { n: number; ultima: boolean } {
  const d = diaDoMes(iso);
  return { n: Math.ceil(d / 7), ultima: d + 7 > diasNoMes(mesDe(iso)) };
}

/** Datas candidatas, em ordem, de `inicio` até `horizonte`. */
function* candidatos(r: Repeticao, horizonte: string): Generator<string> {
  const { inicio } = r;
  switch (r.frequencia) {
    case "diaria":
      for (let d = inicio; d <= horizonte; d = somarDias(d, 1)) yield d;
      return;
    case "uteis":
      for (let d = inicio; d <= horizonte; d = somarDias(d, 1)) {
        const s = diaDaSemana(d);
        if (s >= 1 && s <= 5) yield d;
      }
      return;
    case "semanal": {
      const dias = new Set(r.diasSemana);
      const cada = limitar(r.cadaSemanas, 1, 8);
      const semana0 = inicioSemana(inicio);
      for (let d = inicio; d <= horizonte; d = somarDias(d, 1)) {
        if (Math.floor(diasDesde(semana0, d) / 7) % cada === 0 && dias.has(diaDaSemana(d))) yield d;
      }
      return;
    }
    case "intervalo": {
      const passo = limitar(r.cadaDias, 1, 365);
      for (let d = inicio; d <= horizonte; d = somarDias(d, passo)) yield d;
      return;
    }
    case "mensal": {
      const dia = diaDoMes(inicio);
      const semana = diaDaSemana(inicio);
      const { n } = posicaoNoMes(inicio);
      for (let k = 0; ; k++) {
        const mes = somarMeses(mesDe(inicio), k);
        if (`${mes}-01` > horizonte) return;
        let alvo: number | null;
        if (r.mensal === "dia") {
          // Mês sem esse dia (31, 30, 29 de fevereiro) fica de fora.
          alvo = dia <= diasNoMes(mes) ? dia : null;
        } else {
          const primeiro = 1 + ((semana - diaDaSemana(`${mes}-01`) + 7) % 7);
          alvo = n >= 5 ? primeiro + Math.floor((diasNoMes(mes) - primeiro) / 7) * 7 : primeiro + (n - 1) * 7;
        }
        const d = alvo === null ? null : `${mes}-${pad(alvo)}`;
        if (d && d >= inicio && d <= horizonte) yield d;
      }
    }
  }
}

/**
 * Datas da repetição a partir de `inicio`, no máximo 60. Com "termina numa data", `cortado`
 * avisa que ainda havia datas depois da 60ª.
 */
export function gerarRepeticao(r: Repeticao): { datas: string[]; cortado: boolean } {
  if (!r.inicio) return { datas: [], cortado: false };
  const porData = r.termina === "data";
  if (porData && (!r.ate || r.ate < r.inicio)) return { datas: [], cortado: false };
  const limite = porData ? MAX_BLOQUEIOS : limitar(r.vezes, 1, MAX_BLOQUEIOS);
  // Nunca procura além de 10 anos (nem da data final).
  const dezAnos = somarDias(r.inicio, 3660);
  const horizonte = porData && r.ate < dezAnos ? r.ate : dezAnos;
  const datas: string[] = [];
  for (const d of candidatos(r, horizonte)) {
    if (datas.length === limite) return { datas, cortado: porData };
    datas.push(d);
  }
  return { datas, cortado: false };
}

const juntar = (itens: string[]) =>
  itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

/** "No dia 20 de cada mês", "Na 3ª sexta de cada mês", "No último sábado de cada mês". */
export function textoMensal(inicio: string, modo: Repeticao["mensal"]): string {
  if (modo === "dia") return `No dia ${diaDoMes(inicio)} de cada mês`;
  const s = diaDaSemana(inicio);
  const masc = s === 0 || s === 6;
  const { n } = posicaoNoMes(inicio);
  const ordem = n >= 5 ? (masc ? "último" : "última") : `${n}${masc ? "º" : "ª"}`;
  return `${masc ? "No" : "Na"} ${ordem} ${DIAS_NOME[s]} de cada mês`;
}

/** Resumo da regra: "Toda semana: ter e qui", "A cada 10 dias"... */
export function descreverRepeticao(r: Repeticao): string {
  switch (r.frequencia) {
    case "diaria":
      return "Todo dia";
    case "uteis":
      return "De segunda a sexta";
    case "semanal": {
      const dias = [...new Set(r.diasSemana)].sort((a, b) => a - b).map((i) => DIAS_ABREV[i] ?? "");
      const quando = dias.length === 7 ? "todos os dias" : juntar(dias);
      const cada = limitar(r.cadaSemanas, 1, 8);
      return cada > 1 ? `A cada ${cada} semanas: ${quando}` : `Toda semana: ${quando}`;
    }
    case "mensal":
      return textoMensal(r.inicio, r.mensal);
    case "intervalo": {
      const n = limitar(r.cadaDias, 1, 365);
      return n === 1 ? "Todo dia" : `A cada ${n} dias`;
    }
  }
}

/** Identificador novo para a série de bloqueios (uuid v4), também em navegador sem crypto.randomUUID. */
export function novaSerieId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
