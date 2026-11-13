/**
 * Mensagem para o toast a partir de um erro do Supabase. As funções do banco (RAISE EXCEPTION)
 * já respondem em português; erros técnicos (rede, permissão) viram o texto padrão.
 */
export function mensagemErro(err: unknown, padrao: string): string {
  const e = err as { code?: string; message?: string } | null;
  // P0001 = RAISE EXCEPTION das nossas funções (ex.: "A soma dos pagamentos ... não bate").
  if (e?.code === "P0001" && e.message) return e.message;
  // PGRST202 = a função ainda não existe no banco (SQL novo não aplicado no Lovable Cloud).
  if (e?.code === "PGRST202") return "Falta aplicar a atualização do banco (SQL) no Lovable Cloud.";
  return padrao;
}
