import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, ChevronRight, Info, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/ui-bits";
import { ServicoForm, type Servico } from "@/components/app/ServicoForm";
import { useConfig, useServicos } from "@/lib/data";
import { brl, horaHM } from "@/lib/format";
import { formatarDuracao } from "@/lib/texto";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes — Lunula" },
      { name: "description", content: "Percentuais, taxas e serviços." },
      { property: "og:title", content: "Ajustes — Lunula" },
      { property: "og:description", content: "Percentuais, taxas e serviços." },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: cfg } = useConfig();
  const { data: servicos = [] } = useServicos();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    percentual_ana: "70", taxa_debito: "0", taxa_credito: "0", nome_dona: "Simone",
    hora_inicio: "08:00", hora_fim: "19:00",
  });
  const [editandoServico, setEditandoServico] = useState<Servico | "novo" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { user } = Route.useRouteContext();

  useEffect(() => {
    if (cfg) setF({
      percentual_ana: String(cfg.percentual_ana), taxa_debito: String(cfg.taxa_debito),
      taxa_credito: String(cfg.taxa_credito), nome_dona: cfg.nome_dona,
      hora_inicio: horaHM(cfg.hora_inicio) || "08:00", hora_fim: horaHM(cfg.hora_fim) || "19:00",
    });
  }, [cfg]);

  const num = (s: string) => Number(s.replace(",", "."));

  async function salvarCfg(e: React.FormEvent) {
    e.preventDefault();
    const vals: [number, number, number] = [num(f.percentual_ana), num(f.taxa_debito), num(f.taxa_credito)];
    if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return void toast.error("Use percentuais entre 0 e 100.");
    if (!f.hora_inicio || !f.hora_fim || f.hora_fim <= f.hora_inicio) return void toast.error("O fim do expediente deve ser depois do início.");
    if (!cfg) return;
    setSalvando(true);
    const { error } = await supabase.from("configuracoes").update({
      percentual_ana: vals[0], taxa_debito: vals[1], taxa_credito: vals[2],
      nome_dona: f.nome_dona.trim().slice(0, 60) || "Simone",
      hora_inicio: f.hora_inicio, hora_fim: f.hora_fim,
    }).eq("user_id", cfg.user_id);
    setSalvando(false);
    if (error) return void toast.error("Não foi possível salvar.");
    qc.invalidateQueries({ queryKey: ["config"] });
    toast.success("Ajustes salvos. Valem para os próximos atendimentos.");
  }

  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const field = (k: keyof typeof f, label: string, mode: "decimal" | "text" = "decimal") => (
    <div className="space-y-2">
      <Label htmlFor={`cfg-${k}`}>{label}</Label>
      <Input id={`cfg-${k}`} className="h-12 text-base" inputMode={mode} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  const horaField = (k: "hora_inicio" | "hora_fim", label: string) => (
    <div className="space-y-2">
      <Label htmlFor={`cfg-${k}`}>{label}</Label>
      <Input id={`cfg-${k}`} className="h-12 text-base" type="time" required value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-6 px-5">
        <form onSubmit={salvarCfg} className="space-y-4 rounded-2xl border bg-card p-4">
          <h2 className="text-xl">Divisão e taxas</h2>
          {field("percentual_ana", "Percentual da Ana (%)")}
          {field("nome_dona", "Nome da dona", "text")}
          <div className="grid grid-cols-2 gap-3">
            {field("taxa_debito", "Taxa débito (%)")}
            {field("taxa_credito", "Taxa crédito (%)")}
          </div>
          {(num(f.taxa_debito) === 0 || num(f.taxa_credito) === 0) && (
            <p className="flex gap-2 rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Taxa em 0%: pagamentos no cartão entram sem desconto no líquido. Confira a taxa da sua maquininha.</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {horaField("hora_inicio", "Início do expediente")}
            {horaField("hora_fim", "Fim do expediente")}
          </div>
          <Button type="submit" size="xl" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </form>

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl">Serviços</h2>
            <Button type="button" variant="secondary" className="h-11 rounded-xl px-4" onClick={() => setEditandoServico("novo")}>
              <Plus /> Novo
            </Button>
          </div>
          <ul className="-mx-4 divide-y border-t">
            {servicos.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setEditandoServico(s)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-medium", !s.ativo && "text-muted-foreground line-through")}>{s.nome}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums">
                      {brl(s.preco_padrao)} · {formatarDuracao(s.duracao_min)}{!s.ativo ? " · inativo" : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <Link
          to="/estatisticas"
          className="flex h-14 items-center justify-between rounded-2xl border bg-card px-4 font-medium active:bg-muted"
        >
          <span className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" aria-hidden /> Estatísticas</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>

        <div className="space-y-2">
          {user.email && (
            <p className="text-center text-sm text-muted-foreground">
              Conectada como <span className="font-medium text-foreground">{user.email}</span>
            </p>
          )}
          <Button variant="outline" className="h-12 w-full rounded-2xl" onClick={sair}><LogOut /> Sair</Button>
        </div>
      </div>
      <ServicoForm
        aberto={editandoServico !== null}
        onAberto={(o) => !o && setEditandoServico(null)}
        servico={editandoServico === "novo" ? null : editandoServico}
      />
    </>
  );
}
