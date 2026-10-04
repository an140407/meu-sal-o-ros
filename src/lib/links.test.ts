import { describe, expect, it } from "vitest";
import {
  linkGoogleAgenda, linkWhatsapp, linkWhatsappTexto, mensagemAniversario, mensagemRetorno, normalizarTelefone,
} from "./links";

describe("normalizarTelefone", () => {
  it.each([
    ["(11) 98765-4321", "5511987654321"],
    ["11 3456-7890", "551134567890"],
    ["11987654321", "5511987654321"],
    ["(55) 99999-8888", "5555999998888"], // DDD 55 (RS) sem DDI
  ])("prefixa 55 em número com DDD: %s", (tel, esperado) => {
    expect(normalizarTelefone(tel)).toBe(esperado);
  });

  it.each([
    ["+55 (11) 98765-4321", "5511987654321"],
    ["55 11 3456-7890", "551134567890"],
  ])("mantém número que já tem 55: %s", (tel, esperado) => {
    expect(normalizarTelefone(tel)).toBe(esperado);
  });

  it.each([null, undefined, "", "   ", "-", "98765-4321", "+1 415 555 0123 99", "441234567890", "5511987654321000"])(
    "retorna null para inválido: %s",
    (tel) => {
      expect(normalizarTelefone(tel)).toBeNull();
    },
  );
});

describe("linkWhatsapp", () => {
  const base = {
    telefone: "(11) 98765-4321",
    cliente: "Maria José D'Ávila",
    servico: "Manutenção de fibra",
    data: "2026-10-05",
    hora: "09:30:00",
  };

  it("monta a mensagem com primeiro nome, dia da semana, data e hora", () => {
    const url = new URL(linkWhatsapp(base)!);
    expect(url.origin + url.pathname).toBe("https://wa.me/5511987654321");
    expect(url.searchParams.get("text")).toBe(
      "Oi, Maria! Passando para confirmar seu horário de segunda, 05/10, às 09:30 (Manutenção de fibra). Pode confirmar?",
    );
  });

  it("codifica caracteres especiais", () => {
    const link = linkWhatsapp({ ...base, cliente: "  Ana  ", servico: "Gel & francesinha #2 / 50%?" })!;
    const texto = link.split("?text=")[1]!;
    expect(texto).not.toMatch(/[ &#?/%](?![0-9A-F]{2})/);
    expect(decodeURIComponent(texto)).toContain("Oi, Ana! ");
    expect(decodeURIComponent(texto)).toContain("(Gel & francesinha #2 / 50%?)");
  });

  it("retorna null sem telefone válido", () => {
    expect(linkWhatsapp({ ...base, telefone: null })).toBeNull();
    expect(linkWhatsapp({ ...base, telefone: "123" })).toBeNull();
  });
});

describe("linkGoogleAgenda", () => {
  const base = {
    servico: "Blindagem",
    cliente: "Ana Luíza",
    data: "2026-10-05",
    hora: "14:00:00",
    duracaoMin: 90,
    observacoes: null,
  };
  const params = (link: string | null) => new URL(link!).searchParams;

  it("monta o evento em hora local de São Paulo", () => {
    const link = linkGoogleAgenda(base)!;
    expect(link.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&")).toBe(true);
    const p = params(link);
    expect(p.get("text")).toBe("Blindagem — Ana Luíza");
    expect(p.get("dates")).toBe("20261005T140000/20261005T153000");
    expect(p.get("ctz")).toBe("America/Sao_Paulo");
    expect(p.has("details")).toBe(false);
  });

  it("avança a data quando o fim passa da meia-noite", () => {
    expect(params(linkGoogleAgenda({ ...base, hora: "23:30", duracaoMin: 60 })).get("dates")).toBe(
      "20261005T233000/20261006T003000",
    );
    expect(params(linkGoogleAgenda({ ...base, data: "2026-12-31", hora: "23:00", duracaoMin: 120 })).get("dates")).toBe(
      "20261231T230000/20270101T010000",
    );
  });

  it("codifica caracteres especiais em texto e detalhes", () => {
    const p = params(
      linkGoogleAgenda({ ...base, servico: "Gel & cia #1", cliente: "Zé D'Ávila", observacoes: "  Trazer esmalte 50%/100% & lixa?  " }),
    );
    expect(p.get("text")).toBe("Gel & cia #1 — Zé D'Ávila");
    expect(p.get("details")).toBe("Trazer esmalte 50%/100% & lixa?");
    expect(p.get("dates")).toBe("20261005T140000/20261005T153000");
  });

  it("retorna null sem horário", () => {
    expect(linkGoogleAgenda({ ...base, hora: null })).toBeNull();
  });
});

describe("mensagens de retorno e aniversário", () => {
  it("usam o primeiro nome", () => {
    expect(mensagemRetorno("  Ana Paula Souza ", 32)).toBe(
      "Oi, Ana! Já faz 32 dias do seu último atendimento. Vamos agendar sua manutenção?",
    );
    expect(mensagemAniversario("Júlia D'Ávila")).toBe("Parabéns, Júlia! Desejo um dia lindo para você.");
  });

  it("linkWhatsappTexto codifica e valida o telefone", () => {
    const url = new URL(linkWhatsappTexto("(11) 98765-4321", mensagemAniversario("Bia"))!);
    expect(url.pathname).toBe("/5511987654321");
    expect(url.searchParams.get("text")).toBe("Parabéns, Bia! Desejo um dia lindo para você.");
    expect(linkWhatsappTexto("", "oi")).toBeNull();
    expect(linkWhatsappTexto("(11) 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(linkWhatsappTexto("(11) 98765-4321", "")).toBe("https://wa.me/5511987654321");
  });
});
