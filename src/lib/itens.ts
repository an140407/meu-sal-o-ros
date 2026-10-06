import { parseValor } from "./format";

/** Um serviço dentro de um atendimento (tabela atendimento_servicos). */
export type ItemServico = {
  servico_id: string | null;
  nome: string;
  valor: number;
  duracao_min: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Itens do atendimento em ordem. Atendimentos antigos, sem itens, viram um item só com o
 * nome de servicos(nome) e o valor_bruto.
 */
export function itensDoAtendimento(a: {
  atendimento_servicos?: (ItemServico & { ordem: number })[] | null;
  servicos: { nome: string } | null;
  servico_id: string | null;
  valor_bruto: number | string;
  duracao_min: number;
}): ItemServico[] {
  const itens = a.atendimento_servicos ?? [];
  if (itens.length === 0) {
    return [{ servico_id: a.servico_id, nome: a.servicos?.nome ?? "Serviço", valor: Number(a.valor_bruto), duracao_min: a.duracao_min }];
  }
  return [...itens]
    .sort((x, y) => x.ordem - y.ordem)
    .map((i) => ({ servico_id: i.servico_id, nome: i.nome, valor: Number(i.valor), duracao_min: i.duracao_min }));
}

/** Soma de valores (centavos arredondados) e de durações. */
export function somaItens(itens: { valor: number; duracao_min: number }[]) {
  return {
    valor: r2(itens.reduce((s, i) => s + i.valor, 0)),
    duracao: itens.reduce((s, i) => s + i.duracao_min, 0),
  };
}

/** "Fibra + Esmaltação em gel" */
export const nomesItens = (itens: { nome: string }[]) => itens.map((i) => i.nome).join(" + ") || "Serviço";

/** Duração total gravada no atendimento: limitada a 15–480 min (avisar quando ajustada). */
export function limitarDuracao(total: number) {
  const duracao = Math.min(480, Math.max(15, Math.round(total)));
  return { duracao, ajustada: duracao !== total };
}

export type RankingServico = { id: string; nome: string; qtd: number; valor: number };

/** Por serviço: quantidade de itens e soma dos valores. Mais feitos primeiro, depois maior valor. */
export function agregarPorServico(itens: ItemServico[], limite = 5): RankingServico[] {
  const m = new Map<string, RankingServico>();
  for (const i of itens) {
    const id = i.servico_id ?? `nome:${i.nome}`;
    const r = m.get(id) ?? { id, nome: i.nome, qtd: 0, valor: 0 };
    m.set(id, { ...r, qtd: r.qtd + 1, valor: r.valor + i.valor });
  }
  return [...m.values()]
    .map((r) => ({ ...r, valor: r2(r.valor) }))
    .sort((a, b) => b.qtd - a.qtd || b.valor - a.valor || a.nome.localeCompare(b.nome))
    .slice(0, limite);
}

/** Item como digitado no formulário (valor e duração em texto). */
export type ItemForm = { key: string; servico_id: string | null; nome: string; valor: string; duracao: string };

let seq = 0;
export const novaChave = () => `item-${++seq}`;

export const itensParaForm = (itens: ItemServico[]): ItemForm[] =>
  itens.map((i) => ({ key: novaChave(), servico_id: i.servico_id, nome: i.nome, valor: String(i.valor), duracao: String(i.duracao_min) }));

/** Valida e converte os itens do formulário. Pelo menos 1; valor >= 0; duração inteira 5–480. */
export function validarItens(itens: ItemForm[]): { itens: ItemServico[] } | { erro: string } {
  if (itens.length === 0) return { erro: "Adicione pelo menos um serviço." };
  const out: ItemServico[] = [];
  for (const i of itens) {
    const valor = parseValor(i.valor);
    const duracao = Number(i.duracao);
    if (!Number.isFinite(valor) || valor < 0) return { erro: `Valor inválido em "${i.nome}".` };
    if (!Number.isInteger(duracao) || duracao < 5 || duracao > 480)
      return { erro: `Duração de "${i.nome}" deve ser entre 5 e 480 minutos.` };
    out.push({ servico_id: i.servico_id, nome: i.nome, valor: r2(valor), duracao_min: duracao });
  }
  return { itens: out };
}

/** Totais para exibir enquanto edita (campos inválidos contam como 0). */
export function totaisForm(itens: ItemForm[]) {
  return somaItens(
    itens.map((i) => {
      const v = parseValor(i.valor);
      const d = Number(i.duracao);
      return { valor: Number.isFinite(v) ? v : 0, duracao_min: Number.isFinite(d) ? d : 0 };
    }),
  );
}
