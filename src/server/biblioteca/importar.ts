/**
 * "Adicionar à biblioteca": baixa uma obra de domínio público, acesso aberto
 * ou fonte oficial, SOMENTE de domínios marcados com `permiteDownload`.
 * Cada redirecionamento é verificado de novo (nada de sair da lista no meio do caminho).
 */
import { classificarFonte } from "../fontes/dominios";
import { ErroApp } from "../ia/erros";

export const TAMANHO_MAXIMO = 50 * 1024 * 1024;

export type Formato = "pdf" | "epub" | "txt" | "html";

export function urlPermitidaParaDownload(url: string): boolean {
  const c = classificarFonte(url);
  return !!c && c.permiteDownload && url.startsWith("https://");
}

/** Projeto Gutenberg: a página da obra vira o arquivo de texto integral. */
export function normalizarUrlDownload(url: string): string {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  const gutenberg = host === "gutenberg.org" && u.pathname.match(/^\/ebooks\/(\d+)\/?$/);
  if (gutenberg) return `https://www.gutenberg.org/ebooks/${gutenberg[1]}.txt.utf-8`;
  return url;
}

export function formatoDe(tipoConteudo: string, url: string): Formato | null {
  const t = tipoConteudo.toLowerCase();
  const caminho = new URL(url).pathname.toLowerCase();
  if (t.includes("application/pdf") || caminho.endsWith(".pdf")) return "pdf";
  if (t.includes("application/epub") || caminho.endsWith(".epub") || caminho.includes(".epub")) return "epub";
  if (t.includes("text/plain") || caminho.endsWith(".txt") || caminho.endsWith(".txt.utf-8")) return "txt";
  if (t.includes("text/html") || t.includes("application/xhtml")) return "html";
  return null;
}

export async function baixarObraAberta(
  urlOriginal: string,
  f: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; formato: Formato; urlFinal: string }> {
  if (!urlPermitidaParaDownload(urlOriginal)) {
    throw new ErroApp(
      "fonte_nao_permitida",
      400,
      "Só é possível adicionar obras de domínio público, de acesso aberto ou de fontes oficiais. Para livros protegidos, use a prévia, o empréstimo ou a compra, e envie o arquivo que você adquiriu.",
    );
  }
  let url = normalizarUrlDownload(urlOriginal);
  for (let saltos = 0; saltos < 6; saltos++) {
    const r = await f(url, { redirect: "manual", headers: { "user-agent": "TrilhaDeEstudos/1.0 (biblioteca pessoal)" } });
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get("location");
      if (!destino) break;
      const proximo = new URL(destino, url).toString();
      if (!urlPermitidaParaDownload(proximo)) {
        throw new ErroApp("fonte_nao_permitida", 400, "O link redirecionou para um site fora da lista de fontes legais. Download cancelado.");
      }
      url = proximo;
      continue;
    }
    if (!r.ok) throw new ErroApp("arquivo_invalido", 502, `A fonte respondeu com erro ${r.status}. Tente outro link.`);
    const tamanho = Number(r.headers.get("content-length") ?? 0);
    if (tamanho > TAMANHO_MAXIMO) throw new ErroApp("arquivo_invalido", 413, "Arquivo maior que 50 MB.");
    const formato = formatoDe(r.headers.get("content-type") ?? "", url);
    if (!formato) throw new ErroApp("arquivo_invalido", 415, "O link não aponta para PDF, EPUB, texto ou página com o texto integral.");
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > TAMANHO_MAXIMO) throw new ErroApp("arquivo_invalido", 413, "Arquivo maior que 50 MB.");
    return { bytes, formato, urlFinal: url };
  }
  throw new ErroApp("arquivo_invalido", 502, "Muitos redirecionamentos. Tente o link direto do arquivo.");
}
