/** "1 falta", "5 faltas", "0 faltas". */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Duração em minutos para leitura: 30 → "30 min", 60 → "1h", 90 → "1h30", 150 → "2h30". */
export function formatarDuracao(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
