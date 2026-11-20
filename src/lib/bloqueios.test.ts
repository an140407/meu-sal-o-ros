import { describe, expect, it } from "vitest";
import {
  bloqueioQueImpede, cobre, datasBloqueadas, descreverRepeticao, erroHoras, gerarRepeticao, horarioDoBloqueio,
  novaSerieId, posicaoNoMes, pularBloqueios, textoImpedimento, textoMensal, tituloBloqueio, type Bloqueio, type Repeticao,
} from "./bloqueios";

const bl = (data: string, ini: string | null, fim: string | null, descricao: string | null = null, id = `${data}-${ini}`): Bloqueio =>
  ({ id, data, hora_inicio: ini, hora_fim: fim, descricao, serie_id: null });

// 20/11/2026 é sexta-feira.
const consulta = bl("2026-11-20", "14:00:00", "15:00:00", "Consulta");
const folga = bl("2026-11-21", null, null, "Folga");

describe("cobre (mesma regra do banco)", () => {
  const em = (hora: string | null, duracao = 60, data = "2026-11-20") => cobre(consulta, { data, hora, duracao });
  it("cruza, encosta e engloba", () => {
    expect(em("13:30")).toBe(true);
    expect(em("13:00")).toBe(false); // termina 14:00, quando o bloqueio começa
    expect(em("15:00")).toBe(false); // começa quando o bloqueio termina
    expect(em("14:45", 15)).toBe(true);
    expect(em("12:00", 240)).toBe(true);
  });
  it("outro dia, sem hora e duração desconhecida", () => {
    expect(em("14:00", 60, "2026-11-27")).toBe(false);
    expect(em(null)).toBe(false);
    expect(em("14:30", Number.NaN)).toBe(true);
    expect(em("13:59", Number.NaN)).toBe(false);
  });
  it("dia inteiro cobre qualquer hora (e sem hora)", () => {
    expect(cobre(folga, { data: "2026-11-21", hora: "07:00", duracao: 30 })).toBe(true);
    expect(cobre(folga, { data: "2026-11-21", hora: null, duracao: 30 })).toBe(true);
    expect(cobre(folga, { data: "2026-11-22", hora: "07:00", duracao: 30 })).toBe(false);
  });
});

describe("bloqueioQueImpede", () => {
  const manha = bl("2026-11-25", "09:00", "12:00", "Curso");
  const tarde = bl("2026-11-25", "14:00", "15:00");
  it("dia inteiro vem primeiro", () => {
    const dia = bl("2026-11-25", null, null, "Viagem");
    expect(bloqueioQueImpede([tarde, manha, dia], { data: "2026-11-25", hora: "09:00", duracao: 60 })).toBe(dia);
  });
  it("quem já estava dentro do bloqueio pode se ajustar nele; entrar em outro, não", () => {
    const antes = { data: "2026-11-25", hora: "09:00", duracao: 60 };
    expect(bloqueioQueImpede([manha, tarde], { data: "2026-11-25", hora: "10:00", duracao: 90 }, antes)).toBeNull();
    expect(bloqueioQueImpede([manha, tarde], { data: "2026-11-25", hora: "14:00", duracao: 60 }, antes)).toBe(tarde);
    // saiu do bloqueio e quer voltar: agora conta
    const fora = { data: "2026-11-25", hora: "13:00", duracao: 60 };
    expect(bloqueioQueImpede([manha, tarde], { data: "2026-11-25", hora: "11:00", duracao: 60 }, fora)).toBe(manha);
  });
  it("livre", () => {
    expect(bloqueioQueImpede([manha, tarde], { data: "2026-11-25", hora: "12:00", duracao: 120 })).toBeNull();
  });
});

