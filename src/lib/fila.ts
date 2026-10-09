/**
 * Montagem da fila de revisão (regras de fila da seção 10):
 * - limites diários de novos e de revisões;
 * - revisões vencidas têm prioridade sobre novos;
 * - intercalação entre pilares (round-robin), com filtro opcional por pilar.
 */
export type CartaoFila = {
  id: string;
  pilar_id: string | null;
  proxima_revisao: string | null;
  posicao: number;
};

export function intercalarPorPilar<T extends { pilar_id: string | null }>(cartoes: T[]): T[] {
  const grupos = new Map<string, T[]>();
  for (const c of cartoes) {
    const k = c.pilar_id ?? "-";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  }
  const listas = [...grupos.values()];
  const saida: T[] = [];
  for (let i = 0; saida.length < cartoes.length; i++) for (const l of listas) if (i < l.length) saida.push(l[i]);
  return saida;
}

export function montarFila<T extends CartaoFila>(params: {
  vencidos: T[];
  novos: T[];
  limiteRevisoes: number;
  limiteNovos: number;
  revisoesFeitasHoje: number;
  novosFeitosHoje: number;
  pilarId?: string | null;
}): { fila: T[]; vencidosTotal: number; novosTotal: number } {
  const filtro = (c: T) => !params.pilarId || c.pilar_id === params.pilarId;
  const vencidos = params.vencidos
    .filter(filtro)
    .sort((a, b) => (a.proxima_revisao ?? "").localeCompare(b.proxima_revisao ?? ""));
  const novos = params.novos.filter(filtro).sort((a, b) => a.posicao - b.posicao);

  const cotaRev = Math.max(0, params.limiteRevisoes - params.revisoesFeitasHoje);
  const cotaNovos = Math.max(0, Math.min(params.limiteNovos - params.novosFeitosHoje, cotaRev - Math.min(vencidos.length, cotaRev)));

  // Os mais atrasados primeiro, depois intercalados por pilar.
  const rev = intercalarPorPilar(vencidos.slice(0, cotaRev));
  const nov = intercalarPorPilar(novos.slice(0, cotaNovos));
  return { fila: [...rev, ...nov], vencidosTotal: rev.length, novosTotal: nov.length };
}
