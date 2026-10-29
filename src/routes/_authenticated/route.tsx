import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Sparkles, Users, Settings, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sessão local (sem ida ao servidor); o acesso aos dados continua protegido por RLS.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: Layout,
});

const tabs = [
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/atendimentos", label: "Histórico", icon: Sparkles },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/acerto", label: "Acerto", icon: Wallet, tambem: ["/despesas", "/estatisticas"] },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

type Tab = (typeof tabs)[number];

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Ativa na própria rota, nas filhas (/clientes/$id) e nas telas ligadas (Acerto → Despesas, Estatísticas).
  const ativa = (t: Tab) =>
    [t.to, ...("tambem" in t ? t.tambem : [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <Outlet />
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              aria-current={ativa(t) ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                ativa(t) ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150",
                  ativa(t) && "bg-secondary",
                )}
              >
                <t.icon className="size-6" aria-hidden />
              </span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
