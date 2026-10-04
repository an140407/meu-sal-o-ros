export const CATEGORIAS_DESPESA = ["Esmalte/gel", "Fibra/acrílico", "Ferramentas", "Descartáveis", "Outros"] as const;
export const SEM_CATEGORIA = "Sem categoria";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Total do mês e subtotais por categoria, na ordem de CATEGORIAS_DESPESA (demais no fim). */
export function resumoDespesas(despesas: { categoria: string | null; valor: number | string }[]) {
  const porCategoria = new Map<string, number>();
  for (const d of despesas) {
    const k = d.categoria || SEM_CATEGORIA;
    porCategoria.set(k, (porCategoria.get(k) ?? 0) + Number(d.valor));
  }
  const ordem = (k: string) => {
    const i = (CATEGORIAS_DESPESA as readonly string[]).indexOf(k);
    return i === -1 ? CATEGORIAS_DESPESA.length : i;
  };
  return {
    total: r2(despesas.reduce((s, d) => s + Number(d.valor), 0)),
    categorias: [...porCategoria.entries()]
      .map(([categoria, valor]) => ({ categoria, valor: r2(valor) }))
      .sort((a, b) => ordem(a.categoria) - ordem(b.categoria) || a.categoria.localeCompare(b.categoria)),
  };
}
