import { describe, expect, it } from "vitest";
import { resumoDespesas, SEM_CATEGORIA } from "./despesas";
import { buscaMes } from "./format";

describe("resumoDespesas", () => {
  it("soma total e subtotais na ordem das categorias", () => {
    const r = resumoDespesas([
      { categoria: "Outros", valor: 10 },
      { categoria: "Ferramentas", valor: "35.50" },
      { categoria: "Esmalte/gel", valor: 20 },
      { categoria: "Ferramentas", valor: 4.5 },
    ]);
    expect(r.total).toBe(70);
    expect(r.categorias).toEqual([
      { categoria: "Esmalte/gel", valor: 20 },
      { categoria: "Ferramentas", valor: 40 },
      { categoria: "Outros", valor: 10 },
    ]);
  });

  it("arredonda centavos", () => {
    const r = resumoDespesas([
      { categoria: "Descartáveis", valor: 0.1 },
      { categoria: "Descartáveis", valor: 0.2 },
    ]);
    expect(r.total).toBe(0.3);
    expect(r.categorias[0]?.valor).toBe(0.3);
  });

  it("agrupa sem categoria e categorias desconhecidas no fim", () => {
    const r = resumoDespesas([
      { categoria: null, valor: 5 },
      { categoria: "", valor: 1 },
      { categoria: "Fibra/acrílico", valor: 50 },
    ]);
    expect(r.categorias).toEqual([
      { categoria: "Fibra/acrílico", valor: 50 },
      { categoria: SEM_CATEGORIA, valor: 6 },
    ]);
  });

  it("mês sem despesas", () => {
    expect(resumoDespesas([])).toEqual({ total: 0, categorias: [] });
  });
});

describe("buscaMes", () => {
  it("aceita YYYY-MM válido", () => {
    expect(buscaMes({ mes: "2026-10" })).toEqual({ mes: "2026-10" });
    expect(buscaMes({ mes: "2027-01", outro: "x" })).toEqual({ mes: "2027-01" });
  });

  it.each([undefined, "", "2026-13", "2026-00", "2026-1", "10-2026", 202610, "2026-10-01"])(
    "ignora mês inválido: %s",
    (mes) => {
      expect(buscaMes({ mes })).toEqual({});
    },
  );
});
