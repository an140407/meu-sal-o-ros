import { describe, expect, it } from "vitest";
import { clientesParaRetorno, ehAniversarioNoMes } from "./clientes";
import { diasDesde } from "./format";

describe("diasDesde", () => {
  it("conta dias de calendário", () => {
    expect(diasDesde("2026-10-04", "2026-10-04")).toBe(0);
    expect(diasDesde("2026-10-01", "2026-10-22")).toBe(21);
    expect(diasDesde("2026-12-20", "2027-01-10")).toBe(21);
    expect(diasDesde("2028-02-28", "2028-03-01")).toBe(2); // ano bissexto
    expect(diasDesde("2026-10-10", "2026-10-04")).toBe(-6);
  });
});

describe("ehAniversarioNoMes", () => {
  it("compara só o mês, tratando a data como texto", () => {
    expect(ehAniversarioNoMes("1990-10-01", "2026-10-15")).toBe(true);
    expect(ehAniversarioNoMes("1990-10-31", "2026-10-01")).toBe(true);
    expect(ehAniversarioNoMes("1990-11-01", "2026-10-31")).toBe(false);
    expect(ehAniversarioNoMes("1990-09-30", "2026-10-01")).toBe(false);
  });

  it("sem data ou formato inválido", () => {
    expect(ehAniversarioNoMes(null, "2026-10-04")).toBe(false);
    expect(ehAniversarioNoMes(undefined, "2026-10-04")).toBe(false);
    expect(ehAniversarioNoMes("", "2026-10-04")).toBe(false);
    expect(ehAniversarioNoMes("01/10/1990", "2026-10-04")).toBe(false);
  });
});

describe("clientesParaRetorno", () => {
  const clientes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const realizados = [
    { cliente_id: "a", data: "2026-09-01", servico: "Fibra" },
    { cliente_id: "a", data: "2026-09-10", servico: "Manutenção de fibra" },
    { cliente_id: "b", data: "2026-08-01", servico: "Blindagem" },
    { cliente_id: "c", data: "2026-09-30", servico: "Gel" },
  ];

  it("filtra pela última visita, ignora quem tem agendamento futuro e ordena por dias", () => {
    const r = clientesParaRetorno(clientes, realizados, new Set(), "2026-10-04", 21);
    expect(r.map((x) => [x.cliente.id, x.dias, x.ultimoServico])).toEqual([
      ["b", 64, "Blindagem"],
      ["a", 24, "Manutenção de fibra"],
    ]);
    expect(clientesParaRetorno(clientes, realizados, new Set(["b"]), "2026-10-04", 21).map((x) => x.cliente.id)).toEqual(["a"]);
  });

  it("usa 'mais de N dias' (exatamente N fica de fora)", () => {
    expect(clientesParaRetorno(clientes, realizados, new Set(), "2026-10-01", 21).map((x) => x.cliente.id)).toEqual(["b"]);
    expect(clientesParaRetorno(clientes, realizados, new Set(), "2026-10-02", 21).map((x) => x.cliente.id)).toEqual(["b", "a"]);
  });
});
