import { describe, expect, it } from "vitest";
import { parseValor } from "./format";

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
