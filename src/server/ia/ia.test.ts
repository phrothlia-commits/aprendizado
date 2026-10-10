import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { configDeLinha } from "../repo";
import { ajustarSemIA, conferirAula, deduplicarCartoes, similaridade } from "./conferencia";
import { calcularCusto, economiaCache } from "./custos";
import { classificarErro, comEtapa, dominiosInacessiveis, erros } from "./erros";
import { MODELO_PADRAO, modeloValido, paramsFallback } from "./modelos";
import { montarPerfil } from "./perfil";
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
    [Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "x" } }, "x", h), "erro_api"],
    [new Error("qualquer"), "erro_interno"],
  ])("%s → %s", (erro, codigo) => {
    const r = classificarErro(erro);
    expect(r.codigo).toBe(codigo);
    expect(r.mensagem.length).toBeGreaterThan(10);
  });

  it("sem chave explica onde cadastrar, sem expor valor", () => {
    expect(classificarErro(erros.semChave()).mensagem).toContain("ANTHROPIC_API_KEY");
  });

  it("A1: mensagem amigável nomeando a etapa; detalhe técnico preservado", () => {
    const e = Anthropic.APIError.generate(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "tools.0.allowed_domains: bad thing" } },
      "400 bad",
      new Headers({ "request-id": "req_123" }),
    );
    const c = classificarErro(e, "pesquisa", "claude-sonnet-5-5");
    expect(c.mensagem).toMatch(/^Pesquisa de fontes: a API do Claude recusou o pedido \(erro 400\)/);
    expect(c.mensagem).not.toContain("allowed_domains");
    expect(c.detalhe).toEqual({
      etapa: "pesquisa",
      modelo: "claude-sonnet-5-5",
      status: 400,
      tipo: "invalid_request_error",
      mensagem: "tools.0.allowed_domains: bad thing",
      request_id: "req_123",
    });
  });

  it.each([
    ["verificacao", "Verificação de links"],
    ["composicao", "Composição da aula"],
    ["feynman", "Tutor Feynman"],
    ["biblioteca", "Biblioteca"],
  ] as const)("etapa %s aparece como “%s”", (etapa, nome) => {
    const e = comEtapa(new Error("falhou"), etapa);
    expect(e.message.startsWith(nome + ":")).toBe(true);
    expect(e.etapa).toBe(etapa);
    expect(e.detalhe?.mensagem).toBe("falhou");
  });

  it("comEtapa não reembrulha erro que já tem etapa", () => {
    const e = comEtapa(erros.recusa(), "composicao");
    expect(comEtapa(e, "conferencia")).toBe(e);
  });
});

describe("A2: domínios recusados pela busca", () => {
  const erro400 = (m: string) => Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: m } }, m, new Headers());
  const lista = ["bbc.co.uk", "gov.br", "planalto.gov.br", "ted.com"];

  it("extrai só os domínios da lista citados como inacessíveis", () => {
    expect(dominiosInacessiveis(erro400("The following domains are not accessible to our user agent: www.bbc.co.uk, planalto.gov.br"), lista)).toEqual(["bbc.co.uk", "planalto.gov.br"]);
  });

  it("não confunde subdomínio com domínio-pai (planalto.gov.br ≠ gov.br)", () => {
    expect(dominiosInacessiveis(erro400("domains not accessible: planalto.gov.br"), lista)).not.toContain("gov.br");
  });

  it("outros erros 400 não disparam nova tentativa", () => {
    expect(dominiosInacessiveis(erro400("max_tokens: too large"), lista)).toEqual([]);
    expect(dominiosInacessiveis(new Error("domains not accessible: ted.com"), lista)).toEqual([]);
  });

  it("funciona também com o erro já classificado pela etapa", () => {
    const e = comEtapa(erro400("Domains are not accessible: ted.com"), "pesquisa");
    expect(dominiosInacessiveis(e, lista)).toEqual(["ted.com"]);
  });
});

