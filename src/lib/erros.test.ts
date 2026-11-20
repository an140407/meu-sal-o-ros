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
  it("função que ainda não existe no banco avisa que falta o SQL", () => {
    expect(mensagemErro({ code: "PGRST202", message: "Could not find the function" }, "Erro")).toMatch(/SQL/);
    expect(mensagemErro({ code: "PGRST205", message: "Could not find the table 'public.bloqueios'" }, "Erro")).toMatch(/SQL/);
    expect(mensagemErro({ code: "42P01", message: 'relation "bloqueios" does not exist' }, "Erro")).toMatch(/SQL/);
  });
});
