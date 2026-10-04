import { describe, expect, it } from "vitest";
import { gradeMes, horariosLivres } from "./agenda";

const ag = (id: string, hora: string | null, duracao_min = 60, status = "agendado") => ({ id, hora, duracao_min, status });
const base = { inicioExpediente: "08:00", fimExpediente: "12:00", duracao: 60, agendamentos: [] as ReturnType<typeof ag>[] };

describe("horariosLivres", () => {
  it("dia vazio: passo de 30 min até caber a duração no expediente", () => {
    expect(horariosLivres(base)).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"]);
    expect(horariosLivres({ ...base, duracao: 90 })).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30"]);
  });

  it("dia cheio", () => {
    const agendamentos = [ag("1", "08:00:00", 120), ag("2", "10:00", 120)];
    expect(horariosLivres({ ...base, agendamentos })).toEqual([]);
  });

  it("não sobrepõe ativos e ignora cancelados, faltas e sem horário", () => {
    const agendamentos = [
      ag("1", "09:00", 60),
      ag("2", "10:30", 30, "realizado"),
      ag("3", "08:00", 240, "cancelado"),
      ag("4", "08:00", 240, "faltou"),
      ag("5", null, 240),
    ];
    expect(horariosLivres({ ...base, agendamentos })).toEqual(["08:00", "11:00"]);
  });

  it("borda do expediente: termina exatamente no fim, nunca depois", () => {
    expect(horariosLivres({ ...base, fimExpediente: "09:00", duracao: 60 })).toEqual(["08:00"]);
    expect(horariosLivres({ ...base, fimExpediente: "09:00", duracao: 61 })).toEqual([]);
    expect(horariosLivres({ ...base, inicioExpediente: "08:15", fimExpediente: "09:45", duracao: 30 })).toEqual([
      "08:15", "08:45", "09:15",
    ]);
    // agendamento terminando exatamente no início do slot não conflita
    expect(horariosLivres({ ...base, fimExpediente: "10:00", agendamentos: [ag("1", "08:00", 60)] })).toEqual(["09:00"]);
  });

  it("hoje: descarta horários já passados", () => {
    expect(horariosLivres({ ...base, agora: "09:10" })).toEqual(["09:30", "10:00", "10:30", "11:00"]);
    expect(horariosLivres({ ...base, agora: "09:30" })).toEqual(["09:30", "10:00", "10:30", "11:00"]);
    expect(horariosLivres({ ...base, agora: "12:00" })).toEqual([]);
  });

  it("edição: ignora o próprio atendimento", () => {
    const agendamentos = [ag("eu", "09:00", 60), ag("outro", "10:00", 120)];
    expect(horariosLivres({ ...base, agendamentos })).toEqual(["08:00"]);
    expect(horariosLivres({ ...base, agendamentos, ignorarId: "eu" })).toEqual(["08:00", "08:30", "09:00"]);
  });

  it("duração inválida", () => {
    expect(horariosLivres({ ...base, duracao: Number.NaN })).toEqual([]);
    expect(horariosLivres({ ...base, duracao: 0 })).toEqual([]);
  });
});

describe("gradeMes", () => {
  it("inclui as semanas parciais (seg–dom)", () => {
    const g = gradeMes("2026-10"); // 1/out/2026 é quinta; 31/out é sábado
    expect(g[0]).toBe("2026-09-28");
    expect(g[g.length - 1]).toBe("2026-11-01");
    expect(g).toHaveLength(35);
  });

  it("mês que começa na segunda e vira o ano", () => {
    const g = gradeMes("2027-02"); // 1/fev/2027 é segunda; 28/fev é domingo
    expect(g[0]).toBe("2027-02-01");
    expect(g).toHaveLength(28);
    const d = gradeMes("2026-12");
    expect(d[0]).toBe("2026-11-30");
    expect(d[d.length - 1]).toBe("2027-01-03");
  });
});
