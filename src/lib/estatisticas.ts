const r2 = (n: number) => Math.round(n * 100) / 100;

/** Os `n` meses que terminam em `mesAtual` ("YYYY-MM"), do mais antigo ao mais recente. */
export function mesesPeriodo(mesAtual: string, n: number): string[] {
  const [y, m] = mesAtual.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26" */
export const mesCurto = (mes: string) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

export type AtendimentoEstat = {
  data: string;
  status: string;
  valor_bruto: number | string;
  valor_liquido: number | string;
  percentual_ana: number | string;
  cliente_id: string;
  servico_id: string | null;
  clientes: { nome: string } | null;
  servicos: { nome: string } | null;
};

export type Ranking = { id: string; nome: string; qtd: number; valor: number };

const top5 = (m: Map<string, Ranking>) =>
  [...m.values()]
    .map((r) => ({ ...r, valor: r2(r.valor) }))
    .sort((a, b) => b.qtd - a.qtd || b.valor - a.valor || a.nome.localeCompare(b.nome))
    .slice(0, 5);

/**
 * Estatísticas dos `meses` informados. Dinheiro, contagens e rankings usam só 'realizado';
 * a taxa de faltas/cancelamentos é (faltou + cancelado) ÷ registros do período com data até
 * `hoje` (agendamentos futuros ainda não tiveram chance de faltar).
 */
export function estatisticas(atendimentos: AtendimentoEstat[], meses: string[], hoje: string) {
  const noPeriodo = atendimentos.filter((a) => meses.includes(a.data.slice(0, 7)));
  const realizados = noPeriodo.filter((a) => a.status === "realizado");

  const porMes = meses.map((mes) => {
    const doMes = realizados.filter((a) => a.data.startsWith(mes));
    return {
      mes,
      bruto: r2(doMes.reduce((s, a) => s + Number(a.valor_bruto), 0)),
      ana: r2(doMes.reduce((s, a) => s + (Number(a.valor_liquido) * Number(a.percentual_ana)) / 100, 0)),
      qtd: doMes.length,
    };
  });

  const servicos = new Map<string, Ranking>();
  const clientes = new Map<string, Ranking>();
  for (const a of realizados) {
    const v = Number(a.valor_bruto);
    const sid = a.servico_id ?? "sem-servico";
    const s = servicos.get(sid) ?? { id: sid, nome: a.servicos?.nome ?? "Sem serviço", qtd: 0, valor: 0 };
    servicos.set(sid, { ...s, qtd: s.qtd + 1, valor: s.valor + v });
    const c = clientes.get(a.cliente_id) ?? { id: a.cliente_id, nome: a.clientes?.nome ?? "—", qtd: 0, valor: 0 };
    clientes.set(a.cliente_id, { ...c, qtd: c.qtd + 1, valor: c.valor + v });
  }

  const bruto = r2(porMes.reduce((s, m) => s + m.bruto, 0));
  const ateHoje = noPeriodo.filter((a) => a.data <= hoje);
  const faltas = ateHoje.filter((a) => a.status === "faltou").length;
  const cancelados = ateHoje.filter((a) => a.status === "cancelado").length;

  return {
    porMes,
    realizados: realizados.length,
    bruto,
    ana: r2(porMes.reduce((s, m) => s + m.ana, 0)),
    ticketMedio: realizados.length ? r2(bruto / realizados.length) : 0,
    topServicos: top5(servicos),
    topClientes: top5(clientes),
    faltas,
    cancelados,
    totalAgendamentos: ateHoje.length,
    taxaFaltasCancelamentos: ateHoje.length ? (faltas + cancelados) / ateHoje.length : 0,
  };
}
