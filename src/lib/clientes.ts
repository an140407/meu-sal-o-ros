import { diasDesde } from "./format";

/** Data de nascimento ("YYYY-MM-DD", tratada como texto) cai no mês de `hoje`? */
export function ehAniversarioNoMes(dataNascimento: string | null | undefined, hoje: string): boolean {
  if (!dataNascimento || !/^\d{4}-\d{2}-\d{2}/.test(dataNascimento)) return false;
  return dataNascimento.slice(5, 7) === hoje.slice(5, 7);
}

export type Retorno<C> = {
  cliente: C;
  dias: number;
  ultimoServico: string | null;
  /** Prazo usado: o retorno_dias da cliente ou o padrão. */
  prazo: number;
  /** true quando o prazo é o da própria cliente. */
  prazoDaCliente: boolean;
  /** Dias além do prazo (≥ 1). */
  atraso: number;
};

/**
 * Clientes cuja última visita realizada passou do prazo e que não têm agendamento futuro.
 * O prazo é o retorno_dias de cada cliente; quem não tem usa `prazoPadrao`.
 * Ordena por atraso (maior primeiro) e depois por dias sem vir.
 */
export function clientesParaRetorno<C extends { id: string; retorno_dias?: number | null }>(
  clientes: C[],
  realizados: { cliente_id: string; data: string; servico: string | null }[],
  comAgendamentoFuturo: Set<string>,
  hoje: string,
  prazoPadrao: number,
): Retorno<C>[] {
  const ultima = new Map<string, { data: string; servico: string | null }>();
  for (const a of realizados) {
    const atual = ultima.get(a.cliente_id);
    if (!atual || a.data > atual.data) ultima.set(a.cliente_id, { data: a.data, servico: a.servico });
  }
  return clientes
    .flatMap((cliente) => {
      const u = ultima.get(cliente.id);
      if (!u || comAgendamentoFuturo.has(cliente.id)) return [];
      const dias = diasDesde(u.data, hoje);
      const prazoDaCliente = typeof cliente.retorno_dias === "number" && cliente.retorno_dias > 0;
      const prazo = prazoDaCliente ? cliente.retorno_dias! : prazoPadrao;
      return dias > prazo ? [{ cliente, dias, ultimoServico: u.servico, prazo, prazoDaCliente, atraso: dias - prazo }] : [];
    })
    .sort((a, b) => b.atraso - a.atraso || b.dias - a.dias);
}
