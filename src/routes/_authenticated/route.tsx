import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { CalendarDays, Sparkles, Users, Settings, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const tabs = [
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/atendimentos", label: "Atendimentos", icon: Sparkles },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/acerto", label: "Acerto", icon: Wallet },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

function Layout() {
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="flex flex-col items-center gap-1 py-3 text-xs font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
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
