import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Caderno da Nail" },
      { name: "description", content: "Acesse seu caderno de clientes e atendimentos." },
      { property: "og:title", content: "Entrar — Caderno da Nail" },
      { property: "og:description", content: "Acesse seu caderno de clientes e atendimentos." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) {
          toast.error(
            error.code === "email_not_confirmed"
              ? "E-mail ainda não confirmado. Confira sua caixa de entrada."
              : "E-mail ou senha inválidos.",
          );
          return;
        }
        navigate({ to: "/atendimentos" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/atendimentos" });
        else toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
      }
    } catch (err) {
      toast.error(modo === "entrar" ? "E-mail ou senha inválidos." : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-rose-gradient flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-4xl text-foreground">Caderno da Nail</h1>
        <p className="mt-2 text-muted-foreground">Clientes e atendimentos, num só lugar.</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl bg-card p-6 shadow-soft">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required className="h-12" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" required minLength={6} className="h-12" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <Button type="submit" size="xl" disabled={loading}>
            {loading ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
          >
            {modo === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
          </button>
        </form>
      </div>
    </main>
  );
}