describe("datasBloqueadas", () => {
  it("mapeia só as datas em que o horário cai num bloqueio", () => {
    const sem = bl("2026-11-22", "10:00", "11:00");
    const m = datasBloqueadas(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"], "14:30", 60, [consulta, folga, sem]);
    expect([...m.keys()]).toEqual(["2026-11-20", "2026-11-21"]);
    expect(m.get("2026-11-21")).toBe(folga);
  });
});

describe("textos", () => {
  it("iguais às mensagens do banco", () => {
    expect(textoImpedimento(consulta)).toBe("Horário bloqueado em 20/11, das 14:00 às 15:00 (Consulta)");
    expect(textoImpedimento(folga)).toBe("Dia 21/11 está bloqueado (Folga)");
    expect(textoImpedimento(bl("2026-11-22", "10:00:00", "11:00:00", "  "))).toBe("Horário bloqueado em 22/11, das 10:00 às 11:00");
    expect(textoImpedimento(bl("2026-12-10", null, null))).toBe("Dia 10/12 está bloqueado");
  });
  it("horário e título", () => {
    expect(horarioDoBloqueio(consulta)).toBe("14:00–15:00");
    expect(horarioDoBloqueio(folga)).toBe("Dia inteiro");
    expect(tituloBloqueio(consulta)).toBe("Consulta");
    expect(tituloBloqueio(bl("2026-11-22", null, null, " "))).toBe("Bloqueado");
  });
  it("erroHoras", () => {
    expect(erroHoras(true, "", "")).toBeNull();
    expect(erroHoras(false, "14:00", "15:00")).toBeNull();
    expect(erroHoras(false, "14:00", "")).toMatch(/Informe/);
    expect(erroHoras(false, "14:00", "14:00")).toMatch(/depois/);
    expect(erroHoras(false, "15:00", "14:00")).toMatch(/depois/);
  });
});

describe("pularBloqueios (hora sugerida)", () => {
  const bs = [bl("d", "10:00", "11:00"), bl("d", "11:00", "12:00"), bl("d", null, null)];
  it("pula bloqueios encadeados e ignora dia inteiro", () => {
    expect(pularBloqueios(600, bs)).toBe(720);
    expect(pularBloqueios(659, bs)).toBe(720);
    expect(pularBloqueios(570, bs)).toBe(570);
    expect(pularBloqueios(720, bs)).toBe(720);
  });
});

const rep = (o: Partial<Repeticao>): Repeticao => ({
  inicio: "2026-11-20", frequencia: "diaria", diasSemana: [5], cadaSemanas: 1, mensal: "dia", cadaDias: 2,
  termina: "vezes", vezes: 4, ate: "", ...o,
});
const datas = (o: Partial<Repeticao>) => gerarRepeticao(rep(o)).datas;

describe("gerarRepeticao", () => {
  it("todo dia e seg a sex (começando numa sexta)", () => {
    expect(datas({ vezes: 3 })).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(datas({ frequencia: "uteis" })).toEqual(["2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"]);
  });
  it("toda semana em vários dias, sem incluir o início se não for um deles", () => {
    expect(datas({ frequencia: "semanal", diasSemana: [4, 2] })).toEqual(["2026-11-24", "2026-11-26", "2026-12-01", "2026-12-03"]);
  });
  it("a cada 2 semanas conta a partir da semana do início", () => {
    expect(datas({ frequencia: "semanal", diasSemana: [5], cadaSemanas: 2, vezes: 3 })).toEqual(["2026-11-20", "2026-12-04", "2026-12-18"]);
    expect(datas({ frequencia: "semanal", diasSemana: [1, 5], cadaSemanas: 2, vezes: 5 })).toEqual([
      "2026-11-20", "2026-11-30", "2026-12-04", "2026-12-14", "2026-12-18",
    ]);
  });
  it("semanal sem dia escolhido não gera nada (e não trava)", () => {
    expect(datas({ frequencia: "semanal", diasSemana: [] })).toEqual([]);
  });
  it("todo mês no mesmo dia pula mês que não tem o dia", () => {
    expect(datas({ inicio: "2027-01-31", frequencia: "mensal", mensal: "dia" })).toEqual(["2027-01-31", "2027-03-31", "2027-05-31", "2027-07-31"]);
  });
  it("todo mês na mesma posição do dia da semana (3ª sexta, último domingo)", () => {
    expect(datas({ frequencia: "mensal", mensal: "semana", vezes: 3 })).toEqual(["2026-11-20", "2026-12-18", "2027-01-15"]);
    expect(datas({ inicio: "2026-11-29", frequencia: "mensal", mensal: "semana", vezes: 3 })).toEqual(["2026-11-29", "2026-12-27", "2027-01-31"]);
  });
  it("a cada X dias", () => {
    expect(datas({ frequencia: "intervalo", cadaDias: 10, vezes: 3 })).toEqual(["2026-11-20", "2026-11-30", "2026-12-10"]);
  });
  it("termina numa data (inclusive) e corta em 60", () => {
    expect(gerarRepeticao(rep({ termina: "data", ate: "2026-11-23" }))).toEqual({
      datas: ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"], cortado: false,
    });
    const longo = gerarRepeticao(rep({ termina: "data", ate: "2027-12-31" }));
    expect(longo.datas).toHaveLength(60);
    expect(longo.datas.at(-1)).toBe("2027-01-18");
    expect(longo.cortado).toBe(true);
    expect(gerarRepeticao(rep({ termina: "data", ate: "2027-01-18" })).cortado).toBe(false);
    expect(datas({ termina: "data", ate: "2026-11-19" })).toEqual([]);
    expect(datas({ termina: "data", ate: "" })).toEqual([]);
  });
  it("vezes fica entre 1 e 60", () => {
    expect(datas({ vezes: 0 })).toHaveLength(1);
    expect(datas({ vezes: 500 })).toHaveLength(60);
    expect(datas({ vezes: Number.NaN })).toHaveLength(1);
  });
});

describe("textos da repetição", () => {
  it("posição no mês", () => {
    expect(posicaoNoMes("2026-11-20")).toEqual({ n: 3, ultima: false });
    expect(posicaoNoMes("2026-11-27")).toEqual({ n: 4, ultima: true });
    expect(posicaoNoMes("2026-11-29")).toEqual({ n: 5, ultima: true });
  });
  it("mensal", () => {
    expect(textoMensal("2026-11-20", "dia")).toBe("No dia 20 de cada mês");
    expect(textoMensal("2026-11-20", "semana")).toBe("Na 3ª sexta de cada mês");
    expect(textoMensal("2026-11-21", "semana")).toBe("No 3º sábado de cada mês");
    expect(textoMensal("2026-11-29", "semana")).toBe("No último domingo de cada mês");
  });
  it("resumo da regra", () => {
    expect(descreverRepeticao(rep({ frequencia: "semanal", diasSemana: [4, 2] }))).toBe("Toda semana: ter e qui");
    expect(descreverRepeticao(rep({ frequencia: "semanal", diasSemana: [5, 1, 3], cadaSemanas: 2 }))).toBe("A cada 2 semanas: seg, qua e sex");
    expect(descreverRepeticao(rep({ frequencia: "semanal", diasSemana: [0, 1, 2, 3, 4, 5, 6] }))).toBe("Toda semana: todos os dias");
    expect(descreverRepeticao(rep({ frequencia: "uteis" }))).toBe("De segunda a sexta");
    expect(descreverRepeticao(rep({ frequencia: "intervalo", cadaDias: 10 }))).toBe("A cada 10 dias");
    expect(descreverRepeticao(rep({ frequencia: "mensal", mensal: "semana" }))).toBe("Na 3ª sexta de cada mês");
  });
});

describe("novaSerieId", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it("uuid v4, também sem crypto.randomUUID", () => {
    expect(novaSerieId()).toMatch(UUID);
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = novaSerieId();
      expect(a).toMatch(UUID);
      expect(novaSerieId()).not.toBe(a);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
