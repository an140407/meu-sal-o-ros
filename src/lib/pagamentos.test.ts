import { describe, expect, it } from "vitest";
import {
  dividirPagamento, formaPrincipal, formasLabel, pagamentosDoAtendimento, partesIniciais, partesTexto,
  resumoPagamentos, totaisPorForma, validarPagamentos, type ParteForm,
} from "./pagamentos";

const taxas = { debito: 1.99, credito: 4.98 };
/** Intl usa espaço não separável entre "R$" e o número. */
const sp = (s: string) => s.replace(/\u00a0/g, " ");
const parte = (forma: ParteForm["forma"], valor: string, key: string = forma): ParteForm => ({ key, forma, valor });

describe("pagamentosDoAtendimento", () => {
  it("ordena as partes gravadas", () => {
    const p = pagamentosDoAtendimento({
      forma_pagamento: "pix", valor_bruto: 150, taxa_percentual: 0,
      atendimento_pagamentos: [
        { forma: "credito", valor: "80", taxa_percentual: "4.98", ordem: 1 },
        { forma: "pix", valor: 70, taxa_percentual: 0, ordem: 0 },
      ],
    });
    expect(p).toEqual([
      { forma: "pix", valor: 70, taxa_percentual: 0 },
      { forma: "credito", valor: 80, taxa_percentual: 4.98 },
    ]);
  });
  it("concluído antigo sem partes vira uma parte com a forma e o bruto", () => {
    expect(pagamentosDoAtendimento({ forma_pagamento: "credito", valor_bruto: "100", taxa_percentual: "4", atendimento_pagamentos: [] }))
      .toEqual([{ forma: "credito", valor: 100, taxa_percentual: 4 }]);
  });
  it("serviço grátis não tem parte", () => {
    expect(pagamentosDoAtendimento({ forma_pagamento: "pix", valor_bruto: 0, taxa_percentual: 0 })).toEqual([]);
  });
});

describe("rótulos", () => {
  it("une formas sem repetir", () => {
    expect(formasLabel([{ forma: "pix" }, { forma: "credito" }, { forma: "pix" }])).toBe("Pix + Crédito");
    expect(formasLabel([])).toBe("Sem cobrança");
  });
  it("lista as partes com valores", () => {
    expect(sp(partesTexto([{ forma: "pix", valor: 70 }, { forma: "credito", valor: 80 }]))).toBe("Pix R$ 70,00 + Crédito R$ 80,00");
  });
  it("forma principal é a de maior valor; empate fica com a primeira", () => {
    expect(formaPrincipal([{ forma: "pix", valor: 70 }, { forma: "credito", valor: 80 }])).toBe("credito");
    expect(formaPrincipal([{ forma: "pix", valor: 50 }, { forma: "credito", valor: 50 }])).toBe("pix");
  });
});

describe("partesIniciais", () => {
  it("sem partes, começa com Pix no total", () => {
    const [p] = partesIniciais([], 150);
    expect(p).toMatchObject({ forma: "pix", valor: "150,00" });
  });
  it("carrega as partes gravadas", () => {
    expect(partesIniciais([{ forma: "dinheiro", valor: 20.5 }], 20.5).map((p) => p.valor)).toEqual(["20,50"]);
  });
});

describe("resumoPagamentos", () => {
  it("fecha e calcula taxa e líquido", () => {
    const r = resumoPagamentos([parte("pix", "70"), parte("credito", "80,00")], 150, taxas);
    expect(r).toMatchObject({ soma: 150, diferenca: 0, fechou: true, invalida: false, taxas: 3.98, liquido: 146.02 });
  });
  it("aponta quanto falta e quanto passou", () => {
    expect(resumoPagamentos([parte("pix", "60")], 150, taxas)).toMatchObject({ fechou: false, diferenca: 90 });
    expect(resumoPagamentos([parte("pix", "160")], 150, taxas)).toMatchObject({ fechou: false, diferenca: -10 });
  });
  it("compara em centavos (0,1 + 0,2)", () => {
    expect(resumoPagamentos([parte("pix", "0,1"), parte("dinheiro", "0,2")], 0.3, taxas).fechou).toBe(true);
  });
  it("valor vazio não fecha", () => {
    expect(resumoPagamentos([parte("pix", "150"), parte("credito", "")], 150, taxas)).toMatchObject({ fechou: false, invalida: true });
  });
});

describe("validarPagamentos", () => {
  it("devolve as partes quando fecham", () => {
    expect(validarPagamentos([parte("pix", "R$ 70,00"), parte("credito", "80")], 150))
      .toEqual({ pagamentos: [{ forma: "pix", valor: 70 }, { forma: "credito", valor: 80 }] });
  });
  it("total zero dispensa pagamento", () => {
    expect(validarPagamentos([parte("pix", "")], 0)).toEqual({ pagamentos: [] });
  });
  it("mensagens de falta, excesso e valor inválido", () => {
    const erro = (r: ReturnType<typeof validarPagamentos>) => ("erro" in r ? sp(r.erro) : "");
    expect(erro(validarPagamentos([parte("pix", "100")], 150))).toBe("Faltam R$ 50,00 para fechar o total.");
    expect(erro(validarPagamentos([parte("pix", "200")], 150))).toBe("Os pagamentos passaram R$ 50,00 do total.");
    expect(validarPagamentos([parte("credito", "0")], 150)).toEqual({ erro: "Valor inválido no Crédito." });
    expect(validarPagamentos([], 150)).toEqual({ erro: "Informe a forma de pagamento." });
  });
});

describe("dividirPagamento", () => {
  it("acrescenta o que falta com a próxima forma livre", () => {
    const r = dividirPagamento([parte("pix", "100")], 150);
    expect(r.map((p) => [p.forma, p.valor])).toEqual([["pix", "100"], ["dinheiro", "50,00"]]);
  });
  it("sem falta, divide a última ao meio (centavo extra fica na primeira)", () => {
    const r = dividirPagamento([parte("pix", "150,01")], 150.01);
    expect(r.map((p) => [p.forma, p.valor])).toEqual([["pix", "75,01"], ["dinheiro", "75,00"]]);
  });
  it("no máximo 4 partes", () => {
    const quatro = [parte("pix", "1", "a"), parte("dinheiro", "1", "b"), parte("debito", "1", "c"), parte("credito", "1", "d")];
    expect(dividirPagamento(quatro, 4)).toBe(quatro);
  });
});

describe("totaisPorForma", () => {
  it("soma por forma na ordem fixa, com a taxa gravada", () => {
    const r = totaisPorForma([
      { pagamentos: [{ forma: "credito", valor: 80, taxa_percentual: 4.98 }, { forma: "pix", valor: 70, taxa_percentual: 0 }] },
      { pagamentos: [{ forma: "credito", valor: 100, taxa_percentual: 4 }, { forma: "debito", valor: 50, taxa_percentual: 1.99 }] },
      { pagamentos: [] },
    ]);
    expect(r).toEqual([
      { forma: "pix", valor: 70, taxa: 0 },
      { forma: "debito", valor: 50, taxa: 1 },
      { forma: "credito", valor: 180, taxa: 7.98 },
    ]);
  });
});
