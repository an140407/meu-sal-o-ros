/**
 * Mensagem para o toast a partir de um erro do Supabase. As funções do banco (RAISE EXCEPTION)
 * já respondem em português; erros técnicos (rede, permissão) viram o texto padrão.
 */
export function mensagemErro(err: unknown, padrao: string): string {
  const e = err as { code?: string; message?: string } | null;
  // P0001 = RAISE EXCEPTION das nossas funções (ex.: "A soma dos pagamentos ... não bate").
  if (e?.code === "P0001" && e.message) return e.message;
  return padrao;
}
