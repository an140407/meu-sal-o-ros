import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { excluirRepasses, registrarRepasses } from "@/lib/data";
import { mensagemErro } from "@/lib/erros";
import { brl } from "@/lib/format";
import type { Recebedor } from "@/lib/pagamentos";

/**
 * Confirma repasses do dia (um por dia) e oferece "Desfazer" no aviso.
 * Devolve a função e se está gravando, para travar o botão.
 */
export function useConfirmarRepasses(dona: string) {
  const qc = useQueryClient();
  const [gravando, setGravando] = useState(false);
  const atualizar = () => qc.invalidateQueries({ queryKey: ["repasses-diarios"] });

  async function confirmar(repasses: { dia: string; de: Recebedor; valor: number }[]) {
    if (repasses.length === 0 || gravando) return;
    setGravando(true);
    try {
      const ids = await registrarRepasses(repasses);
      await atualizar();
      const total = repasses.reduce((s, r) => s + (r.de === "ana" ? r.valor : -r.valor), 0);
      const texto =
        repasses.length === 1
          ? repasses[0]!.de === "ana"
            ? `Repasse de ${brl(repasses[0]!.valor)} pra ${dona} confirmado`
            : `Repasse de ${brl(repasses[0]!.valor)} da ${dona} confirmado`
          : `${repasses.length} dias acertados · saldo ${brl(Math.abs(total))}`;
      toast.success(texto, {
        action: {
          label: "Desfazer",
          onClick: () => {
            void excluirRepasses(ids)
              .then(atualizar)
              .then(() => toast("Confirmação desfeita."))
              .catch((err) => toast.error(mensagemErro(err, "Não foi possível desfazer.")));
          },
        },
      });
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível confirmar o repasse."));
    } finally {
      setGravando(false);
    }
  }

  return { confirmar, gravando };
}
