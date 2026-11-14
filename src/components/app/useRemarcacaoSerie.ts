import { useOcupadosNasDatas } from "@/lib/data";
import { conflitosDasDatas, planoRemarcacao, type Membro, type Ocupado } from "@/lib/recorrencia";

export type ModoSerie = "este" | "proximos";

/**
 * Plano de "Este e os próximos": novas datas/horas de cada próximo, quais estão marcados,
 * quais batem com outro atendimento e se algum cairia antes de hoje.
 */
export function useRemarcacaoSerie(p: {
  ativo: boolean;
  proximos: Membro[];
  dataAntes: string;
  dataNova: string;
  horaNova: string;
  duracao: number;
  excluidos: Set<string>;
  idAtual: string | undefined;
  hoje: string;
}) {
  const plano = p.ativo && p.dataNova ? planoRemarcacao(p.proximos, p.dataAntes, p.dataNova, p.horaNova) : [];
  const selecionados = plano.filter((r) => !p.excluidos.has(r.item.id));
  const { data: ocupados = [], isFetching } = useOcupadosNasDatas(
    plano.map((r) => r.para),
    p.ativo && plano.length > 0,
  );
  // Quem vai sair do lugar não ocupa o horário antigo; quem ficar (desmarcado) continua ocupando.
  const ignorar = [...(p.idAtual ? [p.idAtual] : []), ...selecionados.map((r) => r.item.id)];
  const conflitos = new Map<string, Ocupado>();
  for (const r of selecionados) {
    const o = conflitosDasDatas([r.para], r.horaPara, p.duracao, ocupados, ignorar).get(r.para);
    if (o) conflitos.set(r.item.id, o);
  }
  const passado = selecionados.some((r) => r.para < p.hoje);
  return { plano, selecionados, conflitos, passado, conferindo: isFetching };
}
