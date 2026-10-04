import { describe, expect, it } from "vitest";
import { saldoPorMes } from "./acerto";

describe("saldoPorMes", () => {
  const atend = (data: string, liquido: number, pct = 70) => ({ data, valor_liquido: liquido, percentual_ana: pct });

  it("calcula parte da Ana − repassado por mês anterior, do mais recente ao mais antigo", () => {
    const r = saldoPorMes(
      [atend("2026-08-03", 100), atend("2026-08-20", "50" as unknown as number), atend("2026-09-01", 200, 60), atend("2026-10-02", 999)],
      [
        { mes_referencia: "2026-08", valor: 100 },
        { mes_referencia: "2026-09", valor: "150" },
        { mes_referencia: "2026-07", valor: 30 },
        { mes_referencia: "2026-10", valor: 10 },
      ],
      "2026-10",
    );
    expect(r.meses).toEqual([
      { mes: "2026-09", ana: 120, repassado: 150, saldo: -30 },
      { mes: "2026-08", ana: 105, repassado: 100, saldo: 5 },
      { mes: "2026-07", ana: 0, repassado: 30, saldo: -30 },
    ]);
    expect(r.total).toBe(-55);
  });

  it("arredonda centavos como o Acerto", () => {
    const r = saldoPorMes([atend("2026-09-01", 33.33), atend("2026-09-02", 33.33)], [], "2026-10");
    expect(r.meses[0]).toEqual({ mes: "2026-09", ana: 46.66, repassado: 0, saldo: 46.66 });
  });

  it("ignora o mês selecionado e os posteriores", () => {
    expect(saldoPorMes([atend("2026-10-01", 100), atend("2026-11-01", 100)], [], "2026-10")).toEqual({ meses: [], total: 0 });
  });
});
