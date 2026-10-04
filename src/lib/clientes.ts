import { diasDesde } from "./format";

/** Data de nascimento ("YYYY-MM-DD", tratada como texto) cai no mês de `hoje`? */
export function ehAniversarioNoMes(dataNascimento: string | null | undefined, hoje: string): boolean {
  if (!dataNascimento || !/^\d{4}-\d{2}-\d{2}/.test(dataNascimento)) return false;
  return dataNascimento.slice(5, 7) === hoje.slice(5, 7);
}

export type Retorno<C> = { cliente: C; dias: number; ultimoServico: string | null };

/**
 * Clientes cuja última visita realizada foi há mais de `minDias` dias e que não têm
 * agendamento futuro. Ordena de quem está há mais tempo sem vir.
 */
export function clientesParaRetorno<C extends { id: string }>(
  clientes: C[],
  realizados: { cliente_id: string; data: string; servico: string | null }[],
  comAgendamentoFuturo: Set<string>,
  hoje: string,
  minDias: number,
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
      return dias > minDias ? [{ cliente, dias, ultimoServico: u.servico }] : [];
    })
    .sort((a, b) => b.dias - a.dias);
}
