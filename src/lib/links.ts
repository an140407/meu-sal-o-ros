import { dataBR, diaSemana, horaDeMinutos, horaHM, minutos, somarDias } from "./format";

/**
 * Telefone no formato do wa.me (só dígitos, com DDI 55) ou null se inválido.
 * 10/11 dígitos = DDD + número; 12/13 começando com 55 = já tem DDI.
 */
export function normalizarTelefone(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  return null;
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/** Link do WhatsApp com mensagem livre, ou null se o telefone não é válido. */
export function linkWhatsappTexto(telefone: string | null | undefined, mensagem: string): string | null {
  const tel = normalizarTelefone(telefone);
  return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}` : null;
}

export const mensagemRetorno = (nome: string, dias: number) =>
  `Oi, ${primeiroNome(nome)}! Já faz ${dias} dias do seu último atendimento. Vamos agendar sua manutenção?`;

export const mensagemAniversario = (nome: string) =>
  `Parabéns, ${primeiroNome(nome)}! Desejo um dia lindo para você.`;

/** Link de confirmação por WhatsApp, ou null se a cliente não tem telefone válido. */
export function linkWhatsapp(a: {
  telefone: string | null | undefined;
  cliente: string;
  servico: string;
  data: string;
  hora: string | null;
}): string | null {
  const quando = `${diaSemana(a.data).toLowerCase()}, ${dataBR(a.data).slice(0, 5)}${a.hora ? `, às ${horaHM(a.hora)}` : ""}`;
  const msg = `Oi, ${primeiroNome(a.cliente)}! Passando para confirmar seu horário de ${quando} (${a.servico}). Pode confirmar?`;
  return linkWhatsappTexto(a.telefone, msg);
}

/** "YYYY-MM-DD" + minutos desde 00:00 do dia → "YYYYMMDDTHHMMSS" (hora local, sem Z). */
const dataHoraGoogle = (data: string, min: number) => {
  const dia = somarDias(data, Math.floor(min / 1440));
  return `${dia.replace(/-/g, "")}T${horaDeMinutos(min % 1440).replace(":", "")}00`;
};

/** Link para criar o evento no Google Agenda, ou null se o agendamento não tem horário. */
export function linkGoogleAgenda(a: {
  servico: string;
  cliente: string;
  data: string;
  hora: string | null;
  duracaoMin: number;
  observacoes?: string | null;
}): string | null {
  if (!a.hora) return null;
  const inicio = minutos(a.hora);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${a.servico} — ${a.cliente}`,
    dates: `${dataHoraGoogle(a.data, inicio)}/${dataHoraGoogle(a.data, inicio + a.duracaoMin)}`,
    ctz: "America/Sao_Paulo",
  });
  const obs = a.observacoes?.trim();
  if (obs) params.set("details", obs);
  return `https://calendar.google.com/calendar/render?${params}`;
}
