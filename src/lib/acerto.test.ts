import { describe, expect, it } from "vitest";
import {
  INICIO_ACERTO_DIARIO, acertoDoDia, acertosPorDia, devidoDaDivisao, divisao, pendencias, quemManda,
  repassesParaAcertar, somaRepasses, type AtendimentoDivisao, type RepasseDiario,
} from "./acerto";

/** Intl usa espaço não separável entre "R$" e o número. */
const sp = (s: string) => s.replace(/ /g, " ");

const at = (
  data: string,
  partes: [number, "ana" | "simone", number?][],
  o: Partial<AtendimentoDivisao> = {},
): AtendimentoDivisao => {
  const pagamentos = partes.map(([valor, recebedor, taxa = 0]) => ({ valor, recebedor, taxa_percentual: taxa }));
  const bruto = pagamentos.reduce((s, p) => s + p.valor, 0);
  const liquido = pagamentos.reduce((s, p) => s + p.valor * (1 - p.taxa_percentual / 100), 0);
  return { data, status: "realizado", valor_bruto: bruto, valor_liquido: Math.round(liquido * 100) / 100, percentual_ana: 70, pagamentos, ...o };
};
const rep = (dia: string, de: "ana" | "simone", valor: number, created_at = `${dia}T22:00:00Z`): RepasseDiario =>
  ({ id: `${dia}-${de}-${valor}`, dia, de, valor, created_at });

describe("divisao", () => {
  it("dia típico: Ana recebeu tudo, manda 30% pra dona", () => {
    const d = divisao([at("2026-11-15", [[100, "ana"]]), at("2026-11-15", [[50, "ana"]])]);
    expect(d).toMatchObject({ atendimentos: 2, bruto: 150, liquido: 150, ana: 105, dona: 45, recebido: { ana: 150, simone: 0 } });
    expect(devidoDaDivisao(d)).toBe(45);
  });
  it("dona recebeu um serviço inteiro: a conta diminui (ou inverte)", () => {
    // 300 produzidos; dona recebeu 100 → Ana recebeu 200; Ana tem direito a 210 → dona manda 10 pra Ana.
    const d = divisao([at("d", [[100, "ana"]]), at("d", [[100, "simone"]]), at("d", [[100, "ana"]])]);
    expect(d.recebido).toEqual({ ana: 200, simone: 100 });
    expect(devidoDaDivisao(d)).toBe(-10);
  });
  it("pagamento dividido entre as duas e taxa da maquininha só na parte do cartão", () => {
    const d = divisao([at("d", [[60, "simone"], [40, "ana", 5]])]); // líquido 98
    expect(d).toMatchObject({ bruto: 100, liquido: 98, taxas: 2, ana: 68.6, dona: 29.4, recebido: { ana: 38, simone: 60 } });
    expect(devidoDaDivisao(d)).toBe(-30.6);
  });
  it("ignora o que não está concluído e respeita o % gravado em cada atendimento", () => {
    const d = divisao([
      at("d", [[100, "ana"]], { status: "agendado" }),
      at("d", [[100, "ana"]], { status: "cancelado" }),
      at("d", [[100, "ana"]], { percentual_ana: 50 }),
    ]);
    expect(d).toMatchObject({ atendimentos: 1, ana: 50, dona: 50 });
  });
  it("centavos fecham: ana + dona = líquido e recebido.ana + recebido.simone = líquido", () => {
    const d = divisao([at("d", [[33.33, "ana"]]), at("d", [[33.33, "simone"]]), at("d", [[33.34, "ana", 4.99]])]);
    expect(Math.round((d.ana + d.dona) * 100)).toBe(Math.round(d.liquido * 100));
    expect(Math.round((d.recebido.ana + d.recebido.simone) * 100)).toBe(Math.round(d.liquido * 100));
  });
});

describe("acerto do dia e pendências", () => {
  const atends = [
    at("2026-11-14", [[500, "ana"]]), // antes do início: já acertado
    at("2026-11-15", [[100, "ana"]]), at("2026-11-15", [[50, "ana"]]), // devido 45
    at("2026-11-16", [[100, "simone"]]), // dona recebeu tudo: deve 70 pra Ana
    at("2026-11-17", [[200, "ana"]]), // devido 60
  ];
  const repasses = [rep("2026-11-15", "ana", 45), rep("2026-11-17", "ana", 50)];

  it("um dia já pago fica zerado; pagamento parcial deixa a diferença", () => {
    expect(acertoDoDia("2026-11-15", atends, repasses)).toMatchObject({ devido: 45, repassado: 45, falta: 0 });
    expect(acertoDoDia("2026-11-17", atends, repasses)).toMatchObject({ devido: 60, repassado: 50, falta: 10 });
    expect(acertoDoDia("2026-11-16", atends, repasses)).toMatchObject({ devido: -70, repassado: 0, falta: -70 });
  });

  it("dias desde o início (o dia 14 não entra), do mais recente ao mais antigo", () => {
    expect(INICIO_ACERTO_DIARIO).toBe("2026-11-15");
    expect(acertosPorDia(atends, repasses).map((a) => a.dia)).toEqual(["2026-11-17", "2026-11-16", "2026-11-15"]);
  });

  it("pendência soma os dois sentidos e lista só os dias em aberto (mais antigo primeiro)", () => {
    const p = pendencias(acertosPorDia(atends, repasses));
    expect(p.falta).toBe(-60); // Ana deve 10 (dia 17), dona deve 70 (dia 16) → dona manda 60
    expect(p.dias.map((d) => d.dia)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(repassesParaAcertar(p.dias)).toEqual([
      { dia: "2026-11-16", de: "simone", valor: 70 },
      { dia: "2026-11-17", de: "ana", valor: 10 },
    ]);
  });

  it("depois de confirmar os repasses sugeridos, nada fica pendente", () => {
    const novos = repassesParaAcertar(pendencias(acertosPorDia(atends, repasses)).dias)
      .map((r, i) => rep(r.dia, r.de, r.valor, `2026-11-18T10:0${i}:00Z`));
    expect(pendencias(acertosPorDia(atends, [...repasses, ...novos]))).toEqual({ falta: 0, dias: [] });
  });

  it("repasse num dia sem atendimento (ou atendimento apagado depois) vira crédito no outro sentido", () => {
    const a = acertoDoDia("2026-11-20", atends, [rep("2026-11-20", "ana", 30)]);
    expect(a).toMatchObject({ atendimentos: 0, devido: 0, repassado: 30, falta: -30 });
  });

  it("soma de repasses com sinal", () => {
    expect(somaRepasses([rep("d", "ana", 45), rep("d", "simone", 5.5)])).toBe(39.5);
  });
});

describe("quemManda", () => {
  it("texto e sentido", () => {
    expect(sp(quemManda(35, "Simone").texto)).toBe("Ana manda R$ 35,00 pra Simone");
    expect(sp(quemManda(-10, "Simone").texto)).toBe("Simone manda R$ 10,00 pra Ana");
    expect(quemManda(0.004, "Simone")).toEqual({ texto: "Tudo acertado", de: null, valor: 0 });
  });
});
