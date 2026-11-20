import { describe, expect, it } from "vitest";
import {
  conflitosDasDatas, gerarDatas, intervaloDaSerie, intervaloValido, planoRemarcacao, planoReorganizacao, posicaoNaSerie, proximosDaSerie,
  resumoSerie, textoDeslocamento,
  type Membro, type Ocupado,
} from "./recorrencia";

describe("gerarDatas", () => {
  it("gera de 21 em 21 dias atravessando mês e ano", () => {
    expect(gerarDatas("2026-11-27", 21, 4)).toEqual(["2026-11-27", "2026-12-18", "2027-01-08", "2027-01-29"]);
  });
  it("respeita fevereiro de ano bissexto", () => {
    expect(gerarDatas("2028-02-15", 14, 2)).toEqual(["2028-02-15", "2028-02-29"]);
  });
  it("limita a 60 vezes e no mínimo 1; intervalo mínimo 1", () => {
    expect(gerarDatas("2026-11-01", 7, 500)).toHaveLength(60);
    expect(gerarDatas("2026-11-01", 7, 0)).toEqual(["2026-11-01"]);
    expect(gerarDatas("2026-11-01", 0, 2)).toEqual(["2026-11-01", "2026-11-02"]);
  });
});

const oc = (o: Partial<Ocupado> & { data: string; hora: string | null }): Ocupado => ({
  id: o.id ?? `${o.data}-${o.hora}`, duracao_min: 60, status: "agendado", cliente: "Jessica", ...o,
});

describe("conflitosDasDatas", () => {
  const datas = ["2026-11-06", "2026-11-27", "2026-12-18"];
  it("acha sobreposição parcial e ignora horário colado", () => {
    const r = conflitosDasDatas(datas, "09:00", 180, [
      oc({ data: "2026-11-27", hora: "09:30", duracao_min: 90 }),
      oc({ data: "2026-12-18", hora: "12:00" }),
      oc({ data: "2026-11-06", hora: "08:00" }),
    ]);
    expect([...r.keys()]).toEqual(["2026-11-27"]);
    expect(r.get("2026-11-27")?.cliente).toBe("Jessica");
  });
  it("ignora cancelados, faltas, sem horário e ids informados", () => {
    const r = conflitosDasDatas(datas, "10:00", 60, [
      oc({ data: "2026-11-06", hora: "10:00", status: "cancelado" }),
      oc({ data: "2026-11-27", hora: "10:00", status: "faltou" }),
      oc({ data: "2026-12-18", hora: null }),
      oc({ id: "eu", data: "2026-12-18", hora: "10:00" }),
    ], ["eu"]);
    expect(r.size).toBe(0);
  });
  it("sem hora ou duração não calcula", () => {
    expect(conflitosDasDatas(datas, "", 60, [oc({ data: "2026-11-06", hora: "10:00" })]).size).toBe(0);
    expect(conflitosDasDatas(datas, "10:00", Number.NaN, [oc({ data: "2026-11-06", hora: "10:00" })]).size).toBe(0);
  });
});

describe("resumoSerie", () => {
  it("tira as puladas e conta conflitos só nas ativas", () => {
    const datas = ["a", "b", "c", "d"];
    const r = resumoSerie(datas, new Set(["b"]), new Map([["b", 1], ["d", 1]]));
    expect(r).toEqual({ ativas: ["a", "c", "d"], primeira: "a", ultima: "d", conflitos: 1, puladas: 1, bloqueadas: 0 });
  });
  it("datas bloqueadas ficam de fora e não contam como puladas nem como conflito", () => {
    const r = resumoSerie(["a", "b", "c", "d"], new Set(["b"]), new Map([["c", 1]]), new Map([["b", 1], ["c", 1]]));
    expect(r).toEqual({ ativas: ["a", "d"], primeira: "a", ultima: "d", conflitos: 0, puladas: 1, bloqueadas: 1 });
  });
});

const membros: Membro[] = [
  { id: "c", data: "2026-12-18", status: "agendado", serie_id: "s" },
  { id: "a", data: "2026-11-06", status: "realizado", serie_id: "s" },
  { id: "b", data: "2026-11-27", status: "cancelado", serie_id: "s" },
  { id: "d", data: "2027-01-08", status: "agendado", serie_id: "s" },
];

