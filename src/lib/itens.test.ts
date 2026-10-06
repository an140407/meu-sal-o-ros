import { describe, expect, it } from "vitest";
import {
  agregarPorServico, itensDoAtendimento, limitarDuracao, nomesItens, somaItens, totaisForm, validarItens,
  type ItemForm,
} from "./itens";

const base = { servicos: { nome: "Blindagem" }, servico_id: "s1", valor_bruto: "100", duracao_min: 60 };

describe("itensDoAtendimento", () => {
  it("ordena os itens por ordem", () => {
    const itens = itensDoAtendimento({
      ...base,
      atendimento_servicos: [
        { servico_id: "s2", nome: "Gel", valor: 50, duracao_min: 30, ordem: 1 },
        { servico_id: "s1", nome: "Fibra", valor: "120" as unknown as number, duracao_min: 90, ordem: 0 },
      ],
    });
    expect(itens).toEqual([
      { servico_id: "s1", nome: "Fibra", valor: 120, duracao_min: 90 },
      { servico_id: "s2", nome: "Gel", valor: 50, duracao_min: 30 },
    ]);
  });

  it("sem itens vira um item com servicos(nome) e valor_bruto", () => {
    expect(itensDoAtendimento({ ...base, atendimento_servicos: [] })).toEqual([
      { servico_id: "s1", nome: "Blindagem", valor: 100, duracao_min: 60 },
    ]);
    expect(itensDoAtendimento({ ...base, servicos: null, servico_id: null, atendimento_servicos: null })[0]?.nome).toBe("Serviço");
  });
});

describe("somaItens e nomesItens", () => {
  it("soma valores com centavos e durações", () => {
    expect(somaItens([{ valor: 0.1, duracao_min: 30 }, { valor: 0.2, duracao_min: 45 }])).toEqual({ valor: 0.3, duracao: 75 });
    expect(somaItens([])).toEqual({ valor: 0, duracao: 0 });
  });

  it("une nomes com +", () => {
    expect(nomesItens([{ nome: "Fibra" }, { nome: "Gel" }])).toBe("Fibra + Gel");
    expect(nomesItens([{ nome: "Fibra" }])).toBe("Fibra");
    expect(nomesItens([])).toBe("Serviço");
  });
});

describe("limitarDuracao", () => {
  it("limita a 15–480 e avisa", () => {
    expect(limitarDuracao(90)).toEqual({ duracao: 90, ajustada: false });
    expect(limitarDuracao(10)).toEqual({ duracao: 15, ajustada: true });
    expect(limitarDuracao(600)).toEqual({ duracao: 480, ajustada: true });
  });
});

describe("agregarPorServico", () => {
  it("conta itens e soma valores por serviço", () => {
    const r = agregarPorServico([
      { servico_id: "s1", nome: "Fibra", valor: 100, duracao_min: 60 },
      { servico_id: "s2", nome: "Gel", valor: 40, duracao_min: 30 },
      { servico_id: "s1", nome: "Fibra", valor: 120.5, duracao_min: 60 },
      { servico_id: null, nome: "Avulso", valor: 10, duracao_min: 15 },
      { servico_id: "s2", nome: "Gel", valor: 0.1, duracao_min: 30 },
      { servico_id: "s2", nome: "Gel", valor: 0.2, duracao_min: 30 },
    ]);
    expect(r.map((x) => [x.nome, x.qtd, x.valor])).toEqual([
      ["Gel", 3, 40.3],
      ["Fibra", 2, 220.5],
      ["Avulso", 1, 10],
    ]);
  });

  it("limita o ranking", () => {
    const itens = ["a", "b", "c", "d", "e", "f"].map((id) => ({ servico_id: id, nome: id, valor: 1, duracao_min: 15 }));
    expect(agregarPorServico(itens)).toHaveLength(5);
  });
});

describe("validarItens e totaisForm", () => {
  const item = (p: Partial<ItemForm>): ItemForm => ({ key: "k", servico_id: "s1", nome: "Fibra", valor: "100", duracao: "60", ...p });

  it("exige pelo menos um item", () => {
    expect(validarItens([])).toEqual({ erro: "Adicione pelo menos um serviço." });
  });

  it("converte valores com parseValor e valida duração", () => {
    expect(validarItens([item({ valor: "R$ 1.234,56" }), item({ nome: "Gel", valor: "0", duracao: "5" })])).toEqual({
      itens: [
        { servico_id: "s1", nome: "Fibra", valor: 1234.56, duracao_min: 60 },
        { servico_id: "s1", nome: "Gel", valor: 0, duracao_min: 5 },
      ],
    });
    expect(validarItens([item({ valor: "abc" })])).toEqual({ erro: 'Valor inválido em "Fibra".' });
    expect(validarItens([item({ duracao: "4" })])).toHaveProperty("erro");
    expect(validarItens([item({ duracao: "481" })])).toHaveProperty("erro");
    expect(validarItens([item({ duracao: "30,5" })])).toHaveProperty("erro");
  });

  it("totais tratam campos inválidos como zero", () => {
    expect(totaisForm([item({ valor: "90,5" }), item({ valor: "x", duracao: "" })])).toEqual({ valor: 90.5, duracao: 60 });
  });
});
