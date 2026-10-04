import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { Cliente } from "@/lib/data";

export const CONSENT_TEXT =
  "A cliente autoriza o armazenamento dos dados de saúde para fins de atendimento";

export type ClienteInput = Omit<Cliente, "id" | "user_id" | "created_at">;

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(120),
  telefone: z.string().trim().max(30),
});

export function emptyCliente(): ClienteInput {
  return {
    nome: "", telefone: "", data_nascimento: null, consentimento_lgpd: false,
    consentimento_data: null, alergias: "", gestante: false, diabetes_circulacao: false,
    problema_unhas: "", medicamentos: "", observacoes: "",
  };
}

export function ClienteForm({
  initial, onSubmit, submitLabel, compact = false,
}: {
  initial: ClienteInput;
  onSubmit: (v: ClienteInput) => Promise<void>;
  submitLabel: string;
  compact?: boolean;
}) {
  const [v, setV] = useState<ClienteInput>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ClienteInput>(k: K, val: ClienteInput[K]) => setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = schema.safeParse({ nome: v.nome ?? "", telefone: v.telefone ?? "" });
    if (!r.success) return void toast.error(r.error.issues[0]?.message ?? "Dados inválidos");
    if (!v.consentimento_lgpd) return void toast.error("O consentimento da cliente é obrigatório.");
    setSaving(true);
    try {
      await onSubmit({
        ...v,
        nome: r.data.nome,
        telefone: r.data.telefone,
        consentimento_data: v.consentimento_data ?? new Date().toISOString(),
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const txt = (k: "alergias" | "problema_unhas" | "medicamentos" | "observacoes", label: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} maxLength={1000} className="text-base" />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input className="h-12 text-base" value={v.nome} onChange={(e) => set("nome", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Telefone</Label>
        <Input className="h-12 text-base" type="tel" inputMode="tel" value={v.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
      </div>
      {!compact && (
        <>
          <div className="space-y-2">
            <Label>Data de nascimento</Label>
            <Input className="h-12 text-base" type="date" value={v.data_nascimento ?? ""} onChange={(e) => set("data_nascimento", e.target.value || null)} />
          </div>
          <h3 className="pt-2 text-xl">Anamnese</h3>
          {txt("alergias", "Alergias")}
          <label className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <span>Gestante</span>
            <Switch checked={v.gestante} onCheckedChange={(c) => set("gestante", c)} />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <span>Diabetes / problemas de circulação</span>
            <Switch checked={v.diabetes_circulacao} onCheckedChange={(c) => set("diabetes_circulacao", c)} />
          </label>
          {txt("problema_unhas", "Problemas nas unhas")}
          {txt("medicamentos", "Medicamentos")}
          {txt("observacoes", "Observações")}
        </>
      )}
      <label className="flex items-start gap-3 rounded-xl border border-primary/30 bg-secondary p-4">
        <Checkbox
          className="mt-0.5 size-5"
          checked={v.consentimento_lgpd}
          onCheckedChange={(c) => set("consentimento_lgpd", c === true)}
        />
        <span className="text-sm text-secondary-foreground">{CONSENT_TEXT} *</span>
      </label>
      <Button type="submit" size="xl" disabled={saving}>
        {saving ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