describe("séries", () => {
  it("posição por data", () => {
    expect(posicaoNaSerie("c", membros)).toEqual({ n: 3, m: 4 });
    expect(posicaoNaSerie("x", membros)).toBeNull();
  });
  it("intervalo é a menor distância entre datas", () => {
    expect(intervaloDaSerie(membros)).toBe(21);
    expect(intervaloDaSerie([{ data: "2026-11-06" }])).toBeNull();
  });
  it("próximos: só agendados depois da data", () => {
    expect(proximosDaSerie("2026-11-06", membros).map((m) => m.id)).toEqual(["c", "d"]);
    expect(proximosDaSerie("2027-01-08", membros)).toEqual([]);
  });
  it("intervalo válido 1–365", () => {
    expect(intervaloValido(21)).toBe(21);
    expect(intervaloValido(0)).toBeNull();
    expect(intervaloValido(366)).toBeNull();
    expect(intervaloValido(2.5)).toBeNull();
  });
});

describe("planoReorganizacao", () => {
  // Mesmo cenário testado no banco (0007): série de 21 em 21 com uma passada e uma cancelada,
  // e outra série de 7 em 7. Hoje = 13/11/2026, novo intervalo = 14.
  const itens: Membro[] = [
    { id: "p", data: "2026-11-04", status: "agendado", serie_id: "s1" },
    { id: "a", data: "2026-11-25", status: "agendado", serie_id: "s1" },
    { id: "c", data: "2026-12-16", status: "cancelado", serie_id: "s1" },
    { id: "b", data: "2027-01-06", status: "agendado", serie_id: "s1" },
    { id: "d", data: "2027-01-27", status: "agendado", serie_id: "s1" },
    { id: "x", data: "2026-11-16", status: "agendado", serie_id: "s2" },
    { id: "y", data: "2026-11-23", status: "agendado", serie_id: "s2" },
    { id: "z", data: "2026-11-30", status: "agendado", serie_id: "s2" },
    { id: "solto", data: "2026-12-01", status: "agendado", serie_id: null },
  ];
  it("mantém o primeiro de cada série e redistribui os seguintes (igual ao banco)", () => {
    const r = planoReorganizacao(itens, 14, "2026-11-13");
    expect(r.map((m) => [m.item.id, m.de, m.para])).toEqual([
      ["y", "2026-11-23", "2026-11-30"],
      ["b", "2027-01-06", "2026-12-09"],
      ["z", "2026-11-30", "2026-12-14"],
      ["d", "2027-01-27", "2026-12-23"],
    ]);
  });
  it("nada muda se o espaçamento já é o novo intervalo; intervalo inválido não planeja", () => {
    expect(planoReorganizacao(itens.filter((i) => i.serie_id === "s2"), 7, "2026-11-13")).toEqual([]);
    expect(planoReorganizacao(itens, 0, "2026-11-13")).toEqual([]);
    expect(planoReorganizacao(itens, 400, "2026-11-13")).toEqual([]);
  });
  it("ignora passados, cancelados e agendamentos fora de série", () => {
    const r = planoReorganizacao(itens, 30, "2026-11-13");
    expect(r.some((m) => ["p", "c", "solto"].includes(m.item.id))).toBe(false);
  });
});

describe("planoRemarcacao", () => {
  // Mesmo cenário testado no banco (0009): série de 21 em 21 às 13:00.
  const proximos: Membro[] = [
    { id: "c", data: "2027-01-18", status: "agendado", serie_id: "s", hora: "13:00:00" },
    { id: "b", data: "2026-12-07", status: "agendado", serie_id: "s", hora: "13:00:00" },
  ];
  it("mesmo dia, horário novo: as datas ficam, a hora muda", () => {
    const r = planoRemarcacao(proximos, "2026-11-16", "2026-11-16", "09:00");
    expect(r.map((m) => [m.item.id, m.de, m.para, m.horaDe, m.horaPara])).toEqual([
      ["b", "2026-12-07", "2026-12-07", "13:00", "09:00"],
      ["c", "2027-01-18", "2027-01-18", "13:00", "09:00"],
    ]);
  });
  it("muda o dia: todos andam o mesmo tanto (inclusive para trás e virando o ano)", () => {
    expect(planoRemarcacao(proximos, "2026-11-16", "2026-11-17", "13:00").map((m) => m.para)).toEqual(["2026-12-08", "2027-01-19"]);
    expect(planoRemarcacao(proximos, "2026-11-16", "2026-11-14", "13:00").map((m) => m.para)).toEqual(["2026-12-05", "2027-01-16"]);
    expect(planoRemarcacao(proximos, "2026-11-16", "2026-12-30", "13:00").map((m) => m.para)).toEqual(["2027-01-20", "2027-03-03"]);
  });
  it("sem hora nova, mantém a de cada um", () => {
    expect(planoRemarcacao(proximos, "2026-11-16", "2026-11-16", "")[0]?.horaPara).toBe("13:00");
  });
  it("texto do deslocamento", () => {
    expect(textoDeslocamento(0)).toBe("");
    expect(textoDeslocamento(1)).toBe("+1 dia");
    expect(textoDeslocamento(-3)).toBe("−3 dias");
  });
});
