import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "./ui-bits";
import { useServicos } from "@/lib/data";
import { brl } from "@/lib/format";
import { novaChave, totaisForm, type ItemForm } from "@/lib/itens";

/**
 * Serviços de um atendimento: lista editável (valor em R$ e duração) + "Adicionar serviço".
 * Mostra total e duração total. A validação (pelo menos 1 item) fica em validarItens.
 */
export function ServicosPicker({ itens, onChange }: { itens: ItemForm[]; onChange: (itens: ItemForm[]) => void }) {
  const { data: servicos = [] } = useServicos();
  const ativos = servicos.filter((s) => s.ativo);
  const { valor, duracao } = totaisForm(itens);

  const alterar = (key: string, patch: Partial<ItemForm>) =>
    onChange(itens.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <div className="space-y-2">
      <Label>Serviços</Label>
      {itens.length > 0 && (
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.key} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{i.nome}</span>
                <button
                  type="button"
                  onClick={() => onChange(itens.filter((x) => x.key !== i.key))}
                  className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                  aria-label={`Remover ${i.nome}`}
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Valor (R$)</span>
                  <Input
                    className="h-11 text-base"
                    inputMode="decimal"
                    value={i.valor}
                    onChange={(e) => alterar(i.key, { valor: e.target.value })}
                    aria-label={`Valor de ${i.nome}`}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Duração (min)</span>
                  <Input
                    className="h-11 text-base"
                    inputMode="numeric"
                    value={i.duracao}
                    onChange={(e) => alterar(i.key, { duracao: e.target.value })}
                    aria-label={`Duração de ${i.nome} em minutos`}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <NativeSelect
        value=""
        aria-label="Adicionar serviço"
        onChange={(e) => {
          const s = servicos.find((x) => x.id === e.target.value);
          if (!s) return;
          onChange([
            ...itens,
            { key: novaChave(), servico_id: s.id, nome: s.nome, valor: String(s.preco_padrao), duracao: String(s.duracao_min) },
          ]);
        }}
      >
        <option value="">+ Adicionar serviço</option>
        {ativos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </NativeSelect>
      <div className="flex justify-between rounded-xl bg-secondary px-3 py-2 text-sm">
        <span className="text-secondary-foreground">Total · {duracao} min</span>
        <span className="font-semibold tabular-nums">{brl(valor)}</span>
      </div>
    </div>
  );
}
