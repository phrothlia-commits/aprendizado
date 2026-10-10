/**
 * Conferência automática da aula antes de mostrá-la (sem IA): citações apontam para
 * fontes verificadas, cada bloco tem citação e perguntas, há objetivo, pré-teste e de
 * 3 a 8 cartões, e nenhum link fora da lista de domínios. O que dá para corrigir sem
 * IA é corrigido aqui; o resto vai numa única chamada de correção.
 */
import { classificarFonte } from "../fontes/dominios";
import type { AulaIA, CorrecaoIA, FonteVerificada, TrechoBiblioteca } from "./schemas";

export type Problema = {
  tipo: "objetivo" | "pre_teste" | "bloco_sem_citacao" | "citacao_invalida" | "bloco_sem_perguntas" | "poucos_cartoes" | "sem_por_que" | "link_fora_da_lista";
  bloco?: number;
  descricao: string;
  /** true quando a conferência resolve sem IA (ex.: tirar link, cortar cartões a mais). */
  semIA: boolean;
};

const URL_RE = /\bhttps?:\/\/[^\s)\]]+/gi;

function textosDaAula(a: AulaIA): string[] {
  return [
    a.titulo,
    a.objetivo,
    ...a.pre_teste.flatMap((p) => [p.pergunta, p.resposta]),
    ...a.blocos.flatMap((b) => [b.titulo, b.texto, b.analogia_ou_exemplo, ...b.referencias.map((r) => r.citacao), ...b.perguntas_recuperacao.flatMap((p) => [p.pergunta, p.resposta])]),
    ...a.para_ir_alem.map((p) => p.por_que),
    ...a.cartoes.flatMap((c) => [c.frente, c.verso, c.fonte]),
  ];
}

function refValida(r: AulaIA["blocos"][number]["referencias"][number], fontes: Set<string>, trechos: Set<string>): boolean {
  if (r.fonte_id) return fontes.has(r.fonte_id.trim().toUpperCase());
  if (r.trecho_id) return trechos.has(r.trecho_id.trim().toUpperCase());
  return r.citacao.trim().length >= 5; // obra conhecida (autor, obra, capítulo)
}

export function conferirAula(a: AulaIA, fontes: FonteVerificada[], trechos: TrechoBiblioteca[]): Problema[] {
  const ids = new Set(fontes.map((f) => f.id.toUpperCase()));
  const tids = new Set(trechos.map((t) => t.id.toUpperCase()));
  const p: Problema[] = [];
  if (a.objetivo.trim().length < 15) p.push({ tipo: "objetivo", descricao: "Falta o objetivo da aula (1 a 2 frases).", semIA: false });
  if (a.pre_teste.filter((q) => q.pergunta.trim() && q.resposta.trim()).length < 2)
    p.push({ tipo: "pre_teste", descricao: "O pré-teste precisa de 2 ou 3 perguntas com resposta.", semIA: false });
  a.blocos.forEach((b, i) => {
    const invalidas = b.referencias.filter((r) => !refValida(r, ids, tids));
    if (invalidas.length)
      p.push({
        tipo: "citacao_invalida",
        bloco: i,
        descricao: `Bloco ${i} ("${b.titulo}"): citação aponta para fonte inexistente (${invalidas.map((r) => r.fonte_id ?? r.trecho_id ?? "sem id").join(", ")}).`,
        semIA: false,
      });
    else if (!b.referencias.length) p.push({ tipo: "bloco_sem_citacao", bloco: i, descricao: `Bloco ${i} ("${b.titulo}") não tem nenhuma citação.`, semIA: false });
    if (!b.perguntas_recuperacao.some((q) => q.pergunta.trim() && q.resposta.trim()))
      p.push({ tipo: "bloco_sem_perguntas", bloco: i, descricao: `Bloco ${i} ("${b.titulo}") não tem pergunta de recuperação.`, semIA: false });
  });
  const cartoes = a.cartoes.filter((c) => c.frente.trim() && c.verso.trim());
  if (cartoes.length < 3) p.push({ tipo: "poucos_cartoes", descricao: `A aula tem ${cartoes.length} cartões; precisa de 3 a 8.`, semIA: false });
  else if (cartoes.length > 8) p.push({ tipo: "poucos_cartoes", descricao: `A aula tem ${cartoes.length} cartões; o máximo é 8.`, semIA: true });
  if (cartoes.length >= 3 && !cartoes.some((c) => c.tipo === "por_que"))
    p.push({ tipo: "sem_por_que", descricao: "Nenhum cartão de “por quê?”: inclua pelo menos um.", semIA: false });
  const foraDaLista = textosDaAula(a)
    .flatMap((t) => t.match(URL_RE) ?? [])
    .filter((u) => !classificarFonte(u));
  if (foraDaLista.length)
    p.push({ tipo: "link_fora_da_lista", descricao: `Links fora da lista de domínios: ${[...new Set(foraDaLista)].slice(0, 5).join(", ")}`, semIA: true });
  return p;
}

