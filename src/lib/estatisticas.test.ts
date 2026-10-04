import { describe, expect, it } from "vitest";
import { estatisticas, mesCurto, mesesPeriodo, type AtendimentoEstat } from "./estatisticas";

describe("mesesPeriodo", () => {
  it("lista os últimos n meses, virando o ano", () => {
    expect(mesesPeriodo("2026-10", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(mesesPeriodo("2027-02", 6)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesPeriodo("2026-12", 12)[0]).toBe("2026-01");
    expect(mesesPeriodo("2026-01", 1)).toEqual(["2026-01"]);
  });

  it("mesCurto", () => {
    expect(mesCurto("2026-10")).toBe("out/26");
    expect(mesCurto("2027-01")).toBe("jan/27");
  });
});

const at = (p: Partial<AtendimentoEstat> & { data: string }): AtendimentoEstat => ({
  status: "realizado",
  valor_bruto: 100,
  valor_liquido: 100,
  percentual_ana: 70,
  cliente_id: "c1",
  servico_id: "s1",
  clientes: { nome: "Ana" },
  servicos: { nome: "Gel" },
  ...p,
});

describe("estatisticas", () => {
  const meses = ["2026-09", "2026-10"];
  const hoje = "2026-10-31";

  it("soma dinheiro só dos realizados, por mês, e calcula ticket médio", () => {
    const e = estatisticas(
      [
        at({ data: "2026-09-05" }),
        at({ data: "2026-09-20", valor_bruto: 150, valor_liquido: "145.5", percentual_ana: 60 }),
        at({ data: "2026-10-01", valor_bruto: 80, valor_liquido: 80 }),
        at({ data: "2026-10-02", status: "agendado", valor_bruto: 999 }),
        at({ data: "2026-10-03", status: "cancelado", valor_bruto: 999 }),
        at({ data: "2026-08-31", valor_bruto: 999 }), // fora do período
      ],
      meses,
      hoje,
    );
    expect(e.porMes).toEqual([
      { mes: "2026-09", bruto: 250, ana: 157.3, qtd: 2 },
      { mes: "2026-10", bruto: 80, ana: 56, qtd: 1 },
    ]);
    expect(e.realizados).toBe(3);
    expect(e.bruto).toBe(330);
    expect(e.ana).toBe(213.3);
    expect(e.ticketMedio).toBe(110);
  });

  it("ranqueia serviços e clientes por quantidade, depois valor, limitado a 5", () => {
    const lista = [
      ...["s1", "s1", "s2", "s2", "s2", "s3", "s4", "s5", "s6", "s7"].map((s, i) =>
        at({ data: "2026-10-01", servico_id: s, servicos: { nome: s.toUpperCase() }, valor_bruto: i * 10, cliente_id: `c${i % 3}`, clientes: { nome: `C${i % 3}` } }),
      ),
      at({ data: "2026-10-01", servico_id: null, servicos: null, status: "faltou" }),
    ];
    const e = estatisticas(lista, meses, hoje);
    expect(e.topServicos.map((s) => [s.nome, s.qtd, s.valor])).toEqual([
      ["S2", 3, 90],
      ["S1", 2, 10],
      ["S7", 1, 90],
      ["S6", 1, 80],
      ["S5", 1, 70],
    ]);
    expect(e.topClientes.map((c) => [c.nome, c.qtd])).toEqual([["C0", 4], ["C2", 3], ["C1", 3]]);
  });

  it("taxa de faltas e cancelamentos só com registros até hoje", () => {
    const e = estatisticas(
      [
        at({ data: "2026-10-01" }),
        at({ data: "2026-10-02", status: "faltou" }),
        at({ data: "2026-10-03", status: "cancelado" }),
        at({ data: "2026-10-04", status: "agendado" }), // hoje: entra
        at({ data: "2026-10-05", status: "agendado" }), // futuro: fora do denominador
        at({ data: "2026-10-20", status: "cancelado" }), // futuro: fora também
        at({ data: "2026-07-01", status: "faltou" }), // fora do período
      ],
      meses,
      "2026-10-04",
    );
    expect([e.faltas, e.cancelados, e.totalAgendamentos, e.taxaFaltasCancelamentos]).toEqual([1, 1, 4, 0.5]);
  });

  it("período só com agendamentos futuros não tem taxa", () => {
    const e = estatisticas([at({ data: "2026-10-10", status: "agendado" })], meses, "2026-10-04");
    expect([e.totalAgendamentos, e.taxaFaltasCancelamentos]).toEqual([0, 0]);
  });

  it("período vazio", () => {
    const e = estatisticas([], meses, hoje);
    expect(e.realizados).toBe(0);
    expect(e.ticketMedio).toBe(0);
    expect(e.taxaFaltasCancelamentos).toBe(0);
    expect(e.porMes.map((m) => m.bruto)).toEqual([0, 0]);
  });
});
