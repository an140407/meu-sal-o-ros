import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/** Volta pelo histórico se houver página anterior no app; senão (aberta pela URL), usa `fallback`. */
export function Voltar({ label, fallback }: { label: string; fallback: () => void }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? router.history.back() : fallback())}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground"
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}
