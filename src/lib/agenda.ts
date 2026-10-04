import { horaDeMinutos, inicioSemana, minutos, somarDias } from "./format";

const ATIVOS = ["agendado", "realizado"];

/** Dias da grade do mês ("YYYY-MM"): de segunda antes do dia 1 até domingo depois do último dia. */
export function gradeMes(mes: string): string[] {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const proximo = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const inicio = inicioSemana(`${mes}-01`);
  const fim = somarDias(inicioSemana(somarDias(proximo, -1)), 6);
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/**
 * Inícios livres ("HH:MM") de `passo` em `passo` minutos dentro do expediente, cabendo a
 * `duracao` inteira sem sobrepor agendamentos ativos. `agora` (só para hoje) descarta horários
 * já passados; `ignorarId` tira o próprio atendimento ao editar.
 */
export function horariosLivres(p: {
  agendamentos: { id: string; hora: string | null; duracao_min: number; status: string }[];
  inicioExpediente: string;
  fimExpediente: string;
  duracao: number;
  ignorarId?: string | undefined;
  agora?: string | null | undefined;
  passo?: number;
}): string[] {
  const { duracao, passo = 30 } = p;
  if (!Number.isFinite(duracao) || duracao <= 0) return [];
  const ocupados = p.agendamentos
    .filter((a) => a.hora && a.id !== p.ignorarId && ATIVOS.includes(a.status))
    .map((a) => ({ ini: minutos(a.hora!), fim: minutos(a.hora!) + a.duracao_min }));
  const fimExp = minutos(p.fimExpediente);
  const minimo = p.agora ? minutos(p.agora) : -1;
  const livres: string[] = [];
  for (let s = minutos(p.inicioExpediente); s + duracao <= fimExp; s += passo) {
    if (s < minimo) continue;
    if (ocupados.some((o) => o.ini < s + duracao && s < o.fim)) continue;
    livres.push(horaDeMinutos(s));
  }
  return livres;
}
