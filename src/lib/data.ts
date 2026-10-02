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
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Atendimento[];
    },
  });
