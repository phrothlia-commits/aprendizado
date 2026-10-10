/**
 * Extração de texto e divisão em trechos com referência (obra, capítulo, página).
 * Funções puras sobre bytes/strings, testáveis sem Storage nem banco.
 */
import { strFromU8, unzipSync } from "fflate";

export type Secao = { capitulo: string | null; pagina: number | null; texto: string };
export type Trecho = Secao & { ordem: number };

const TITULO_CAPITULO = /^\s*((cap[íi]tulo|chapter|parte|part|livro|book|t[íi]tulo|se[çc][ãa]o)\s+([ivxlcdm]+|\d+|[a-zà-ú]+)\b.{0,80}|[ivxlcdm]+\.\s+.{2,60})\s*$/i;

// ---------------------------------------------------------------------------
// HTML

const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", sect: "§", mdash: "—", ndash: "–", hellip: "…", laquo: "«", raquo: "»" };

const DIACRITICOS: Record<string, string> = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327" };

function entidade(m: string, nome: string): string {
  if (ENTIDADES[nome.toLowerCase()]) return ENTIDADES[nome.toLowerCase()];
  // Letras acentuadas: &atilde; &Eacute; &ccedil; …
  const letra = nome.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil)$/);
  return letra ? (letra[1] + DIACRITICOS[letra[2]]).normalize("NFC") : m;
}

export function decodificarEntidades(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, entidade);
}

export function htmlParaTexto(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<(script|style|head|nav|footer)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Texto puro: detecta capítulos por linhas de título

export function secoesDeTexto(texto: string, pagina: number | null = null, capituloInicial: string | null = null): Secao[] {
  const secoes: Secao[] = [];
  let atual: Secao = { capitulo: capituloInicial, pagina, texto: "" };
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    if (TITULO_CAPITULO.test(linha) && linha.trim().length <= 90) {
      if (atual.texto.trim()) secoes.push(atual);
      atual = { capitulo: linha.trim().replace(/\s+/g, " "), pagina, texto: "" };
    } else {
      atual.texto += linha + "\n";
    }
  }
  if (atual.texto.trim()) secoes.push(atual);
  return secoes;
}

// ---------------------------------------------------------------------------
// PDF (página a página, com capítulo detectado no texto)

export async function secoesDePdf(bytes: Uint8Array): Promise<Secao[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const paginas = Array.isArray(text) ? text : [text];
  const secoes: Secao[] = [];
  let capitulo: string | null = null;
  paginas.forEach((t, i) => {
    for (const s of secoesDeTexto(t, i + 1, capitulo)) {
      secoes.push(s);
      capitulo = s.capitulo;
    }
  });
  if (!secoes.some((s) => s.texto.trim())) {
    throw new Error("O PDF não tem texto selecionável (parece digitalizado como imagem). Use uma versão com texto ou EPUB.");
  }
  return secoes;
}

// ---------------------------------------------------------------------------
// EPUB (ordem do spine; capítulo pelo título do arquivo)

function atributo(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1] : null;
}

export function secoesDeEpub(bytes: Uint8Array): { secoes: Secao[]; titulo: string | null; autor: string | null } {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(bytes);
  } catch {
    throw new Error("Arquivo EPUB inválido ou corrompido.");
  }
  const ler = (p: string) => (arquivos[p] ? strFromU8(arquivos[p]) : null);
  const container = ler("META-INF/container.xml");
  const opfCaminho = container ? atributo(container.match(/<rootfile\s[^>]*>/i)?.[0] ?? "", "full-path") : null;
  const opf = opfCaminho ? ler(opfCaminho) : null;
  if (!opf || !opfCaminho) throw new Error("EPUB sem índice (OPF).");
  const base = opfCaminho.includes("/") ? opfCaminho.slice(0, opfCaminho.lastIndexOf("/") + 1) : "";
  const manifesto = new Map<string, string>();
  for (const item of opf.match(/<item\b[^>]*>/gi) ?? []) {
    const id = atributo(item, "id");
    const href = atributo(item, "href");
    if (id && href) manifesto.set(id, decodeURIComponent(href));
  }
  const ordem = (opf.match(/<itemref\b[^>]*>/gi) ?? []).map((i) => atributo(i, "idref")).filter((x): x is string => !!x);
  const titulo = decodificarEntidades(opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]?.trim() ?? "") || null;
  const autor = decodificarEntidades(opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1]?.trim() ?? "") || null;

  const secoes: Secao[] = [];
  ordem.forEach((idref, i) => {
    const href = manifesto.get(idref);
    const html = href ? ler(base + href) : null;
    if (!html) return;
    const cabecalho = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const capitulo = cabecalho ? htmlParaTexto(cabecalho).slice(0, 90) || `Seção ${i + 1}` : `Seção ${i + 1}`;
    const texto = htmlParaTexto(html.replace(/<head[\s\S]*?<\/head>/i, ""));
    if (texto.length > 40) secoes.push({ capitulo, pagina: null, texto });
  });
  if (!secoes.length) throw new Error("Não encontrei texto no EPUB.");
  return { secoes, titulo, autor };
}

