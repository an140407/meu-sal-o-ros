import { describe, expect, it } from "vitest";
import {
  conflitosDasDatas, gerarDatas, intervaloDaSerie, intervaloValido, posicaoNaSerie, proximosDaSerie, resumoSerie,
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
    expect(r).toEqual({ ativas: ["a", "c", "d"], primeira: "a", ultima: "d", conflitos: 1, puladas: 1 });
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
