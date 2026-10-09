/** Datas no fuso do dispositivo, como 'AAAA-MM-DD'. */
export function dataLocal(d: Date = new Date()): string {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${a}-${m}-${dia}`;
}

/** Converte 'AAAA-MM-DD' para Date à meia-noite local. */
export function deDataLocal(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(s: string, n: number): string {
  const d = deDataLocal(s);
  d.setDate(d.getDate() + n);
  return dataLocal(d);
}

/** Diferença em dias de calendário (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = deDataLocal(b).getTime() - deDataLocal(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function fimDoDia(d: Date = new Date()): Date {
  const f = new Date(d);
  f.setHours(23, 59, 59, 999);
  return f;
}

export function inicioDoDia(d: Date = new Date()): Date {
  const f = new Date(d);
  f.setHours(0, 0, 0, 0);
  return f;
}

export function formatarData(s: string): string {
  const t = deDataLocal(s).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
