import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Cliente = Tables<"clientes">;
export type Servico = Tables<"servicos">;
export type Config = Tables<"configuracoes">;
export type Atendimento = Tables<"atendimentos"> & {
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
      return data;
    },
  });

export const useConfig = () =>
  useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      await garantirSetup();
      const { data, error } = await supabase.from("configuracoes").select("*").maybeSingle();
      if (error) throw error;
      return data;
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
