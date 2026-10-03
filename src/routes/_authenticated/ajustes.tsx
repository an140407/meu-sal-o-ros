import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/ui-bits";
import { useConfig, useServicos } from "@/lib/data";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes — Caderno da Nail" },
      { name: "description", content: "Percentuais, taxas e serviços." },
      { property: "og:title", content: "Ajustes — Caderno da Nail" },
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
  const [f, setF] = useState({ percentual_ana: "70", taxa_debito: "0", taxa_credito: "0", nome_dona: "Simone" });
  const [novo, setNovo] = useState({ nome: "", preco: "" });

  useEffect(() => {
    if (cfg) setF({
      percentual_ana: String(cfg.percentual_ana), taxa_debito: String(cfg.taxa_debito),
      taxa_credito: String(cfg.taxa_credito), nome_dona: cfg.nome_dona,
    });
  }, [cfg]);

  const num = (s: string) => Number(s.replace(",", "."));

  async function salvarCfg(e: React.FormEvent) {
    e.preventDefault();
    const vals: [number, number, number] = [num(f.percentual_ana), num(f.taxa_debito), num(f.taxa_credito)];
    if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return void toast.error("Use percentuais entre 0 e 100.");
    if (!cfg) return;
    const { error } = await supabase.from("configuracoes").update({
      percentual_ana: vals[0], taxa_debito: vals[1], taxa_credito: vals[2],
      nome_dona: f.nome_dona.trim().slice(0, 60) || "Simone",
    }).eq("user_id", cfg.user_id);
    if (error) return void toast.error("Não foi possível salvar.");
    qc.invalidateQueries({ queryKey: ["config"] });
    toast.success("Ajustes salvos. Valem para os próximos atendimentos.");
  }

  async function addServico(e: React.FormEvent) {
    e.preventDefault();
    const preco = num(novo.preco || "0");
    if (!novo.nome.trim() || !Number.isFinite(preco) || preco < 0) return void toast.error("Preencha nome e preço.");
    const { error } = await supabase.from("servicos").insert({ nome: novo.nome.trim().slice(0, 80), preco_padrao: preco });
    if (error) return void toast.error("Não foi possível adicionar.");
    setNovo({ nome: "", preco: "" });
    qc.invalidateQueries({ queryKey: ["servicos"] });
  }

  async function updServico(id: string, patch: { ativo?: boolean; preco_padrao?: number }) {
    const { error } = await supabase.from("servicos").update(patch).eq("id", id);
    if (error) return void toast.error("Não foi possível salvar.");
    qc.invalidateQueries({ queryKey: ["servicos"] });
  }

  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const field = (k: keyof typeof f, label: string, mode: "decimal" | "text" = "decimal") => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input className="h-12 text-base" inputMode={mode} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
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
          <Button type="submit" size="xl">Salvar</Button>
        </form>

        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="text-xl">Serviços</h2>
          <ul className="divide-y">
            {servicos.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className={s.ativo ? "font-medium" : "font-medium text-muted-foreground line-through"}>{s.nome}</div>
                  <div className="text-xs text-muted-foreground">{brl(s.preco_padrao)}</div>
                </div>
                <Input
                  className="h-11 w-24 text-base"
                  inputMode="decimal"
                  defaultValue={String(s.preco_padrao)}
                  aria-label={`Preço de ${s.nome}`}
                  onBlur={(e) => {
                    const v = num(e.target.value);
                    if (Number.isFinite(v) && v >= 0 && v !== Number(s.preco_padrao)) updServico(s.id, { preco_padrao: v });
                  }}
                />
                <Switch checked={s.ativo} onCheckedChange={(c) => updServico(s.id, { ativo: c })} aria-label="Ativo" />
              </li>
            ))}
          </ul>
          <form onSubmit={addServico} className="flex gap-2">
            <Input className="h-12 text-base" placeholder="Novo serviço" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <Input className="h-12 w-24 text-base" placeholder="R$" inputMode="decimal" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} />
            <Button type="submit" className="h-12 rounded-xl">Adicionar</Button>
          </form>
        </section>

        <Button variant="outline" className="h-12 w-full rounded-2xl" onClick={sair}><LogOut /> Sair</Button>
      </div>
    </>
  );
}
