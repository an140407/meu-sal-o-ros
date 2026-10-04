import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title, children, voltar,
}: {
  title: string;
  children?: ReactNode;
  /** Link ou botão de voltar, mostrado acima do título. */
  voltar?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-background/95 px-5 pb-3 pt-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur">
      {voltar && <div className="mb-2">{voltar}</div>}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl text-foreground">{title}</h1>
        {children}
      </div>
    </header>
  );
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-12 text-center text-muted-foreground">{children}</p>;
}
