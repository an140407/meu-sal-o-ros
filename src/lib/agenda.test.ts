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

  it("bloqueio com horário ocupa como um agendamento; dia inteiro bloqueado não tem horário", () => {
    const bloqueios = [{ hora_inicio: "09:00:00", hora_fim: "10:00:00" }];
    expect(horariosLivres({ ...base, bloqueios })).toEqual(["08:00", "10:00", "10:30", "11:00"]);
    expect(horariosLivres({ ...base, bloqueios, agendamentos: [ag("1", "10:30", 30)] })).toEqual(["08:00", "11:00"]);
    expect(horariosLivres({ ...base, bloqueios: [...bloqueios, { hora_inicio: null, hora_fim: null }] })).toEqual([]);
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
  it("inclui as semanas parciais (dom–sáb)", () => {
    const g = gradeMes("2026-10"); // 1/out/2026 é quinta; 31/out é sábado
    expect(g[0]).toBe("2026-09-27");
    expect(g[g.length - 1]).toBe("2026-10-31");
    expect(g).toHaveLength(35);
  });

  it("mês que começa no domingo, mês de 6 semanas e virada de ano", () => {
    const n = gradeMes("2026-11"); // 1/nov/2026 é domingo; 30/nov é segunda
    expect(n[0]).toBe("2026-11-01");
    expect(n[n.length - 1]).toBe("2026-12-05");
    expect(n).toHaveLength(35);
    const a = gradeMes("2026-08"); // 1/ago/2026 é sábado → 6 semanas
    expect(a[0]).toBe("2026-07-26");
    expect(a).toHaveLength(42);
    const d = gradeMes("2026-12");
    expect(d[0]).toBe("2026-11-29");
    expect(d[d.length - 1]).toBe("2027-01-02");
  });

  it("toda semana da grade começa no domingo", () => {
    for (const mes of ["2026-01", "2026-02", "2026-11", "2027-02"]) {
      const g = gradeMes(mes);
      expect(g.length % 7).toBe(0);
      for (let i = 0; i < g.length; i += 7) expect(new Date(`${g[i]}T12:00:00Z`).getUTCDay()).toBe(0);
    }
  });
});
