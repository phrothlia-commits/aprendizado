/**
 * Formatos de resposta da IA (structured outputs) e montagem do que é salvo.
 * A IA nunca escreve URLs: referencia fontes da busca por S1, S2… e trechos da
 * biblioteca por T1, T2…; o servidor troca esses identificadores pelos dados reais.
 */
import { z } from "zod";

export const PerguntaResposta = z.object({ pergunta: z.string(), resposta: z.string() });

export const Referencia = z.object({
  fonte_id: z.string().nullable().describe("Identificador da fonte da busca (S1, S2…) ou null"),
  trecho_id: z.string().nullable().describe("Identificador do trecho da biblioteca (T1, T2…) ou null"),
  citacao: z.string().describe("Autor, obra e capítulo/página ou dispositivo de lei"),
});

export const CartaoProposto = z.object({
  frente: z.string(),
  verso: z.string(),
  tipo: z.enum(["basico", "por_que"]),
  tags: z.array(z.string()),
  fonte: z.string(),
});

export const AulaIA = z.object({
  titulo: z.string(),
  objetivo: z.string(),
  pre_teste: z.array(PerguntaResposta),
  blocos: z.array(
    z.object({
      titulo: z.string(),
      texto: z.string().describe("Parágrafos separados por linha em branco; marcadores [1], [2] apontam para `referencias` deste bloco"),
      analogia_ou_exemplo: z.string(),
      referencias: z.array(Referencia),
      perguntas_recuperacao: z.array(PerguntaResposta),
    }),
  ),
  para_ir_alem: z.array(
    z.object({
      fonte_id: z.string(),
      tipo: z.enum(["texto", "video", "audio", "curso", "lei"]),
      autor: z.string().nullable(),
      por_que: z.string(),
    }),
  ),
  cartoes: z.array(CartaoProposto),
});
export type AulaIA = z.infer<typeof AulaIA>;

export const FeynmanIA = z.object({
  correto: z.array(z.string()),
  lacunas: z.array(z.string()),
  erros: z.array(z.object({ trecho: z.string(), correcao: z.string(), referencia: z.string() })),
  perguntas: z.array(z.string()),
  cartoes: z.array(CartaoProposto),
  atingiu_criterio: z.boolean(),
  referencias: z.array(z.string()),
});
export type FeynmanIA = z.infer<typeof FeynmanIA>;

/** Correção pontual da aula: só os itens que falharam na conferência. */
export const CorrecaoIA = z.object({
  objetivo: z.string().nullable().describe("Novo objetivo, ou null se o objetivo não foi apontado como problema"),
  pre_teste: z.array(PerguntaResposta).nullable().describe("Pré-teste completo (2 ou 3 perguntas), ou null"),
  blocos: z
    .array(
      z.object({
        indice: z.number().int().describe("Índice do bloco (começa em 0), como veio na lista de problemas"),
        referencias: z.array(Referencia).nullable().describe("Lista COMPLETA de referências do bloco, na ordem dos marcadores [k] do texto, ou null"),
        perguntas_recuperacao: z.array(PerguntaResposta).nullable().describe("Perguntas de recuperação do bloco, ou null"),
      }),
    )
    .describe("Somente os blocos apontados nos problemas"),
  cartoes: z.array(CartaoProposto).nullable().describe("Lista completa de 3 a 8 cartões, ou null"),
});
export type CorrecaoIA = z.infer<typeof CorrecaoIA>;

/** "Explicar de outro jeito": nova explicação de um bloco. */
export const ExplicacaoIA = z.object({
  explicacao: z.string().describe("A mesma ideia por outro caminho, em 80 a 200 palavras; parágrafos separados por linha em branco"),
  analogia: z.string().describe("Uma analogia ou exemplo concreto diferente do original"),
});
export type ExplicacaoIA = z.infer<typeof ExplicacaoIA>;

// ---------------------------------------------------------------------------
// Montagem da aula salva

export type FonteVerificada = {
  id: string; // S1, S2…
  url: string;
  titulo: string;
  tipo: "texto" | "video" | "audio" | "curso" | "lei";
  categoria: string;
  acesso: string;
  gratuita: boolean;
  permiteDownload: boolean;
};

export type TrechoBiblioteca = {
  id: string; // T1, T2…
  arquivo_id: string;
  titulo: string;
  autor: string | null;
  capitulo: string | null;
  pagina: number | null;
  texto: string;
};

export type RefNumerada = {
  n: number;
  citacao: string;
  url: string | null;
  titulo: string | null;
  acesso: string | null;
  origem: "busca" | "biblioteca" | "obra";
  arquivo_id: string | null;
};

export type AulaSalva = {
  titulo: string;
  objetivo: string;
  pre_teste: { pergunta: string; resposta: string }[];
  blocos: {
    titulo: string;
    paragrafos: { texto: string; refs: number[] }[];
    analogia: string;
    perguntas: { pergunta: string; resposta: string }[];
    /** Gerada sob demanda em "Explicar de outro jeito"; guardada para não chamar a API de novo. */
    alternativa?: ExplicacaoIA;
  }[];
  referencias: RefNumerada[];
  para_ir_alem: (FonteVerificada & { autor: string | null; por_que: string })[];
  cartoes: z.infer<typeof CartaoProposto>[];
  avisos: string[];
};

