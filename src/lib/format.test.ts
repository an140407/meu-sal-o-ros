import { describe, expect, it } from "vitest";
import { horaDoInstante, inicioSemana, parseValor } from "./format";

describe("parseValor", () => {
  it.each([
    ["90", 90],
    ["90,5", 90.5],
    ["R$ 90,00", 90],
    ["R$90,00", 90],
    ["1.234,56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["12.345.678,9", 12345678.9],
    ["1.234", 1234],
    ["90.50", 90.5],
    ["0,99", 0.99],
    [" 150 ", 150],
    ["r$\u00a070", 70],
    ["0", 0],
  ])("%s → %s", (texto, esperado) => {
    expect(parseValor(texto)).toBe(esperado);
  });

  it.each(["", "   ", "R$", "abc", "-10", "10,", ",5", "1,2,3", "12.34,5", "1.234.5", "10 reais", null, undefined])(
    "inválido: %s",
    (texto) => {
      expect(parseValor(texto)).toBeNaN();
    },
  );
});

describe("inicioSemana", () => {
  it("volta até o domingo (o próprio domingo fica)", () => {
    expect(inicioSemana("2026-11-13")).toBe("2026-11-08"); // sexta → domingo 8/11
    expect(inicioSemana("2026-11-08")).toBe("2026-11-08"); // domingo
    expect(inicioSemana("2026-11-14")).toBe("2026-11-08"); // sábado
    expect(inicioSemana("2027-01-02")).toBe("2026-12-27"); // vira o ano
  });
});

describe("horaDoInstante", () => {
  it("converte para o horário de São Paulo", () => {
    expect(horaDoInstante("2026-11-15T22:40:00Z")).toBe("19:40");
    expect(horaDoInstante("2026-11-16T02:05:00+00:00")).toBe("23:05");
    expect(horaDoInstante(null)).toBe("");
  });
});
