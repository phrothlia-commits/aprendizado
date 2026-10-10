/**
 * Fontes legais permitidas (seção 2 do pedido da camada de IA).
 *
 * A mesma lista alimenta `allowed_domains` da busca na web (a busca só retorna
 * resultados destes domínios) e a classificação de cada link no servidor.
 * Qualquer URL fora desta lista é descartada, mesmo que apareça na busca.
 */

export type Categoria = "dominio_publico" | "acesso_aberto" | "oficial" | "curso_gratuito" | "protegido_legal";
export type TipoFonte = "texto" | "video" | "audio" | "curso" | "lei";

export type RegraDominio = {
  dominio: string;
  categoria: Categoria;
  tipo: TipoFonte;
  gratuita: boolean;
  acesso: string;
  /** Só obras de domínio público ou acesso aberto em fontes oficiais podem ser baixadas para a biblioteca. */
  permiteDownload: boolean;
};

// Ordem importa: o domínio mais específico vem antes (ex.: cs50.harvard.edu antes de harvard.edu).
export const REGRAS: RegraDominio[] = [
  // 1. Domínio público
  { dominio: "dominiopublico.gov.br", categoria: "dominio_publico", tipo: "texto", gratuita: true, acesso: "domínio público", permiteDownload: true },
  { dominio: "gutenberg.org", categoria: "dominio_publico", tipo: "texto", gratuita: true, acesso: "domínio público", permiteDownload: true },
  { dominio: "wikisource.org", categoria: "dominio_publico", tipo: "texto", gratuita: true, acesso: "domínio público", permiteDownload: true },
  { dominio: "librivox.org", categoria: "dominio_publico", tipo: "audio", gratuita: true, acesso: "domínio público (audiolivro)", permiteDownload: false },
  { dominio: "openlibrary.org", categoria: "protegido_legal", tipo: "texto", gratuita: true, acesso: "empréstimo gratuito (Open Library)", permiteDownload: false },
  // Internet Archive hospeda também uploads de terceiros: só exibimos o link, sem download automático.
  { dominio: "archive.org", categoria: "dominio_publico", tipo: "texto", gratuita: true, acesso: "domínio público ou empréstimo (Internet Archive)", permiteDownload: false },

  // 2. Acesso aberto
  { dominio: "scielo.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "acesso aberto", permiteDownload: true },
  { dominio: "scielo.org", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "acesso aberto", permiteDownload: true },
  { dominio: "scholar.google.com", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "busca acadêmica", permiteDownload: false },
  { dominio: "openstax.org", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "livro-texto aberto", permiteDownload: true },
  { dominio: "doaj.org", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "acesso aberto", permiteDownload: false },
  { dominio: "arxiv.org", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "acesso aberto (preprint)", permiteDownload: true },
  { dominio: "ncbi.nlm.nih.gov", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "acesso aberto (PubMed Central)", permiteDownload: false },
  { dominio: "plato.stanford.edu", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "enciclopédia acadêmica aberta", permiteDownload: false },
  { dominio: "ocw.mit.edu", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso gratuito (MIT OpenCourseWare)", permiteDownload: false },
  { dominio: "cs50.harvard.edu", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso gratuito (Harvard)", permiteDownload: false },
  { dominio: "oyc.yale.edu", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso gratuito (Yale)", permiteDownload: false },
  { dominio: "usp.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (USP)", permiteDownload: false },
  { dominio: "unicamp.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (Unicamp)", permiteDownload: false },
  { dominio: "ufrgs.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (UFRGS)", permiteDownload: false },
  { dominio: "ufrj.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (UFRJ)", permiteDownload: false },
  { dominio: "ufmg.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (UFMG)", permiteDownload: false },
  { dominio: "fgv.br", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "FGV (acesso aberto)", permiteDownload: false },
  { dominio: "harvard.edu", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (Harvard)", permiteDownload: false },
  { dominio: "stanford.edu", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (Stanford)", permiteDownload: false },
  { dominio: "mit.edu", categoria: "acesso_aberto", tipo: "texto", gratuita: true, acesso: "universidade (MIT)", permiteDownload: false },

  // 3. Documentos oficiais
  { dominio: "planalto.gov.br", categoria: "oficial", tipo: "lei", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "camara.leg.br", categoria: "oficial", tipo: "lei", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "senado.leg.br", categoria: "oficial", tipo: "lei", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "stf.jus.br", categoria: "oficial", tipo: "lei", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "tse.jus.br", categoria: "oficial", tipo: "lei", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "bcb.gov.br", categoria: "oficial", tipo: "texto", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "ibge.gov.br", categoria: "oficial", tipo: "texto", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "ipea.gov.br", categoria: "oficial", tipo: "texto", gratuita: true, acesso: "documento oficial", permiteDownload: true },
  { dominio: "gov.br", categoria: "oficial", tipo: "texto", gratuita: true, acesso: "documento oficial", permiteDownload: true },

  // 4. Cursos e palestras gratuitos oficiais
  { dominio: "ted.com", categoria: "curso_gratuito", tipo: "video", gratuita: true, acesso: "palestra gratuita (TED)", permiteDownload: false },
  { dominio: "khanacademy.org", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso gratuito (Khan Academy)", permiteDownload: false },
  { dominio: "coursera.org", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso (auditoria gratuita na Coursera)", permiteDownload: false },
  { dominio: "edx.org", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso (auditoria gratuita no edX)", permiteDownload: false },
  { dominio: "mru.org", categoria: "curso_gratuito", tipo: "curso", gratuita: true, acesso: "curso gratuito (Marginal Revolution University)", permiteDownload: false },
  { dominio: "bbc.co.uk", categoria: "curso_gratuito", tipo: "audio", gratuita: true, acesso: "conteúdo gratuito (BBC)", permiteDownload: false },
  { dominio: "3blue1brown.com", categoria: "curso_gratuito", tipo: "video", gratuita: true, acesso: "vídeo gratuito (canal oficial)", permiteDownload: false },
  { dominio: "youtube.com", categoria: "curso_gratuito", tipo: "video", gratuita: true, acesso: "vídeo gratuito (canal oficial)", permiteDownload: false },

  // 5. Livros protegidos: somente prévia, empréstimo, assinatura ou compra
  { dominio: "books.google.com", categoria: "protegido_legal", tipo: "texto", gratuita: true, acesso: "prévia oficial (Google Livros)", permiteDownload: false },
  { dominio: "audible.com.br", categoria: "protegido_legal", tipo: "audio", gratuita: false, acesso: "assinatura (Audible)", permiteDownload: false },
  { dominio: "audible.com", categoria: "protegido_legal", tipo: "audio", gratuita: false, acesso: "assinatura (Audible)", permiteDownload: false },
  { dominio: "storytel.com", categoria: "protegido_legal", tipo: "audio", gratuita: false, acesso: "assinatura (Storytel)", permiteDownload: false },
  { dominio: "amazon.com.br", categoria: "protegido_legal", tipo: "texto", gratuita: false, acesso: "compra ou Kindle Unlimited", permiteDownload: false },
  { dominio: "amazon.com", categoria: "protegido_legal", tipo: "texto", gratuita: false, acesso: "compra ou Kindle Unlimited", permiteDownload: false },
];

/**
 * Domínios que o rastreador da Anthropic não acessa: a API recusa a busca inteira (erro 400)
 * se algum deles estiver em `allowed_domains`. Continuam valendo para classificar links.
 */
const FORA_DA_BUSCA = new Set(["bbc.co.uk"]);

/** Domínios para `allowed_domains` da busca (subdomínios incluídos). Limite da API: 64. */
export const DOMINIOS_BUSCA: string[] = [...new Set(REGRAS.map((r) => r.dominio))].filter((d) => !FORA_DA_BUSCA.has(d));

/** Indícios de cópia não autorizada ou download direto que nunca exibimos para obras protegidas. */
const PADROES_PROIBIDOS = [/torrent/i, /baixar[-_ ]?gr[aá]tis/i, /download[-_ ]?free/i, /pdf[-_ ]?gr[aá]tis/i, /libgen/i, /z-?lib/i];

export type Classificacao = RegraDominio & { url: string; host: string };

export function hostDe(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function regraPara(host: string): RegraDominio | null {
  return REGRAS.find((r) => host === r.dominio || host.endsWith("." + r.dominio)) ?? null;
}

/**
 * Classifica um link. Retorna null quando a fonte não é permitida:
 * domínio fora da lista, protocolo inválido, padrão de cópia não autorizada,
 * ou arquivo (PDF/EPUB) em categoria protegida.
 */
export function classificarFonte(url: string): Classificacao | null {
  const host = hostDe(url);
  if (!host) return null;
  const regra = regraPara(host);
  if (!regra) return null;
  if (PADROES_PROIBIDOS.some((p) => p.test(url))) return null;
  const caminho = new URL(url).pathname.toLowerCase();
  const ehArquivo = /\.(pdf|epub|mobi|azw3?|djvu|zip|rar)$/.test(caminho) || caminho.includes("/download/");
  // Para obras protegidas só valem páginas (prévia, empréstimo, assinatura, compra), nunca arquivos.
  if (ehArquivo && (regra.categoria === "protegido_legal" || regra.dominio === "archive.org")) return null;
  const tipo: TipoFonte = /youtube\.com|ted\.com\/talks|\/video/.test(url) && regra.tipo === "texto" ? "video" : regra.tipo;
  return { ...regra, tipo, url, host };
}
