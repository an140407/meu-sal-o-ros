import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { itensDoAtendimento, limitarDuracao, somaItens, type ItemServico } from "./itens";
import { pagamentosDoAtendimento, type Pagamento } from "./pagamentos";
import type { Membro, Ocupado } from "./recorrencia";
import type { Forma } from "./format";

export type Status = "agendado" | "realizado" | "cancelado" | "faltou";
export const STATUS_ATIVOS: Status[] = ["agendado", "realizado"];

export type Cliente = Tables<"clientes">;
export type Servico = Tables<"servicos"> & { duracao_min: number };
export type Config = Tables<"configuracoes"> & { hora_inicio: string | null; hora_fim: string | null };
type ItemRow = ItemServico & { ordem: number };
type PagamentoRow = { forma: string; valor: number; taxa_percentual: number; ordem: number };
export type Atendimento = Tables<"atendimentos"> & {
  status: Status;
  duracao_min: number;
  clientes: { nome: string } | null;
  servicos: { nome: string } | null;
  atendimento_servicos: ItemRow[];
  atendimento_pagamentos: PagamentoRow[];
  /** Itens em ordem (atendimento antigo sem itens = 1 item com servicos(nome) e valor_bruto). */
  itens: ItemServico[];
  /** Partes do pagamento em ordem (concluído antigo sem partes = 1 parte com forma_pagamento e valor_bruto). */
  pagamentos: Pagamento[];
};

/** Colunas lidas em toda consulta de atendimentos (inclui serviços e partes do pagamento). */
const SELECT_ATENDIMENTO =
  "*, clientes(nome), servicos(nome), atendimento_servicos(nome, valor, duracao_min, servico_id, ordem), atendimento_pagamentos(forma, valor, taxa_percentual, ordem)";
const ORDEM_ITENS = { referencedTable: "atendimento_servicos" } as const;

const comItens = (rows: unknown): Atendimento[] =>
  (rows as Omit<Atendimento, "itens" | "pagamentos">[]).map((a) => ({
    ...a,
    itens: itensDoAtendimento(a),
    pagamentos: pagamentosDoAtendimento(a),
  }));

let setupFeito = false;
async function garantirSetup() {
  if (setupFeito) return;
  await supabase.rpc("garantir_setup");
  setupFeito = true;
}

export const useClientes = () =>
  useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*");
      if (error) throw error;
      // Ordena no cliente: ignora acentos e maiúsculas ("Ágata" junto de "Ana").
      return data.sort((a: Cliente, b: Cliente) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    },
  });

export const useServicos = () =>
  useQuery({
    queryKey: ["servicos"],
    queryFn: async () => {
      await garantirSetup();
      const { data, error } = await supabase.from("servicos").select("*").order("nome");
      if (error) throw error;
      return data as Servico[];
    },
  });

export const useConfig = () =>
  useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      await garantirSetup();
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error) throw error;
      return data as Config | null;
    },
  });

