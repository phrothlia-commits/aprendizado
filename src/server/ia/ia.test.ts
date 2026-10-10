import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { calcularCusto } from "./custos";
import { classificarErro, erros } from "./erros";
import { extrairResultados, filtrarEVerificar } from "./pesquisa";
import { AulaIA, montarAula, semUrls, type FonteVerificada, type TrechoBiblioteca } from "./schemas";
import { aulaIAExemplo, mensagem } from "../__testes__/dubles";

describe("custos", () => {
  it("usa a tabela do Opus 5.5 ($4 / $20 por milhão) e $10 por mil buscas", () => {
    const c = calcularCusto("claude-opus-5-5", {
      input_tokens: 10_000,
      output_tokens: 5_000,
      cache_read_input_tokens: 2_000,
      cache_creation_input_tokens: 1_000,
      server_tool_use: { web_search_requests: 3 },
    });
    // 0,04 + 0,10 + 0,0004 + 0,005 + 0,03
    expect(c).toBeCloseTo(0.1754, 4);
  });

  it("modelo desconhecido usa o preço do Opus 5.5", () => {
    expect(calcularCusto("outro", { input_tokens: 1_000_000 })).toBe(4);
  });

  it("uso ausente custa zero", () => {
    expect(calcularCusto("claude-opus-5-5", null)).toBe(0);
  });
});

describe("mensagens de erro", () => {
  const h = new Headers();
  it.each([
    [new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "x" } }, "x", h), "chave_invalida"],
    [new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "x" } }, "x", h), "limite_api"],
    [Anthropic.APIError.generate(402, { type: "error", error: { type: "billing_error", message: "x" } }, "x", h), "sem_credito"],
    [Anthropic.APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "x" } }, "x", h), "sobrecarga"],
    [new Anthropic.APIConnectionError({ message: "x" }), "conexao"],
    [erros.semChave(), "sem_chave"],
    [erros.limiteDiario(20), "limite_diario"],
    [erros.buscaVazia(), "busca_vazia"],
    [new Error("qualquer"), "erro_interno"],
  ])("%s → %s", (erro, codigo) => {
    const r = classificarErro(erro);
    expect(r.codigo).toBe(codigo);
    expect(r.mensagem.length).toBeGreaterThan(10);
  });

  it("sem chave explica onde cadastrar, sem expor valor", () => {
    expect(classificarErro(erros.semChave()).mensagem).toContain("ANTHROPIC_API_KEY");
  });
});

