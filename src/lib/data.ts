import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { itensDoAtendimento, limitarDuracao, somaItens, type ItemServico } from "./itens";

// Colunas da agenda (drizzle/manual/0003) declaradas aqui até o types.ts ser regenerado.
export type Status = "agendado" | "realizado" | "cancelado" | "faltou";
export const STATUS_ATIVOS: Status[] = ["agendado", "realizado"];

export type Cliente = Tables<"clientes">;
export type Servico = Tables<"servicos"> & { duracao_min: number };
export type Config = Tables<"configuracoes"> & { hora_inicio: string | null; hora_fim: string | null };
type ItemRow = ItemServico & { ordem: number };
export type Atendimento = Tables<"atendimentos"> & {
  status: Status;
  duracao_min: number;
  clientes: { nome: string } | null;
  servicos: { nome: string } | null;
  atendimento_servicos: ItemRow[];
  /** Itens em ordem (atendimento antigo sem itens = 1 item com servicos(nome) e valor_bruto). */
  itens: ItemServico[];
};

/** Colunas lidas em toda consulta de atendimentos (inclui os serviços do atendimento). */
const SELECT_ATENDIMENTO =
  "*, clientes(nome), servicos(nome), atendimento_servicos(nome, valor, duracao_min, servico_id, ordem)";
const ORDEM_ITENS = { referencedTable: "atendimento_servicos" } as const;

const comItens = (rows: unknown): Atendimento[] =>
  (rows as Omit<Atendimento, "itens">[]).map((a) => ({ ...a, itens: itensDoAtendimento(a) }));

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
 * Grava o atendimento e seus serviços. Nunca grava valor_bruto: o banco soma os itens.
 * servico_id = serviço do 1º item (compatibilidade); duracao_min = soma, limitada a 15–480.
 * Ordem: atendimento → insere os itens novos numa chamada → apaga os antigos pelos ids → relê.
 */
export async function salvarAtendimentoComItens(
  id: string | null,
  campos: Omit<TablesUpdate<"atendimentos">, "valor_bruto" | "valor_liquido" | "servico_id" | "duracao_min">,
  itens: ItemServico[],
): Promise<{ atendimento: Atendimento; duracaoAjustada: boolean }> {
  if (itens.length === 0) throw new Error("Atendimento sem serviços.");
  const { duracao, ajustada } = limitarDuracao(somaItens(itens).duracao);
  const linha = { ...campos, servico_id: itens[0]!.servico_id, duracao_min: duracao };

  let atendimentoId = id;
  let antigos: string[] = [];
  if (id) {
    const { error } = await supabase.from("atendimentos").update(linha).eq("id", id);
    if (error) throw error;
    const { data: velhos, error: e } = await supabase.from("atendimento_servicos").select("id").eq("atendimento_id", id);
    if (e) throw e;
    antigos = velhos.map((v: { id: string }) => v.id);
  } else {
    const { data: criado, error } = await supabase
      .from("atendimentos")
      .insert(linha as TablesInsert<"atendimentos">)
      .select("id")
      .single();
    if (error) throw error;
    atendimentoId = criado.id;
  }

  const { error: eItens } = await supabase.from("atendimento_servicos").insert(
    itens.map((i, ordem) => ({
      atendimento_id: atendimentoId!, servico_id: i.servico_id, nome: i.nome, valor: i.valor, duracao_min: i.duracao_min, ordem,
    })),
  );
  if (eItens) {
    // Atendimento novo sem itens ficaria órfão (valor 0): desfaz o que acabou de ser criado.
    if (!id) await supabase.from("atendimentos").delete().eq("id", atendimentoId!);
    throw eItens;
  }
  if (antigos.length > 0) {
    const { error } = await supabase.from("atendimento_servicos").delete().in("id", antigos);
    if (error) throw error;
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
