import { describe, expect, it } from "vitest";
import { formatarDuracao, plural } from "./texto";

describe("plural", () => {
  it("singular só com 1", () => {
    expect(plural(1, "despesa", "despesas")).toBe("1 despesa");
    expect(plural(0, "despesa", "despesas")).toBe("0 despesas");
    expect(plural(12, "mês", "meses")).toBe("12 meses");
  });
});

describe("formatarDuracao", () => {
  it("minutos, horas cheias e quebradas", () => {
    expect(formatarDuracao(30)).toBe("30 min");
    expect(formatarDuracao(60)).toBe("1h");
    expect(formatarDuracao(90)).toBe("1h30");
    expect(formatarDuracao(125)).toBe("2h05");
  });
  it("valores inválidos", () => {
    expect(formatarDuracao(0)).toBe("0 min");
    expect(formatarDuracao(Number.NaN)).toBe("0 min");
  });
});
