import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { Servico } from "@/lib/data";
import { parseValor } from "@/lib/format";
import { formatarDuracao } from "@/lib/texto";
import { cn } from "@/lib/utils";

export type { Servico };

const DURACOES = [30, 60, 90, 120, 150] as const;
const DURACAO_PADRAO = 60;

/** Editar ou criar serviço: nome, preço, duração (com atalhos) e ativo. */
export function ServicoForm({
  aberto, onAberto, servico,
}: {
  aberto: boolean;
  onAberto: (o: boolean) => void;
  /** null = novo serviço. */
  servico: Servico | null;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [duracao, setDuracao] = useState(String(DURACAO_PADRAO));
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(servico?.nome ?? "");
    setPreco(servico ? String(servico.preco_padrao).replace(".", ",") : "");
    setDuracao(String(servico?.duracao_min ?? DURACAO_PADRAO));
    setAtivo(servico?.ativo ?? true);
  }, [aberto, servico]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const n = nome.trim().slice(0, 80);
    const p = parseValor(preco || "0");
    const d = Number(duracao);
    if (!n) return void toast.error("Informe o nome do serviço.");
    if (!Number.isFinite(p) || p < 0) return void toast.error("Preço inválido.");
    if (!Number.isInteger(d) || d < 15 || d > 480) return void toast.error("Use uma duração entre 15 e 480 minutos.");

    setSalvando(true);
    const campos = { nome: n, preco_padrao: p, duracao_min: d, ativo };
    const { error } = servico
      ? await supabase.from("servicos").update(campos).eq("id", servico.id)
      : await supabase.from("servicos").insert(campos);
    setSalvando(false);
    if (error) return void toast.error("Não foi possível salvar.");
    await qc.invalidateQueries({ queryKey: ["servicos"] });
    toast.success(servico ? "Serviço atualizado." : "Serviço criado.");
    onAberto(false);
  }

  const duracaoNum = Number(duracao);

  return (
    <Drawer open={aberto} onOpenChange={onAberto}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl">{servico ? "Editar serviço" : "Novo serviço"}</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={salvar} className="space-y-4 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <div className="space-y-2">
            <Label htmlFor="srv-nome">Nome</Label>
            <Input id="srv-nome" className="h-12 text-base" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="srv-preco">Preço (R$)</Label>
            <Input id="srv-preco" className="h-12 text-base tabular-nums" inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="srv-duracao">Duração (minutos)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="srv-duracao"
                className="h-12 w-24 text-base tabular-nums"
                inputMode="numeric"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                aria-describedby="srv-duracao-dica"
              />
              <span id="srv-duracao-dica" className="text-sm text-muted-foreground">
                {Number.isInteger(duracaoNum) && duracaoNum > 0 ? `= ${formatarDuracao(duracaoNum)}` : "de 15 a 480"}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Atalhos de duração">
              {DURACOES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={duracaoNum === m}
                  onClick={() => setDuracao(String(m))}
                  className={cn(
                    "h-11 rounded-full border px-1 text-[15px] tabular-nums transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    duracaoNum === m ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card active:bg-muted",
                  )}
                >
                  {formatarDuracao(m)}
                </button>
              ))}
            </div>
          </div>
          {servico && (
            <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-muted px-4">
              <label htmlFor="srv-ativo" className="flex-1 py-3">
                <span className="block font-medium">Ativo</span>
                <span className="block text-sm text-muted-foreground">Inativo some da lista ao agendar.</span>
              </label>
              <Switch id="srv-ativo" checked={ativo} onCheckedChange={setAtivo} />
            </div>
          )}
          <Button type="submit" size="xl" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