describe("resultados da busca", () => {
  it("extrai URLs dos resultados e das citações, sem duplicar", () => {
    const m = mensagem([
      {
        type: "web_search_tool_result",
        tool_use_id: "t1",
        content: [
          { type: "web_search_result", url: "https://www.gutenberg.org/ebooks/1", title: "Livro A", encrypted_content: "", page_age: null },
          { type: "web_search_result", url: "https://pirata.com/a.pdf", title: "Pirata", encrypted_content: "", page_age: null },
        ],
      },
      { type: "text", text: "ok", citations: [{ type: "web_search_result_location", url: "https://www.gutenberg.org/ebooks/1", title: "Livro A", cited_text: "", encrypted_index: "" }] },
    ]);
    expect(extrairResultados([m]).map((r) => r.url)).toEqual(["https://www.gutenberg.org/ebooks/1", "https://pirata.com/a.pdf"]);
  });

  it("erro da busca (objeto, não lista) é ignorado", () => {
    const m = mensagem([{ type: "web_search_tool_result", tool_use_id: "t1", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }]);
    expect(extrairResultados([m])).toEqual([]);
  });

  it("filtra domínios ilegais e links quebrados, e numera S1, S2…", async () => {
    const f = (async (url: string) => new Response(null, { status: url.includes("quebrado") ? 404 : 200 })) as typeof fetch;
    const { fontes } = await filtrarEVerificar(
      [
        { url: "https://pirata.com/livro.pdf", titulo: "x" },
        { url: "https://www.planalto.gov.br/quebrado", titulo: "y" },
        { url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm", titulo: "CF/88" },
        { url: "https://www.ted.com/talks/abc", titulo: "Palestra" },
      ],
      { fetch: f },
    );
    expect(fontes.map((x) => [x.id, x.titulo])).toEqual([
      ["S1", "CF/88"],
      ["S2", "Palestra"],
    ]);
  });

  it("modo download só aceita domínio público, acesso aberto e oficial", async () => {
    const f = (async () => new Response(null, { status: 200 })) as typeof fetch;
    const { fontes } = await filtrarEVerificar(
      [
        { url: "https://books.google.com/books?id=1", titulo: "Prévia" },
        { url: "https://www.amazon.com.br/dp/1", titulo: "Compra" },
        { url: "https://archive.org/details/x", titulo: "Archive" },
        { url: "https://www.gutenberg.org/ebooks/2680", titulo: "Meditações" },
      ],
      { fetch: f, somenteDownload: true },
    );
    expect(fontes.map((x) => x.titulo)).toEqual(["Meditações"]);
  });
});

describe("montagem da aula", () => {
  const fontes: FonteVerificada[] = [
    { id: "S1", url: "https://www.planalto.gov.br/cf", titulo: "CF/88", tipo: "lei", categoria: "oficial", acesso: "documento oficial", gratuita: true, permiteDownload: true },
    { id: "S2", url: "https://www.ted.com/talks/x", titulo: "Palestra", tipo: "video", categoria: "curso_gratuito", acesso: "palestra gratuita (TED)", gratuita: true, permiteDownload: false },
  ];
  const trechos: TrechoBiblioteca[] = [{ id: "T1", arquivo_id: "a1", titulo: "Fixe o Conhecimento", autor: "Brown", capitulo: "Capítulo 2", pagina: 40, texto: "..." }];

  it("o exemplo valida no schema", () => {
    expect(AulaIA.safeParse(aulaIAExemplo()).success).toBe(true);
  });

  it("numera referências globalmente e troca [k] pelo número", () => {
    const a = montarAula(aulaIAExemplo(), fontes, trechos);
    expect(a.referencias.map((r) => [r.n, r.origem])).toEqual([
      [1, "biblioteca"],
      [2, "busca"],
      [3, "obra"],
    ]);
    expect(a.blocos[0].paragrafos[0]).toEqual({ texto: "Reler dá sensação de familiaridade.", refs: [1] });
    expect(a.blocos[0].paragrafos[1].refs).toEqual([2]);
    // A mesma fonte citada em outro bloco reaproveita o número; a referência
    // sem marcador no texto vai para o último parágrafo do bloco.
    expect(a.blocos[1].paragrafos[0].refs).toEqual([2, 3]);
    expect(a.referencias[0].citacao).toContain("p. 40");
  });

  it("nunca usa URL escrita pela IA; links só vêm das fontes verificadas", () => {
    const ia = aulaIAExemplo();
    ia.blocos[0].texto += " Veja https://pirata.com/livro.pdf";
    ia.blocos[0].referencias.push({ fonte_id: "S9", trecho_id: null, citacao: "baixe em https://pirata.com" });
    ia.para_ir_alem.push({ fonte_id: "S7", tipo: "texto", autor: null, por_que: "inexistente" });
    const a = montarAula(ia, fontes, trechos);
    const json = JSON.stringify(a);
    expect(json).not.toContain("pirata.com");
    expect(a.para_ir_alem.map((f) => f.url)).toEqual(["https://www.ted.com/talks/x"]);
    expect(a.referencias.filter((r) => r.url).every((r) => fontes.some((f) => f.url === r.url))).toBe(true);
  });

  it("normaliza tags dos cartões e limita o pré-teste a 3", () => {
    const ia = aulaIAExemplo();
    ia.pre_teste.push({ pergunta: "4", resposta: "4" }, { pergunta: "5", resposta: "5" });
    const a = montarAula(ia, fontes, trechos);
    expect(a.pre_teste).toHaveLength(3);
    expect(a.cartoes[0].tags).toEqual(["pratica-de-recuperacao", "memoria"]);
  });

  it("sem fontes escolhidas, oferece as verificadas em 'para ir além'", () => {
    const ia = aulaIAExemplo();
    ia.para_ir_alem = [];
    expect(montarAula(ia, fontes, []).para_ir_alem).toHaveLength(2);
  });

  it("semUrls remove http(s) e www", () => {
    expect(semUrls("ver http://x.com/a e www.y.com/b agora")).toBe("ver e agora");
  });
});
