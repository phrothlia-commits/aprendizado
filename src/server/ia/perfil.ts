/**
 * Perfil do aluno (até ~300 palavras), montado sem IA a partir do banco. Vai na parte
 * fixa do prompt (com cache), depois da metodologia e antes do pedido do dia.
 */
import type { ConfigIA, DadosPerfil } from "./tipos";

const NIVEL: Record<ConfigIA["nivel"], string> = {
  iniciante: "iniciante (explique termos técnicos na primeira vez)",
  intermediario: "intermediário (pode usar termos técnicos comuns)",
  avancado: "avançado (vá direto ao ponto e aprofunde)",
};

const corte = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function montarPerfil(nivel: ConfigIA["nivel"], d: DadosPerfil): string {
  const linhas = [
    "## Perfil do aluno",
    "Adulto ocupado (empreendedor e gestor de varejo), estuda 30 a 40 minutos por dia.",
    `Nível declarado: ${NIVEL[nivel] ?? NIVEL.iniciante}.`,
  ];
  linhas.push(
    d.aulasConcluidas.length
      ? `Aulas já concluídas neste tema (${d.aulasConcluidas.length}): ${d.aulasConcluidas.slice(-8).map((t) => corte(t, 70)).join("; ")}.`
      : "Ainda não concluiu aulas neste tema.",
  );
  if (d.cartoesMaisErrados.length)
    linhas.push(`Cartões que mais erra (retome estes conceitos quando couber): ${d.cartoesMaisErrados.slice(0, 5).map((t) => `“${corte(t, 90)}”`).join("; ")}.`);
  if (d.lacunasFeynman.length) linhas.push(`Lacunas apontadas pelo Tutor Feynman: ${d.lacunasFeynman.slice(0, 5).map((t) => corte(t, 110)).join("; ")}.`);
  if (d.preTesteErrado.length)
    linhas.push(
      `Perguntas do pré-teste que errou: ${d.preTesteErrado
        .slice(0, 4)
        .map((p) => `“${corte(p.pergunta, 90)}” (gabarito: ${corte(p.resposta, 80)})`)
        .join("; ")}.`,
    );
  // Limite de ~300 palavras.
  const texto = linhas.join("\n");
  const palavras = texto.split(/\s+/);
  return palavras.length > 300 ? palavras.slice(0, 300).join(" ") + "…" : texto;
}
