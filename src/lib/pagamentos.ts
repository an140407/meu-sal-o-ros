import { FORMAS, brl, formaLabel, parseValor, type Forma } from "./format";

/** Uma parte do pagamento de um atendimento (tabela atendimento_pagamentos). */
export type Pagamento = { forma: Forma; valor: number; taxa_percentual: number };

/** Parte como digitada no formulário (valor em texto). */
export type ParteForm = { key: string; forma: Forma; valor: string };

/** Taxas atuais da maquininha, em %. */
export type Taxas = { debito: number; credito: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Comparação de dinheiro em centavos (evita 0,1 + 0,2 ≠ 0,3). */
const centavos = (n: number) => Math.round(n * 100);
export const MAX_PARTES = 4;

export const taxaDaForma = (forma: Forma, taxas: Taxas) =>
  forma === "debito" ? taxas.debito : forma === "credito" ? taxas.credito : 0;

/** Valor para o campo do formulário: 150 → "150,00". */
export const valorParaCampo = (n: number) => n.toFixed(2).replace(".", ",");

let seq = 0;
export const novaChaveParte = () => `parte-${++seq}`;

/**
 * Partes do atendimento em ordem. Concluídos sem partes (versões antigas) viram uma parte só
 * com forma_pagamento e valor_bruto. Total 0 (serviço grátis) não tem parte.
 */
export function pagamentosDoAtendimento(a: {
  atendimento_pagamentos?: { forma: string; valor: number | string; taxa_percentual: number | string; ordem: number }[] | null;
  forma_pagamento: string;
  valor_bruto: number | string;
  taxa_percentual: number | string;
}): Pagamento[] {
  const lista = a.atendimento_pagamentos ?? [];
  if (lista.length > 0) {
    return [...lista]
      .sort((x, y) => x.ordem - y.ordem)
      .map((p) => ({ forma: p.forma as Forma, valor: Number(p.valor), taxa_percentual: Number(p.taxa_percentual) }));
  }
  const bruto = Number(a.valor_bruto);
  return bruto > 0
    ? [{ forma: a.forma_pagamento as Forma, valor: bruto, taxa_percentual: Number(a.taxa_percentual) }]
    : [];
}

/** "Pix + Crédito" (sem repetir forma); sem partes = "Sem cobrança". */
export const formasLabel = (pagamentos: { forma: string }[]) =>
  pagamentos.length === 0 ? "Sem cobrança" : [...new Set(pagamentos.map((p) => formaLabel(p.forma)))].join(" + ");

/** "Pix R$ 70,00 + Crédito R$ 80,00" */
export const partesTexto = (pagamentos: { forma: string; valor: number }[]) =>
  pagamentos.map((p) => `${formaLabel(p.forma)} ${brl(p.valor)}`).join(" + ");

/** Forma de maior valor (a primeira em caso de empate); gravada em atendimentos.forma_pagamento. */
export function formaPrincipal(pagamentos: { forma: Forma; valor: number }[]): Forma {
  let melhor = pagamentos[0];
  for (const p of pagamentos) if (melhor && p.valor > melhor.valor) melhor = p;
  return melhor?.forma ?? "pix";
}

/** Partes iniciais do formulário: as gravadas ou, sem nenhuma, Pix com o total. */
export function partesIniciais(pagamentos: { forma: Forma; valor: number }[], total: number): ParteForm[] {
  if (pagamentos.length > 0) {
    return pagamentos.map((p) => ({ key: novaChaveParte(), forma: p.forma, valor: valorParaCampo(p.valor) }));
  }
  return [{ key: novaChaveParte(), forma: "pix", valor: valorParaCampo(total) }];
}

export type ResumoPagamentos = {
  soma: number;
  /** total − soma (positivo = falta; negativo = passou). */
  diferenca: number;
  fechou: boolean;
  /** Alguma parte com valor vazio, zero ou inválido. */
  invalida: boolean;
  /** Prévia das taxas com as taxas atuais e do líquido (válidos quando fechou). */
  taxas: number;
  liquido: number;
};

export function resumoPagamentos(partes: ParteForm[], total: number, taxas: Taxas): ResumoPagamentos {
  let soma = 0;
  let somaTaxas = 0;
  let invalida = false;
  for (const p of partes) {
    const v = parseValor(p.valor);
    if (!Number.isFinite(v) || v <= 0) {
      invalida = true;
      continue;
    }
    soma += v;
    somaTaxas += (v * taxaDaForma(p.forma, taxas)) / 100;
  }
  const diferenca = r2(total - soma);
  return {
    soma: r2(soma),
    diferenca,
    fechou: !invalida && centavos(soma) === centavos(total),
    invalida,
    taxas: r2(somaTaxas),
    liquido: r2(total - somaTaxas),
  };
}

/**
 * Valida as partes contra o total. Total 0 dispensa pagamento. Devolve as partes para o banco
 * (a taxa de cada parte é gravada pelo banco) ou a mensagem de erro.
 */
export function validarPagamentos(
  partes: ParteForm[],
  total: number,
): { pagamentos: { forma: Forma; valor: number }[] } | { erro: string } {
  if (centavos(total) === 0) return { pagamentos: [] };
  if (partes.length === 0) return { erro: "Informe a forma de pagamento." };
  const out: { forma: Forma; valor: number }[] = [];
  for (const p of partes) {
    const v = parseValor(p.valor);
    if (!Number.isFinite(v) || v <= 0) return { erro: `Valor inválido no ${formaLabel(p.forma)}.` };
    out.push({ forma: p.forma, valor: r2(v) });
  }
  const diff = centavos(total) - centavos(out.reduce((s, p) => s + p.valor, 0));
  if (diff > 0) return { erro: `Faltam ${brl(diff / 100)} para fechar o total.` };
  if (diff < 0) return { erro: `Os pagamentos passaram ${brl(-diff / 100)} do total.` };
  return { pagamentos: out };
}

/**
 * "Dividir": acrescenta uma parte com o que falta. Se nada falta, divide a última ao meio.
 * A forma da parte nova é a primeira ainda não usada.
 */
export function dividirPagamento(partes: ParteForm[], total: number): ParteForm[] {
  if (partes.length >= MAX_PARTES) return partes;
  const usadas = new Set(partes.map((p) => p.forma));
  const forma = FORMAS.find((f) => !usadas.has(f.value))?.value ?? "pix";
  const soma = partes.reduce((s, p) => {
    const v = parseValor(p.valor);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
  const falta = r2(total - soma);
  if (falta > 0) return [...partes, { key: novaChaveParte(), forma, valor: valorParaCampo(falta) }];

  const ultima = partes[partes.length - 1];
  const vUltima = ultima ? parseValor(ultima.valor) : Number.NaN;
  if (!ultima || !Number.isFinite(vUltima) || vUltima <= 0.01) {
    return [...partes, { key: novaChaveParte(), forma, valor: "" }];
  }
  const metade = Math.floor((vUltima * 100) / 2) / 100;
  return [
    ...partes.slice(0, -1),
    { ...ultima, valor: valorParaCampo(r2(vUltima - metade)) },
    { key: novaChaveParte(), forma, valor: valorParaCampo(metade) },
  ];
}

export type TotalForma = { forma: Forma; valor: number; taxa: number };

/** Quanto entrou em cada forma (e a taxa descontada), na ordem Pix, Dinheiro, Débito, Crédito. */
export function totaisPorForma(atendimentos: { pagamentos: Pagamento[] }[]): TotalForma[] {
  const m = new Map<Forma, { valor: number; taxa: number }>();
  for (const a of atendimentos) {
    for (const p of a.pagamentos) {
      const t = m.get(p.forma) ?? { valor: 0, taxa: 0 };
      m.set(p.forma, { valor: t.valor + p.valor, taxa: t.taxa + (p.valor * p.taxa_percentual) / 100 });
    }
  }
  return FORMAS.filter((f) => m.has(f.value)).map((f) => {
    const t = m.get(f.value)!;
    return { forma: f.value, valor: r2(t.valor), taxa: r2(t.taxa) };
  });
}
