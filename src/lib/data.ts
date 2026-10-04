import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// Colunas da agenda (drizzle/manual/0003) declaradas aqui até o types.ts ser regenerado.
export type Status = "agendado" | "realizado" | "cancelado" | "faltou";
export const STATUS_ATIVOS: Status[] = ["agendado", "realizado"];

export type Cliente = Tables<"clientes">;
export type Servico = Tables<"servicos"> & { duracao_min: number };
export type Config = Tables<"configuracoes"> & { hora_inicio: string | null; hora_fim: string | null };
export type Atendimento = Tables<"atendimentos"> & {
  status: Status;
  duracao_min: number;
  clientes: { nome: string } | null;
  servicos: { nome: string } | null;
};

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
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data;
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
        .select("*, clientes(nome), servicos(nome)")
        .eq("status", "realizado")
        .order("data", { ascending: false })
        .order("hora", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Atendimento[];
    },
  });

/** Todos os status, de `inicio` a `fim` (inclusive). Prefixo "atendimentos" para ser invalidada junto. */
export const useAgenda = (inicio: string, fim: string) =>
  useQuery({
    queryKey: ["atendimentos", "agenda", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, clientes(nome), servicos(nome)")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data")
        .order("hora", { nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return data as Atendimento[];
    },
  });

export type Repasse = Tables<"repasses">;

const proximoMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

export const useAtendimentosMes = (mes: string) =>
  useQuery({
    queryKey: ["atendimentos", "mes", mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atendimentos")
        .select("*, clientes(nome), servicos(nome)")
        .eq("status", "realizado")
        .gte("data", `${mes}-01`)
        .lt("data", proximoMes(mes))
        .order("data")
        .order("hora", { nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return data as Atendimento[];
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
