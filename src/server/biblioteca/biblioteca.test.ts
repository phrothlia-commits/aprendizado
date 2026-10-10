import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { agruparPorLivro, dividirEmTrechos, htmlParaTexto, lerClippings, secoesDeEpub, secoesDePdf, secoesDeTexto } from "./extrair";
import { baixarObraAberta, formatoDe, normalizarUrlDownload } from "./importar";

describe("destaques do Kindle (My Clippings.txt)", () => {
  const clippings = `﻿Fixe o Conhecimento (Peter C. Brown)
- Your Highlight on page 23 | Location 345-347 | Added on Monday, October 5, 2026 8:00:00 AM

Tentar lembrar fortalece a memória.
==========
Fixe o Conhecimento (Peter C. Brown)
- Your Bookmark on page 30 | Location 400 | Added on Monday, October 5, 2026

==========
Rápido e Devagar (Daniel Kahneman)
- Seu destaque na página 101 | posição 1500-1502 | Adicionado: segunda-feira, 5 de outubro de 2026

O Sistema 1 opera automaticamente.
==========
`;
  it("lê destaques em inglês e português, ignorando marcadores", () => {
    const d = lerClippings(clippings);
    expect(d).toEqual([
      { titulo: "Fixe o Conhecimento", autor: "Peter C. Brown", pagina: 23, posicao: "345-347", texto: "Tentar lembrar fortalece a memória." },
      { titulo: "Rápido e Devagar", autor: "Daniel Kahneman", pagina: 101, posicao: "1500-1502", texto: "O Sistema 1 opera automaticamente." },
    ]);
  });
  it("agrupa por livro", () => {
    expect([...agruparPorLivro(lerClippings(clippings)).keys()]).toHaveLength(2);
  });
});

describe("texto e HTML", () => {
  it("detecta capítulos em texto puro", () => {
    const s = secoesDeTexto("Prefácio curto.\n\nCAPÍTULO I\nPrimeiro texto.\n\nCapítulo 2 — Preços\nSegundo texto.");
    expect(s.map((x) => x.capitulo)).toEqual([null, "CAPÍTULO I", "Capítulo 2 — Preços"]);
  });

  it("converte HTML de lei (Planalto) em texto, com entidades", () => {
    const t = htmlParaTexto("<html><head><style>x{}</style></head><body><p>Art. 5&ordm; Todos s&atilde;o iguais&nbsp;perante a lei</p><script>alert(1)</script></body></html>");
    expect(t).toBe("Art. 5º Todos são iguais perante a lei");
  });

  it("divide em trechos sem atravessar capítulo e com tamanho controlado", () => {
    const p = "Uma frase de estudo com conteúdo relevante. ".repeat(20).trim();
    const trechos = dividirEmTrechos(
      [
        { capitulo: "Cap. 1", pagina: 1, texto: `${p}\n\n${p}\n\n${p}` },
        { capitulo: "Cap. 2", pagina: 2, texto: "Curto." },
      ],
      1200,
    );
    expect(trechos.every((t) => t.texto.length <= 1300)).toBe(true);
    expect(trechos.at(-1)).toMatchObject({ capitulo: "Cap. 2", pagina: 2, texto: "Curto." });
    expect(trechos.map((t) => t.ordem)).toEqual(trechos.map((_, i) => i + 1));
  });
});

describe("EPUB", () => {
  it("lê o spine na ordem, com título do capítulo, título e autor da obra", () => {
    const epub = zipSync({
      mimetype: strToU8("application/epub+zip"),
      "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
      "OEBPS/content.opf": strToU8(
        '<package><metadata><dc:title>Meditações</dc:title><dc:creator>Marco Aurélio</dc:creator></metadata><manifest><item id="c1" href="cap1.xhtml"/><item id="c2" href="cap2.xhtml"/></manifest><spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>',
      ),
      "OEBPS/cap1.xhtml": strToU8("<html><body><h1>Livro II</h1><p>Ao amanhecer, diz a ti mesmo: encontrarei o intrometido, o ingrato.</p></body></html>"),
      "OEBPS/cap2.xhtml": strToU8("<html><body><h1>Livro I</h1><p>De meu avô Vero aprendi a bondade e a serenidade de caráter.</p></body></html>"),
    });
    const r = secoesDeEpub(epub);
    expect(r.titulo).toBe("Meditações");
    expect(r.autor).toBe("Marco Aurélio");
    expect(r.secoes.map((s) => s.capitulo)).toEqual(["Livro I", "Livro II"]);
  });

  it("EPUB corrompido dá erro claro", () => {
    expect(() => secoesDeEpub(new Uint8Array([1, 2, 3]))).toThrow(/EPUB/);
  });
});