// ---------------------------------------------------------------------------
// Destaques do Kindle (My Clippings.txt), em inglês ou português

export type Destaque = { titulo: string; autor: string | null; pagina: number | null; posicao: string | null; texto: string };

export function lerClippings(conteudo: string): Destaque[] {
  const destaques: Destaque[] = [];
  for (const bloco of conteudo.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/^==========\s*$/m)) {
    const linhas = bloco.split("\n").map((l) => l.replace(/^﻿/, ""));
    while (linhas.length && !linhas[0].trim()) linhas.shift();
    if (linhas.length < 3) continue;
    const cabecalho = linhas[0].trim();
    const meta = linhas[1];
    // Notas e marcadores não têm texto de estudo.
    if (/bookmark|marcador|your note|sua nota/i.test(meta)) continue;
    const texto = linhas.slice(2).join("\n").trim();
    if (!texto) continue;
    const autorMatch = cabecalho.match(/\(([^()]*)\)\s*$/);
    const titulo = (autorMatch ? cabecalho.slice(0, autorMatch.index) : cabecalho).trim();
    const pagina = meta.match(/(?:page|p[áa]gina)\s+(\d+)/i)?.[1];
    const posicao = meta.match(/(?:location|posi[çc][ãa]o|loc\.)\s+([\d-]+)/i)?.[1] ?? null;
    destaques.push({ titulo, autor: autorMatch?.[1]?.trim() || null, pagina: pagina ? Number(pagina) : null, posicao, texto });
  }
  return destaques;
}

export function agruparPorLivro(destaques: Destaque[]): Map<string, Destaque[]> {
  const livros = new Map<string, Destaque[]>();
  for (const d of destaques) {
    const chave = `${d.titulo}\u0000${d.autor ?? ""}`;
    if (!livros.has(chave)) livros.set(chave, []);
    livros.get(chave)!.push(d);
  }
  return livros;
}

// ---------------------------------------------------------------------------
// Divisão em trechos (~1.200 caracteres, sem atravessar capítulo nem página)

export function dividirEmTrechos(secoes: Secao[], alvo = 1200): Trecho[] {
  const trechos: Trecho[] = [];
  for (const s of secoes) {
    const paragrafos = s.texto
      .split(/\n\s*\n|\n(?=\s{2,})/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    let atual = "";
    const fechar = () => {
      if (atual.trim()) trechos.push({ capitulo: s.capitulo, pagina: s.pagina, texto: atual.trim(), ordem: trechos.length + 1 });
      atual = "";
    };
    for (const p of paragrafos) {
      if (p.length > alvo * 1.5) {
        fechar();
        // Parágrafo enorme: corta em frases.
        for (const frase of p.match(/[^.!?]+[.!?]+["»”]?\s*|.+$/g) ?? [p]) {
          if ((atual + frase).length > alvo) fechar();
          atual += frase;
        }
        fechar();
        continue;
      }
      if ((atual + "\n\n" + p).length > alvo) fechar();
      atual += (atual ? "\n\n" : "") + p;
    }
    fechar();
  }
  return trechos;
}
