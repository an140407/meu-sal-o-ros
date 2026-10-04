export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Datas e horas sempre no fuso do salão, independente do fuso do aparelho.
const TZ = "America/Sao_Paulo";
const fmtAgora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const agora = () => {
  const parts = fmtAgora.formatToParts(new Date());
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? "00";
  return { data: `${p("year")}-${p("month")}-${p("day")}`, hora: `${p("hour")}:${p("minute")}` };
};

export const hojeISO = () => agora().data;

export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const mesAno = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
};

export const FORMAS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
] as const;
export type Forma = (typeof FORMAS)[number]["value"];
export const formaLabel = (f: string) => FORMAS.find((x) => x.value === f)?.label ?? f;

export const horaAgora = () => agora().hora;
export const horaHM = (h: string | null | undefined) => (h ? h.slice(0, 5) : "");
export const dataHora = (iso: string, h?: string | null) => (h ? `${dataBR(iso)} ${horaHM(h)}` : dataBR(iso));

// Aritmética de calendário sobre "YYYY-MM-DD" (sem horário, então sem fuso envolvido).
const partes = (iso: string) => iso.slice(0, 10).split("-").map(Number) as [number, number, number];
const calendario = (iso: string) => {
  const [y, m, d] = partes(iso);
  return new Date(Date.UTC(y, m - 1, d));
};
export const somarDias = (iso: string, n: number) => {
  const d = calendario(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Dias de calendário de `de` até `ate` (ambos "YYYY-MM-DD"). */
export const diasDesde = (de: string, ate: string) =>
  Math.round((calendario(ate).getTime() - calendario(de).getTime()) / 86_400_000);
/** Segunda-feira da semana de `iso`. */
export const inicioSemana = (iso: string) => somarDias(iso, -((calendario(iso).getUTCDay() + 6) % 7));

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const diaSemanaCurto = (iso: string) => DIAS_CURTOS[calendario(iso).getUTCDay()];
export const diaDoMes = (iso: string) => partes(iso)[2];
/** "Segunda", "Terça"... */
export const diaSemana = (iso: string) => DIAS[calendario(iso).getUTCDay()]!;
/** "Segunda, 5 de outubro" */
export const diaPorExtenso = (iso: string) => {
  const [, m, d] = partes(iso);
  return `${DIAS[calendario(iso).getUTCDay()]}, ${d} de ${MESES[m - 1]!.toLowerCase()}`;
};

/** "HH:MM[:SS]" → minutos desde 00:00 */
export const minutos = (h: string) => {
  const [hh, mm] = h.split(":").map(Number) as [number, number];
  return hh * 60 + mm;
};
/** minutos desde 00:00 → "HH:MM" (limitado a 23:59) */
export const horaDeMinutos = (min: number) => {
  const m = Math.max(0, Math.min(min, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** validateSearch das telas por mês (?mes=YYYY-MM); mês inválido é ignorado. */
export const buscaMes = (search: Record<string, unknown>): { mes?: string } => {
  const mes = search["mes"];
  return typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? { mes } : {};
};
