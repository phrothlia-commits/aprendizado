import { describe, expect, it } from "vitest";
import { dominiosParaBusca } from "../ia/pesquisa";
import { classificarFonte, DOMINIOS_BUSCA, FORA_DA_BUSCA } from "./dominios";
import { verificarLink, verificarLinks } from "./verificar";

describe("domínios fora da busca", () => {
  it("DOMINIOS_BUSCA não inclui os domínios de FORA_DA_BUSCA (a API recusa a busca inteira)", () => {
    for (const d of FORA_DA_BUSCA) expect(DOMINIOS_BUSCA).not.toContain(d);
    expect(DOMINIOS_BUSCA).not.toContain("bbc.co.uk");
  });

  it("classificarFonte continua aceitando bbc.co.uk quando o link chega por outro caminho", () => {
    expect(classificarFonte("https://www.bbc.co.uk/programmes/b006qykl")).toMatchObject({ dominio: "bbc.co.uk", tipo: "audio" });
  });

  it("os domínios recusados pela API (ia_dominios_bloqueados) saem da lista da busca", () => {
    const lista = dominiosParaBusca(DOMINIOS_BUSCA, ["ted.com", "Coursera.org"]);
    expect(lista).not.toContain("ted.com");
    expect(lista).not.toContain("coursera.org");
    expect(lista).toContain("gutenberg.org");
    expect(lista).toHaveLength(DOMINIOS_BUSCA.length - 2);
  });
});

describe("fontes legais", () => {
  it("cabe no limite de 64 domínios da busca", () => {
    expect(DOMINIOS_BUSCA.length).toBeLessThanOrEqual(64);
  });

  it.each([
    ["https://www.gutenberg.org/ebooks/2680", "dominio_publico", true],
    ["https://www.dominiopublico.gov.br/pesquisa/DetalheObraForm.do?select_action=&co_obra=2246", "dominio_publico", true],
    ["https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm", "oficial", true],
    ["https://www.scielo.br/j/rbe/a/abc", "acesso_aberto", true],
    ["https://cs50.harvard.edu/x/", "curso_gratuito", false],
    ["https://books.google.com/books?id=xyz", "protegido_legal", false],
    ["https://www.amazon.com.br/dp/8535932283", "protegido_legal", false],
  ])("%s → %s (download: %s)", (url, categoria, download) => {
    const c = classificarFonte(url);
    expect(c?.categoria).toBe(categoria);
    expect(c?.permiteDownload).toBe(download);
  });

  it("subdomínio herda a regra do domínio (pt.wikisource.org)", () => {
    expect(classificarFonte("https://pt.wikisource.org/wiki/Dom_Casmurro")?.categoria).toBe("dominio_publico");
  });

  it.each([
    "https://site-qualquer.com/livro.pdf",
    "https://libgen.is/book/123",
    "https://archive.org/download/livro-protegido/livro.pdf",
    "https://www.amazon.com.br/livro.epub",
    "https://books.google.com/download/livro.pdf",
    "https://www.gutenberg.org.golpe.com/ebooks/1",
    "ftp://gutenberg.org/ebooks/1",
    "https://exemplo.gov.br/baixar-gratis-livro.pdf",
  ])("descarta fonte não permitida: %s", (url) => {
    expect(classificarFonte(url)).toBeNull();
  });

  it("vídeo do YouTube é classificado como vídeo", () => {
    expect(classificarFonte("https://www.youtube.com/watch?v=abc")?.tipo).toBe("video");
  });
});

function fetchFalso(respostas: Record<string, number | "erro">, metodos: string[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    metodos.push(`${init?.method} ${url}`);
    const r = respostas[url];
    if (r === "erro" || r === undefined) throw new TypeError("fetch failed");
    return new Response(null, { status: r });
  }) as typeof fetch;
}

describe("verificação de links", () => {
  it("200 e 3xx respondem", async () => {
    expect((await verificarLink("https://a.org", { fetch: fetchFalso({ "https://a.org": 200 }) })).ok).toBe(true);
  });

  it("404 e 410 são descartados", async () => {
    const r = await verificarLink("https://a.org/x", { fetch: fetchFalso({ "https://a.org/x": 404 }) });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("403 e 429 contam como página existente que bloqueia robôs", async () => {
    expect((await verificarLink("https://loja.com", { fetch: fetchFalso({ "https://loja.com": 403 }) })).ok).toBe(true);
  });

  it("HEAD não aceito (405) confirma com GET", async () => {
    const metodos: string[] = [];
    let chamadas = 0;
    const f = (async (_u: string, init?: RequestInit) => {
      metodos.push(init?.method ?? "");
      chamadas++;
      return new Response(null, { status: init?.method === "HEAD" ? 405 : 200 });
    }) as typeof fetch;
    expect((await verificarLink("https://a.org", { fetch: f })).ok).toBe(true);
    expect(metodos).toEqual(["HEAD", "GET"]);
    expect(chamadas).toBe(2);
  });

  it("falha de rede vira link quebrado", async () => {
    const r = await verificarLink("https://fora.org", { fetch: fetchFalso({}) });
    expect(r).toMatchObject({ ok: false, status: null });
  });

  it("tempo esgotado vira link quebrado", async () => {
    const lento = ((_u: string, init?: RequestInit) =>
      new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))))) as typeof fetch;
    const r = await verificarLink("https://lento.org", { fetch: lento, timeoutMs: 20 });
    expect(r.ok).toBe(false);
  });

  it("verifica vários links e remove duplicados", async () => {
    const metodos: string[] = [];
    const r = await verificarLinks(["https://a.org", "https://b.org", "https://a.org"], { fetch: fetchFalso({ "https://a.org": 200, "https://b.org": 500 }, metodos) });
    expect(r.get("https://a.org")?.ok).toBe(true);
    expect(r.get("https://b.org")?.ok).toBe(false);
    expect(metodos.filter((m) => m.endsWith("a.org"))).toHaveLength(1);
  });
});
