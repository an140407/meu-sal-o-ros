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
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              aria-current={ativa(t) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-3 text-xs font-medium",
                ativa(t) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <t.icon className="size-6" />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