describe("modelos e custos", () => {
  it("padrões: Sonnet na pesquisa, composição e Feynman; Haiku no explicar e no reparo", () => {
    expect(MODELO_PADRAO).toEqual({
      pesquisa: "claude-sonnet-5-5",
      composicao: "claude-sonnet-5-5",
      feynman: "claude-sonnet-5-5",
      explicar: "claude-haiku-5-5",
      reparo: "claude-haiku-5-5",
    });
  });

  it("modelo fora do permitido volta ao padrão (busca nunca com Haiku)", () => {
    expect(modeloValido("pesquisa", "claude-haiku-5-5")).toBe("claude-sonnet-5-5");
    expect(modeloValido("composicao", "claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(modeloValido("composicao", null)).toBe("claude-sonnet-5-5");
  });

  it("fallback do servidor só em Sonnet/Opus", () => {
    expect(paramsFallback("claude-haiku-5-5")).toEqual({ betas: [] });
    expect(paramsFallback("claude-sonnet-5-5")).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  });

  it("configuração ausente (antes da migração 0003) usa os padrões", () => {
    expect(configDeLinha(null)).toMatchObject({ limiteDiario: 20, tetoMensal: 15, maxBuscas: 3, nivel: "iniciante", modelos: MODELO_PADRAO });
    expect(configDeLinha({ ia_teto_mensal_usd: "30.00", ia_modelo_composicao: "claude-opus-5-5" })).toMatchObject({ tetoMensal: 30, modelos: { composicao: "claude-opus-5-5" } });
  });

  it("economia do cache = tokens lidos × (preço cheio − preço de leitura)", () => {
    expect(economiaCache("claude-sonnet-5-5", { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(1.8, 4);
    expect(economiaCache("claude-sonnet-5-5", null)).toBe(0);
  });

  it("preço do Sonnet 5.5 e do Haiku 5.5", () => {
    expect(calcularCusto("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBe(3);
    expect(calcularCusto("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(0.6);
  });
});

describe("D1: conferência da aula", () => {
  const fontes: FonteVerificada[] = [
    { id: "S1", url: "https://www.planalto.gov.br/cf", titulo: "CF/88", tipo: "lei", categoria: "oficial", acesso: "documento oficial", gratuita: true, permiteDownload: true },
    { id: "S2", url: "https://www.ted.com/talks/x", titulo: "Palestra", tipo: "video", categoria: "curso_gratuito", acesso: "palestra gratuita (TED)", gratuita: true, permiteDownload: false },
  ];
  const trechos: TrechoBiblioteca[] = [{ id: "T1", arquivo_id: "a1", titulo: "Fixe", autor: null, capitulo: null, pagina: null, texto: "" }];

  it("aula de exemplo passa", () => {
    expect(conferirAula(aulaIAExemplo(), fontes, trechos)).toEqual([]);
  });

  it("aponta cada falha", () => {
    const a = aulaIAExemplo();
    a.objetivo = "";
    a.pre_teste = a.pre_teste.slice(0, 1);
    a.blocos[0].referencias = [];
    a.blocos[1].referencias = [{ fonte_id: "S7", trecho_id: null, citacao: "x" }];
    a.blocos[1].perguntas_recuperacao = [];
    a.cartoes = a.cartoes.filter((c) => c.tipo === "basico").slice(0, 2);
    a.blocos[0].texto += " veja https://pirata.com/x.pdf";
    const tipos = conferirAula(a, fontes, trechos).map((p) => [p.tipo, p.bloco ?? null, p.semIA]);
    expect(tipos).toEqual([
      ["objetivo", null, false],
      ["pre_teste", null, false],
      ["bloco_sem_citacao", 0, false],
      ["citacao_invalida", 1, false],
      ["bloco_sem_perguntas", 1, false],
      ["poucos_cartoes", null, false],
      ["link_fora_da_lista", null, true],
    ]);
  });

  it("mais de 8 cartões: corta sem IA e mantém um de “por quê?”", () => {
    const a = aulaIAExemplo();
    a.cartoes = [...Array.from({ length: 10 }, (_, i) => ({ frente: `Pergunta ${i}`, verso: "v", tipo: "basico" as const, tags: [], fonte: "" })), a.cartoes[1]];
    expect(conferirAula(a, fontes, trechos).find((p) => p.tipo === "poucos_cartoes")?.semIA).toBe(true);
    const ajustada = ajustarSemIA(a);
    expect(ajustada.cartoes).toHaveLength(8);
    expect(ajustada.cartoes.some((c) => c.tipo === "por_que")).toBe(true);
  });

  it("link de domínio permitido não é falha", () => {
    const a = aulaIAExemplo();
    a.blocos[0].texto += " https://www.planalto.gov.br/x";
    expect(conferirAula(a, fontes, trechos)).toEqual([]);
  });
});

describe("D4: cartões duplicados", () => {
  it("similaridade ignora acentos, caixa e palavras vazias", () => {
    expect(similaridade("O que é a ilusão de fluência?", "o que e ilusao de fluencia")).toBe(1);
    expect(similaridade("O que é ilusão de fluência?", "Por que testar-se fixa mais?")).toBeLessThan(0.3);
  });

  it("remove os repetidos com os existentes e entre si", () => {
    const novos = [{ frente: "O que é ilusão de fluência?" }, { frente: "Qual a curva do esquecimento?" }, { frente: "Curva do esquecimento: qual é?" }];
    const r = deduplicarCartoes(novos, ["Ilusão de fluência: o que é?"]);
    expect(r.cartoes.map((c) => c.frente)).toEqual(["Qual a curva do esquecimento?"]);
    expect(r.removidos).toBe(2);
  });
});

describe("D2: perfil do aluno", () => {
  it("monta sem IA, com nível, aulas, erros e lacunas, em até ~300 palavras", () => {
    const p = montarPerfil("intermediario", {
      aulasConcluidas: Array.from({ length: 30 }, (_, i) => `Aula ${i}`),
      cartoesMaisErrados: ["O que é viés de confirmação?"],
      lacunasFeynman: ["Não diferenciou risco de incerteza."],
      preTesteErrado: [{ pergunta: "O que é custo de oportunidade?", resposta: "O valor da melhor alternativa." }],
    });
    expect(p).toContain("intermediário");
    expect(p).toContain("viés de confirmação");
    expect(p).toContain("risco de incerteza");
    expect(p).toContain("custo de oportunidade");
    expect(p.split(/\s+/).length).toBeLessThanOrEqual(301);
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
