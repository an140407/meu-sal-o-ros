import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lunula — clientes e atendimentos" },
      { name: "description", content: "Registre clientes, anamnese e atendimentos de nail design." },
      { property: "og:title", content: "Lunula" },
      { property: "og:description", content: "Registre clientes, anamnese e atendimentos de nail design." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/agenda" : "/auth", replace: true });
    });
  }, [navigate]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-rose-gradient">
      <h1 className="text-3xl text-foreground">Lunula</h1>
    </main>
  );
}