/** Correções que não precisam de IA: cortar cartões a mais (mantendo um de "por quê?"). Links saem em montarAula. */
export function ajustarSemIA(a: AulaIA): AulaIA {
  const cartoes = a.cartoes.filter((c) => c.frente.trim() && c.verso.trim());
  if (cartoes.length <= 8) return { ...a, cartoes };
  const primeiros = cartoes.slice(0, 8);
  const porQue = cartoes.find((c) => c.tipo === "por_que");
  if (porQue && !primeiros.includes(porQue)) primeiros[7] = porQue;
  return { ...a, cartoes: primeiros };
}

/** Aplica a correção pontual devolvida pela IA. */
export function aplicarCorrecao(a: AulaIA, c: CorrecaoIA): AulaIA {
  const blocos = a.blocos.map((b, i) => {
    const fix = c.blocos.find((x) => x.indice === i);
    if (!fix) return b;
    return {
      ...b,
      referencias: fix.referencias?.length ? fix.referencias : b.referencias,
      perguntas_recuperacao: fix.perguntas_recuperacao?.length ? fix.perguntas_recuperacao : b.perguntas_recuperacao,
    };
  });
  return {
    ...a,
    objetivo: c.objetivo?.trim() ? c.objetivo : a.objetivo,
    pre_teste: c.pre_teste && c.pre_teste.length >= 2 ? c.pre_teste.slice(0, 3) : a.pre_teste,
    blocos,
    cartoes: c.cartoes && c.cartoes.length >= 3 ? c.cartoes : a.cartoes,
  };
}

/** Pedido de correção: só os itens que falharam, mais o mínimo para corrigi-los. */
export function pedidoDeCorrecao(a: AulaIA, problemas: Problema[], fontes: FonteVerificada[], trechos: TrechoBiblioteca[]): string {
  const blocos = [...new Set(problemas.map((p) => p.bloco).filter((b): b is number => b !== undefined))];
  const precisaCartoes = problemas.some((p) => p.tipo === "poucos_cartoes" || p.tipo === "sem_por_que");
  const linhas = [
    "Corrija somente os itens abaixo, que falharam na conferência automática da aula. Não reescreva o resto.",
    "",
    "## Problemas",
    ...problemas.map((p) => `- ${p.descricao}`),
    "",
    `## Objetivo atual\n${a.objetivo || "(vazio)"}`,
  ];
  for (const i of blocos) {
    const b = a.blocos[i];
    linhas.push(
      "",
      `## Bloco ${i}: ${b.titulo}`,
      b.texto,
      "Referências atuais (na ordem dos marcadores [k]):",
      ...b.referencias.map((r, k) => `[${k + 1}] fonte_id=${r.fonte_id ?? "null"} trecho_id=${r.trecho_id ?? "null"} citação="${r.citacao}"`),
    );
  }
  if (precisaCartoes) {
    linhas.push("", "## Títulos dos blocos", ...a.blocos.map((b) => `- ${b.titulo}`), "", "## Cartões atuais", ...a.cartoes.map((c) => `- (${c.tipo}) ${c.frente} → ${c.verso}`));
  }
  if (blocos.length) {
    linhas.push(
      "",
      "## Fontes verificadas disponíveis",
      ...(fontes.length ? fontes.map((f) => `[${f.id}] ${f.titulo}`) : ["(nenhuma)"]),
      "## Trechos da biblioteca disponíveis",
      ...(trechos.length ? trechos.map((t) => `[${t.id}] ${t.titulo}${t.capitulo ? ` — ${t.capitulo}` : ""}${t.pagina ? `, p. ${t.pagina}` : ""}`) : ["(nenhum)"]),
    );
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Cartões: um conceito por cartão e sem repetir o que o aluno já tem

const PALAVRAS_VAZIAS = new Set(
  "que para com uma por dos das nos nas como mais qual quais quando onde sobre entre pela pelo isso este esta esse essa ser sao são tem the and what why how does".split(" "),
);

function palavras(t: string): Set<string> {
  return new Set(
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !PALAVRAS_VAZIAS.has(w)),
  );
}

/** Similaridade de Jaccard entre os conjuntos de palavras significativas. */
export function similaridade(a: string, b: string): number {
  const x = palavras(a);
  const y = palavras(b);
  if (!x.size || !y.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let comum = 0;
  for (const w of x) if (y.has(w)) comum++;
  return comum / (x.size + y.size - comum);
}

export const LIMIAR_DUPLICADO = 0.6;

/** Remove cartões cuja frente repete um cartão existente (ou outro novo). */
export function deduplicarCartoes<T extends { frente: string }>(novos: T[], existentes: string[]): { cartoes: T[]; removidos: number } {
  const aceitos: T[] = [];
  for (const c of novos) {
    const repetido = existentes.some((e) => similaridade(c.frente, e) >= LIMIAR_DUPLICADO) || aceitos.some((a) => similaridade(c.frente, a.frente) >= LIMIAR_DUPLICADO);
    if (!repetido) aceitos.push(c);
  }
  return { cartoes: aceitos, removidos: novos.length - aceitos.length };
}
