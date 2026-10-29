import { describe, expect, it } from "vitest";
import { mensagemErro } from "./erros";

describe("mensagemErro", () => {
  it("usa a mensagem das funções do banco", () => {
    expect(mensagemErro({ code: "P0001", message: "Informe de 1 a 60 datas" }, "Erro")).toBe("Informe de 1 a 60 datas");
  });
  it("erros técnicos viram o texto padrão", () => {
    expect(mensagemErro({ code: "42501", message: "permission denied" }, "Não foi possível salvar.")).toBe("Não foi possível salvar.");
    expect(mensagemErro(new Error("Failed to fetch"), "Não foi possível salvar.")).toBe("Não foi possível salvar.");
    expect(mensagemErro(null, "Padrão")).toBe("Padrão");
  });
});
