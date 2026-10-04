export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const hojeISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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

export const horaAgora = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const horaHM = (h: string | null | undefined) => (h ? h.slice(0, 5) : "");
export const dataHora = (iso: string, h?: string | null) => (h ? `${dataBR(iso)} ${horaHM(h)}` : dataBR(iso));
