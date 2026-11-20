import { useBloqueiosNasDatas, useOcupadosNasDatas } from "@/lib/data";
import { bloqueioQueImpede, type Bloqueio } from "@/lib/bloqueios";
import { conflitosDasDatas, planoRemarcacao, type Membro, type Ocupado } from "@/lib/recorrencia";

export type ModoSerie = "este" | "proximos";

/**
 * Plano de "Este e os próximos": novas datas/horas de cada próximo, quais estão marcados,
 * quais batem com outro atendimento, quais cairiam num bloqueio (esses não vão: ficam como
 * estão, como o banco exige) e se algum cairia antes de hoje.
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
  const ativo = p.ativo && plano.length > 0;
  const datas = plano.map((r) => r.para);
  const { data: ocupados = [], isFetching } = useOcupadosNasDatas(datas, ativo);
  const { data: bloqueios = [], isFetching: buscandoBloqueios } = useBloqueiosNasDatas(datas, ativo);

  // Mesma regra do banco: bloqueio em que o próximo já estava não impede.
  const bloqueados = new Map<string, Bloqueio>();
  for (const r of plano) {
    const b = bloqueioQueImpede(
      bloqueios,
      { data: r.para, hora: r.horaPara, duracao: p.duracao },
      { data: r.de, hora: r.horaDe, duracao: r.item.duracao_min ?? p.duracao },
    );
    if (b) bloqueados.set(r.item.id, b);
  }

  const selecionados = plano.filter((r) => !p.excluidos.has(r.item.id) && !bloqueados.has(r.item.id));
  // Quem vai sair do lugar não ocupa o horário antigo; quem ficar (desmarcado) continua ocupando.
  const ignorar = [...(p.idAtual ? [p.idAtual] : []), ...selecionados.map((r) => r.item.id)];
  const conflitos = new Map<string, Ocupado>();
  for (const r of selecionados) {
    const o = conflitosDasDatas([r.para], r.horaPara, p.duracao, ocupados, ignorar).get(r.para);
    if (o) conflitos.set(r.item.id, o);
  }
  const passado = selecionados.some((r) => r.para < p.hoje);
  return { plano, selecionados, conflitos, bloqueados, passado, conferindo: isFetching || buscandoBloqueios };
}