export const useAtendimentos = (clienteId?: string) =>
  useQuery({
    queryKey: ["atendimentos", clienteId ?? "todos"],
    queryFn: async () => {
      let q = supabase
        .from("atendimentos")
        .select(SELECT_ATENDIMENTO)
        .order("ordem", ORDEM_ITENS)
        .eq("status", "realizado")
        .order("data", { ascending: false })
        .order("hora", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      if (error) throw error;
      return comItens(data);
    },
  });

/** Todos os status, de `inicio` a `fim` (inclusive). Prefixo "atendimentos" para ser invalidada junto. */
export const useAgenda = (inicio: string, fim: string) =>
  useQuery({
    queryKey: ["atendimentos", "agenda", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select(SELECT_ATENDIMENTO)
        .order("ordem", ORDEM_ITENS)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data")
        .order("hora", { nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return comItens(data);
    },
  });

export type Repasse = Tables<"repasses">;

export const proximoMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

export const useAtendimentosMes = (mes: string) =>
  useQuery({
    queryKey: ["atendimentos", "mes", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select(SELECT_ATENDIMENTO)
        .order("ordem", ORDEM_ITENS)
        .eq("status", "realizado")
        .gte("data", `${mes}-01`)
        .lt("data", proximoMes(mes))
        .order("data")
        .order("hora", { nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return comItens(data);
    },
  });

/** Agendamentos 'agendado' da cliente de `hoje` em diante, em ordem cronológica. */
export const useProximosDaCliente = (clienteId: string, hoje: string) =>
  useQuery({
    queryKey: ["atendimentos", "proximos", clienteId, hoje],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select(SELECT_ATENDIMENTO)
        .order("ordem", ORDEM_ITENS)
        .eq("cliente_id", clienteId)
        .eq("status", "agendado")
        .gte("data", hoje)
        .order("data")
        .order("hora", { nullsFirst: false });
      if (error) throw error;
      return comItens(data);
    },
  });

/** Ids das clientes com algum 'agendado' a partir de `hoje`. */
export const useClientesComAgendamento = (hoje: string) =>
  useQuery({
    queryKey: ["atendimentos", "agendados-futuros", hoje],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("cliente_id")
        .eq("status", "agendado")
        .gte("data", hoje);
      if (error) throw error;
      return new Set<string>(data.map((a) => a.cliente_id));
    },
  });

/** Todos os repasses (para o saldo dos meses anteriores no Acerto). */
export const useRepassesTodos = () =>
  useQuery({
    queryKey: ["repasses", "todos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("repasses").select("*");
      if (error) throw error;
      return data;
    },
  });

/** Todos os status, de `inicio` (inclusive) até `fim` (exclusive), para as estatísticas. */
export const useAtendimentosPeriodo = (inicio: string, fim: string) =>
  useQuery({
    queryKey: ["atendimentos", "periodo", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select(SELECT_ATENDIMENTO)
        .order("ordem", ORDEM_ITENS)
        .gte("data", inicio)
        .lt("data", fim);
      if (error) throw error;
      return comItens(data);
    },
  });

export type Despesa = Tables<"despesas">;

export const useDespesas = (mes: string) =>
  useQuery({
    queryKey: ["despesas", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas")
        .select("*")
        .gte("data", `${mes}-01`)
        .lt("data", proximoMes(mes))
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useRepasses = (mes: string) =>
  useQuery({
    queryKey: ["repasses", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repasses")
        .select("*")
        .eq("mes_referencia", mes)
        .order("data_recebimento")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

/**
 * Grava o atendimento, seus serviços e (se vierem) as partes do pagamento. Nunca grava
 * valor_bruto nem valor_liquido: o banco soma os itens e desconta a taxa de cada parte.
 * servico_id = serviço do 1º item (compatibilidade); duracao_min = soma, limitada a 15–480.
 * Ordem: atendimento → troca itens (e partes) numa transação → relê.
 */
export async function salvarAtendimentoComItens(
  id: string | null,
  campos: Omit<TablesUpdate<"atendimentos">, "valor_bruto" | "valor_liquido" | "servico_id" | "duracao_min">,
  itens: ItemServico[],
  pagamentos?: { forma: Forma; valor: number }[],
): Promise<{ atendimento: Atendimento; duracaoAjustada: boolean }> {
  if (itens.length === 0) throw new Error("Atendimento sem serviços.");
  const { duracao, ajustada } = limitarDuracao(somaItens(itens).duracao);
  const linha = { ...campos, servico_id: itens[0]!.servico_id, duracao_min: duracao };

  let atendimentoId = id;
  if (id) {
    const { error } = await supabase.from("atendimentos").update(linha).eq("id", id);
    if (error) throw error;
  } else {
    const { data: criado, error } = await supabase
      .from("atendimentos")
      .insert(linha as TablesInsert<"atendimentos">)
      .select("id")
      .single();
    if (error) throw error;
    atendimentoId = criado.id;
  }

  // Troca itens (e partes do pagamento) numa única transação; a ordem é a posição na lista.
  const pItens = itens.map((i) => ({ servico_id: i.servico_id, nome: i.nome, valor: i.valor, duracao_min: i.duracao_min }));
  const { error: eItens } = pagamentos
    ? await supabase.rpc("salvar_itens_e_pagamentos", {
        p_atendimento_id: atendimentoId!,
        p_itens: pItens,
        p_pagamentos: pagamentos.map((p) => ({ forma: p.forma, valor: p.valor })),
      })
    : await supabase.rpc("substituir_itens_atendimento", { p_atendimento_id: atendimentoId!, p_itens: pItens });
  if (eItens) {
    // Atendimento novo sem itens ficaria órfão (valor 0): desfaz o que acabou de ser criado.
    if (!id) await supabase.from("atendimentos").delete().eq("id", atendimentoId!);
    throw eItens;
  }

  const { data: lido, error: eLer } = await supabase
    .from("atendimentos")
    .select(SELECT_ATENDIMENTO)
    .order("ordem", ORDEM_ITENS)
    .eq("id", atendimentoId!)
    .single();
  if (eLer) throw eLer;
  return { atendimento: comItens([lido])[0]!, duracaoAjustada: ajustada };
}

/** Agendamentos ativos (agendado/realizado) nas datas informadas, para avisar conflitos de uma série. */
export const useOcupadosNasDatas = (datas: string[], ativo = true) =>
  useQuery({
    queryKey: ["atendimentos", "ocupados", datas.join(",")],
    enabled: ativo && datas.length > 0,
    queryFn: async (): Promise<Ocupado[]> => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("id, data, hora, duracao_min, status, clientes(nome)")
        .in("data", datas)
        .in("status", STATUS_ATIVOS);
      if (error) throw error;
      return (data as unknown as (Omit<Ocupado, "cliente"> & { clientes: { nome: string } | null })[]).map((o) => ({
        id: o.id, data: o.data, hora: o.hora, duracao_min: o.duracao_min, status: o.status, cliente: o.clientes?.nome ?? "outra cliente",
      }));
    },
  });

/** Todos os agendamentos das séries informadas (id, data, status), agrupados por serie_id. */
export const useMembrosSeries = (serieIds: string[]) => {
  const ids = [...new Set(serieIds)].sort();
  return useQuery({
    queryKey: ["atendimentos", "series", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("id, data, status, serie_id")
        .in("serie_id", ids);
      if (error) throw error;
      const m = new Map<string, Membro[]>();
      for (const a of data as Membro[]) m.set(a.serie_id!, [...(m.get(a.serie_id!) ?? []), a]);
      return m;
    },
  });
};

/**
 * Cria de 1 a 60 agendamentos de uma vez (mesma cliente, hora, duração e serviços), numa
 * transação no banco. Com mais de uma data, todos ficam na mesma série. Guarda o intervalo
 * na ficha da cliente.
 */
export async function criarAgendamentosRecorrentes(p: {
  clienteId: string;
  datas: string[];
  hora: string;
  duracao: number;
  observacoes: string;
  itens: ItemServico[];
  intervaloDias: number;
}): Promise<string[]> {
  const { data, error } = await supabase.rpc("criar_agendamentos_recorrentes", {
    p_cliente_id: p.clienteId,
    p_datas: p.datas,
    p_hora: p.hora,
    p_duracao_min: limitarDuracao(p.duracao).duracao,
    p_observacoes: p.observacoes,
    p_itens: p.itens.map((i) => ({ servico_id: i.servico_id, nome: i.nome, valor: i.valor, duracao_min: i.duracao_min })),
    p_intervalo_dias: p.intervaloDias,
  });
  if (error) throw error;
  return data ?? [];
}

/** Copia hora, duração, observações e serviços para os próximos 'agendado' da série. Devolve quantos mudaram. */
export async function aplicarAosProximosDaSerie(atendimentoId: string): Promise<number> {
  const { data, error } = await supabase.rpc("aplicar_aos_proximos_da_serie", { p_atendimento_id: atendimentoId });
  if (error) throw error;
  return data ?? 0;
}
