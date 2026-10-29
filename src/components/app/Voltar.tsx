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
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </button>
  );
}