const limpar = (s: string) => s.replace(/\s+\n/g, "\n").trim();

/** Remove qualquer URL que a IA tenha escrito no texto (links só vêm da busca verificada). */
export function semUrls(s: string): string {
  return s.replace(/\bhttps?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "").replace(/[ \t]{2,}/g, " ");
}

export function montarAula(ia: AulaIA, fontes: FonteVerificada[], trechos: TrechoBiblioteca[], avisos: string[] = []): AulaSalva {
  const porFonte = new Map(fontes.map((f) => [f.id.toUpperCase(), f]));
  const porTrecho = new Map(trechos.map((t) => [t.id.toUpperCase(), t]));
  const referencias: RefNumerada[] = [];
  const chaves = new Map<string, number>();

  function numerar(r: z.infer<typeof Referencia>): number | null {
    const fonte = r.fonte_id ? porFonte.get(r.fonte_id.trim().toUpperCase()) : undefined;
    const trecho = r.trecho_id ? porTrecho.get(r.trecho_id.trim().toUpperCase()) : undefined;
    const citacao = semUrls(r.citacao).trim();
    if (!fonte && !trecho && !citacao) return null;
    const chave = fonte ? `S:${fonte.url}` : trecho ? `T:${trecho.arquivo_id}:${trecho.capitulo}:${trecho.pagina}` : `O:${citacao.toLowerCase()}`;
    const existente = chaves.get(chave);
    if (existente) return existente;
    const n = referencias.length + 1;
    chaves.set(chave, n);
    if (fonte) {
      referencias.push({ n, citacao: citacao || fonte.titulo, url: fonte.url, titulo: fonte.titulo, acesso: fonte.acesso, origem: "busca", arquivo_id: null });
    } else if (trecho) {
      const local = [trecho.capitulo, trecho.pagina ? `p. ${trecho.pagina}` : null].filter(Boolean).join(", ");
      referencias.push({
        n,
        citacao: [trecho.autor, trecho.titulo, local].filter(Boolean).join(" · "),
        url: null,
        titulo: trecho.titulo,
        acesso: "Na sua biblioteca",
        origem: "biblioteca",
        arquivo_id: trecho.arquivo_id,
      });
    } else {
      referencias.push({ n, citacao, url: null, titulo: null, acesso: null, origem: "obra", arquivo_id: null });
    }
    return n;
  }

  const blocos = ia.blocos.map((b) => {
    const locais = b.referencias.map(numerar);
    const paragrafos = semUrls(b.texto)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const refs: number[] = [];
        const texto = p
          .replace(/\[(\d+)\]/g, (_, k: string) => {
            const global = locais[Number(k) - 1];
            if (global && !refs.includes(global)) refs.push(global);
            return "";
          })
          .replace(/\s+([.,;:!?])/g, "$1")
          .trim();
        return { texto: limpar(texto), refs };
      });
    // Referências do bloco que não apareceram no texto vão para o último parágrafo.
    const usadas = new Set(paragrafos.flatMap((p) => p.refs));
    const soltas = locais.filter((n): n is number => n !== null && !usadas.has(n));
    if (soltas.length && paragrafos.length) paragrafos[paragrafos.length - 1].refs.push(...soltas);
    return {
      titulo: b.titulo.trim(),
      paragrafos,
      analogia: semUrls(b.analogia_ou_exemplo).trim(),
      perguntas: b.perguntas_recuperacao,
    };
  });

  const vistos = new Set<string>();
  let para_ir_alem = ia.para_ir_alem
    .map((p) => {
      const f = porFonte.get(p.fonte_id.trim().toUpperCase());
      if (!f || vistos.has(f.url)) return null;
      vistos.add(f.url);
      return { ...f, tipo: p.tipo ?? f.tipo, autor: p.autor, por_que: semUrls(p.por_que).trim() };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  // Se a IA não escolheu nenhuma, oferece as primeiras fontes verificadas.
  if (!para_ir_alem.length) para_ir_alem = fontes.slice(0, 4).map((f) => ({ ...f, autor: null, por_que: "" }));

  const cartoes = ia.cartoes
    .filter((c) => c.frente.trim() && c.verso.trim())
    .slice(0, 8)
    .map((c) => ({
      ...c,
      frente: semUrls(c.frente).trim(),
      verso: semUrls(c.verso).trim(),
      tags: [...new Set(c.tags.map((t) => t.toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean))],
      fonte: semUrls(c.fonte).trim(),
    }));

  return {
    titulo: ia.titulo.trim(),
    objetivo: ia.objetivo.trim(),
    pre_teste: ia.pre_teste.slice(0, 3),
    blocos,
    referencias,
    para_ir_alem,
    cartoes,
    avisos,
  };
}