describe("PDF", () => {
  it("extrai texto por página e carrega o capítulo para as páginas seguintes", async () => {
    const doc = await PDFDocument.create();
    const fonte = await doc.embedFont(StandardFonts.Helvetica);
    const p1 = doc.addPage();
    p1.drawText("Chapter 1 Retrieval", { x: 50, y: 750, font: fonte, size: 14 });
    p1.drawText("Trying to recall strengthens memory.", { x: 50, y: 700, font: fonte, size: 12 });
    const p2 = doc.addPage();
    p2.drawText("Spacing practice also helps.", { x: 50, y: 700, font: fonte, size: 12 });
    const secoes = await secoesDePdf(await doc.save());
    const pagina2 = secoes.find((s) => s.pagina === 2);
    expect(secoes.find((s) => s.pagina === 1)?.capitulo).toMatch(/Chapter 1/);
    expect(pagina2?.capitulo).toMatch(/Chapter 1/);
    expect(pagina2?.texto).toContain("Spacing practice");
  });

  it("PDF só com imagem (sem texto) dá erro claro", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    await expect(secoesDePdf(await doc.save())).rejects.toThrow(/texto selecionável/);
  });
});

describe("download de obra aberta", () => {
  it("Gutenberg: página da obra vira texto integral", () => {
    expect(normalizarUrlDownload("https://www.gutenberg.org/ebooks/2680")).toBe("https://www.gutenberg.org/cache/epub/2680/pg2680.txt");
  });

  it("detecta o formato pelo tipo de conteúdo ou extensão", () => {
    expect(formatoDe("application/pdf", "https://x.gov.br/a")).toBe("pdf");
    expect(formatoDe("", "https://x.gov.br/a.epub")).toBe("epub");
    expect(formatoDe("text/html; charset=utf-8", "https://x.gov.br/a")).toBe("html");
    expect(formatoDe("application/zip", "https://x.gov.br/a.zip")).toBeNull();
  });

  it("cancela se um redirecionamento sai da lista legal", async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: "https://pirata.com/livro.pdf" } })) as typeof fetch;
    await expect(baixarObraAberta("https://www.dominiopublico.gov.br/download/texto/a.pdf", f)).rejects.toThrow(/fora da lista/);
  });

  it("segue redirecionamento dentro da lista", async () => {
    let n = 0;
    const f = (async () =>
      n++ === 0
        ? new Response(null, { status: 301, headers: { location: "/download/texto/b.pdf" } })
        : new Response(new Uint8Array([37, 80, 68, 70]), { headers: { "content-type": "application/pdf" } })) as typeof fetch;
    const r = await baixarObraAberta("https://www.dominiopublico.gov.br/download/texto/a.pdf", f);
    expect(r.formato).toBe("pdf");
    expect(r.urlFinal).toBe("https://www.dominiopublico.gov.br/download/texto/b.pdf");
  });

  it("redirecionamento http:// no mesmo domínio legal vira https://", async () => {
    const pedidos: string[] = [];
    const f = (async (url: string) => {
      pedidos.push(url);
      return pedidos.length === 1
        ? new Response(null, { status: 302, headers: { location: "http://www.dominiopublico.gov.br/b.pdf" } })
        : new Response(new Uint8Array([37]), { headers: { "content-type": "application/pdf" } });
    }) as typeof fetch;
    const r = await baixarObraAberta("https://www.dominiopublico.gov.br/a.pdf", f);
    expect(pedidos[1]).toBe("https://www.dominiopublico.gov.br/b.pdf");
    expect(r.urlFinal).toBe("https://www.dominiopublico.gov.br/b.pdf");
  });

  it("recusa obras protegidas e domínios só de consulta", async () => {
    for (const url of ["https://books.google.com/books?id=1", "https://www.amazon.com.br/dp/1", "https://archive.org/details/x", "http://www.gutenberg.org/ebooks/1"]) {
      await expect(baixarObraAberta(url, fetch)).rejects.toThrow(/domínio público/);
    }
  });
});
