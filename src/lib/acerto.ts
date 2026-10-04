const r2 = (n: number) => Math.round(n * 100) / 100;

export type SaldoMes = { mes: string; ana: number; repassado: number; saldo: number };

/**
 * Saldo de cada mês anterior a `mesAtual` com atendimentos ou repasses, com a mesma
 * fórmula do Acerto (parte da Ana − repassado). Positivo = a receber. Mais recente primeiro.
 */
export function saldoPorMes(
  atendimentos: { data: string; valor_liquido: number | string; percentual_ana: number | string }[],
  repasses: { mes_referencia: string; valor: number | string }[],
  mesAtual: string,
): { meses: SaldoMes[]; total: number } {
  const ana = new Map<string, number>();
  const repassado = new Map<string, number>();
  for (const a of atendimentos) {
    const mes = a.data.slice(0, 7);
    if (mes < mesAtual) ana.set(mes, (ana.get(mes) ?? 0) + (Number(a.valor_liquido) * Number(a.percentual_ana)) / 100);
  }
  for (const r of repasses) {
    if (r.mes_referencia < mesAtual) repassado.set(r.mes_referencia, (repassado.get(r.mes_referencia) ?? 0) + Number(r.valor));
  }
  const meses = [...new Set([...ana.keys(), ...repassado.keys()])]
    .sort()
    .reverse()
    .map((mes) => {
      const a = r2(ana.get(mes) ?? 0);
      const r = r2(repassado.get(mes) ?? 0);
      return { mes, ana: a, repassado: r, saldo: r2(a - r) };
    });
  return { meses, total: r2(meses.reduce((s, m) => s + m.saldo, 0)) };
}
