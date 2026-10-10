import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { aulaIAExemplo, CONTEXTO, feynmanIAExemplo, iaRoteirizada, mensagem, repoMemoria, respostaBusca, respostaJson, type OpcoesRepo } from "./__testes__/dubles";
import { erros } from "./ia/erros";
import type { FonteVerificada } from "./ia/schemas";
import type { Params } from "./ia/tipos";
import { criarRotas, type Fabricas } from "./rotas";

const sempreNoAr = (async () => new Response(null, { status: 200 })) as typeof fetch;
const prompts = (nome: string) => `prompt de teste: ${nome}`;
const AGORA = new Date("2026-10-10T12:00:00Z");

function montar(
  opcoes: {
    ia?: ReturnType<typeof iaRoteirizada>;
    repo?: ReturnType<typeof repoMemoria>;
    repoOpcoes?: OpcoesRepo;
    semChave?: boolean;
    processar?: Fabricas["processar"];
    fetch?: typeof fetch;
  } = {},
) {
  const ia = opcoes.ia ?? iaRoteirizada([]);
  const repo = opcoes.repo ?? repoMemoria(opcoes.repoOpcoes);
  const storage: Record<string, Uint8Array> = {};
  const inseridos: Record<string, unknown>[] = [];
  const sb = {
    storage: { from: () => ({ upload: async (c: string, b: Uint8Array) => ((storage[c] = b), { data: { path: c }, error: null }) }) },
    from: () => ({
      insert: (linha: Record<string, unknown>) => ({ select: () => ({ single: async () => (inseridos.push(linha), { data: { id: "arq-1" }, error: null }) }) }),
    }),
  } as unknown as SupabaseClient;
  const fab: Fabricas = {
    autenticar: async (req) => {
      if (!req.headers.get("authorization")) throw erros.naoAutenticado();
      return { sb, userId: "u1" };
    },
    repo: () => repo.repo,
    ia: () => {
      if (opcoes.semChave) throw erros.semChave();
      return ia.porta;
    },
    iaConfigurada: () => !opcoes.semChave,
    prompts,
    processar: opcoes.processar ?? (async () => ({ ids: ["arq-1"] })),
    fetch: opcoes.fetch ?? sempreNoAr,
    agora: () => AGORA,
  };
  return { rotas: criarRotas(fab), ia, repo, storage, inseridos };
}

const pedido = (corpo: unknown, token = "tok") =>
  new Request("http://teste/api", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) });

const G1 = "00000000-0000-4000-8000-0000000000c1";
const G2 = "00000000-0000-4000-8000-0000000000c2";
const corpoAula = (geracao_id = G1, extra: Record<string, unknown> = {}) => ({ geracao_id, trimestre_id: CONTEXTO.trimestre.id, passo: "nucleo", ...extra });

type Evento = { etapa?: string; id?: string; geracao_id?: string; reaproveitada?: boolean; reaproveitado?: boolean; erro?: { codigo: string; mensagem: string; etapa: string | null } };
async function eventos(r: Response): Promise<Evento[]> {
  return (await r.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
const final = (ev: Evento[]) => ev[ev.length - 1];

const TRES_TED: [string, string][] = [
  ["https://www.ted.com/talks/a", "Palestra TED"],
  ["https://www.ted.com/talks/b", "Outra palestra"],
  ["https://www.khanacademy.org/x", "Curso Khan"],
  ["https://pirata.com/livro.pdf", "Cópia"],
];

const erroApi = (status: number, message: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: status === 400 ? "invalid_request_error" : "api_error", message } }, message, new Headers({ "request-id": "req_teste" }));

const fontesCache = (n: number): FonteVerificada[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `S${i + 1}`,
    url: `https://www.ted.com/talks/cache-${i}`,
    titulo: `Cache ${i}`,
    tipo: "video",
    categoria: "curso_gratuito",
    acesso: "palestra gratuita (TED)",
    gratuita: true,
    permiteDownload: false,
  }));

// ---------------------------------------------------------------------------

describe("E1: todas as rotas de IA e de download exigem login", () => {
  const m = montar();
  it.each(["aula", "aulaStatus", "explicar", "feynman", "buscarPdf", "status", "processar", "importar"] as const)("%s sem token → 401", async (nome) => {
    const r = await m.rotas[nome](pedido({}, ""));
    expect(r.status).toBe(401);
    expect((await r.json()).erro.codigo).toBe("nao_autenticado");
  });
});

describe("POST /api/ia/aula", () => {
  it("corpo inválido → 400", async () => {
    const r = await montar().rotas.aula(pedido({ trimestre_id: "x", passo: "outro" }));
    expect(r.status).toBe(400);
  });

  it("sem chave da API → 503 com mensagem clara", async () => {
    const r = await montar({ semChave: true }).rotas.aula(pedido(corpoAula()));
    expect(r.status).toBe(503);
    expect((await r.json()).erro.mensagem).toContain("ANTHROPIC_API_KEY");
  });

  it("gera a aula com os modelos padrão, cache na parte fixa e progresso em etapas", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(ev.map((e) => e.etapa)).toEqual(["pesquisa", "verificacao", "composicao", "conferencia", "pronto"]);
    expect(final(ev)).toMatchObject({ etapa: "pronto", id: "aula-1", geracao_id: G1 });

    const [busca, composicao] = ia.pedidos;
    expect(busca.model).toBe("claude-sonnet-5-5");
    expect(composicao.model).toBe("claude-sonnet-5-5");
    const ferramenta = (busca.tools as { type: string; allowed_domains: string[]; max_uses: number }[])[0];
    expect(ferramenta.type).toBe("web_search_20260209");
    expect(ferramenta.max_uses).toBe(3);
    expect(ferramenta.allowed_domains).toContain("gutenberg.org");
    expect(ferramenta.allowed_domains).not.toContain("bbc.co.uk");
    expect(busca.betas).toEqual(["server-side-fallback-2026-07-01"]);
    // Parte fixa (metodologia + perfil) primeiro e marcada para cache; o pedido do dia no fim.
    const sistema = composicao.system as { text: string; cache_control?: unknown }[];
    expect(sistema[0]).toMatchObject({ text: "prompt de teste: aula-composicao", cache_control: { type: "ephemeral" } });
    expect(sistema[1].text).toContain("Perfil do aluno");
    expect(sistema[1].cache_control).toBeTruthy();
    expect(composicao.output_config?.format).toBeTruthy();
    const texto = String((composicao.messages[0] as { content: string }).content);
    expect(texto).toContain("[S1] Palestra TED");
    expect(texto).toContain("O que vem depois na trilha");
    expect(texto).not.toContain("pirata");

    // F1: cada chamada com etapa, modelo, tokens, custo e duração.
    expect(m.repo.chamadas.map((c) => [c.funcao, c.etapa, c.modelo])).toEqual([
      ["aula_pesquisa", "pesquisa", "claude-opus-5-5"],
      ["aula_composicao", "composicao", "claude-opus-5-5"],
    ]);
    expect(m.repo.chamadas.every((c) => c.duracao_ms >= 0 && c.geracao_id === G1 && !c.reaproveitado)).toBe(true);
    expect(m.repo.aulas).toHaveLength(1);
    expect(m.repo.geracoes.get(G1)).toMatchObject({ status: "concluida", aula_id: "aula-1", em_execucao_ate: null });
    expect(m.repo.fontesTema.get(CONTEXTO.tema!.id)?.fontes).toHaveLength(3);
  });

  it("retoma a busca quando a API pausa o turno (pause_turn)", async () => {
    const pausa = mensagem([{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }], { stop_reason: "pause_turn" });
    const ia = iaRoteirizada([pausa, respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const ev = await eventos(await montar({ ia }).rotas.aula(pedido(corpoAula())));
    expect(final(ev).etapa).toBe("pronto");
    expect(ia.pedidos[1].messages).toHaveLength(2);
  });

  it("recusa do modelo → erro nomeando a etapa, registrado", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), mensagem([{ type: "text", text: "" }], { stop_reason: "refusal" })]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).erro).toMatchObject({ codigo: "recusa", etapa: "composicao" });
    expect(final(ev).erro!.mensagem).toMatch(/^Composição da aula: /);
    expect(m.repo.chamadas[1]).toMatchObject({ sucesso: false, erro: "recusa" });
  });
});

describe("A1: erro amigável com a etapa; detalhe técnico no registro", () => {
  it("erro 400 da API na composição", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), erroApi(400, "messages.0: campo inválido xyz")]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    const erro = final(ev).erro!;
    expect(erro.etapa).toBe("composicao");
    expect(erro.mensagem).toContain("Composição da aula");
    expect(erro.mensagem).not.toContain("xyz"); // nada técnico na tela
    const falha = m.repo.chamadas.find((c) => !c.sucesso)!;
    expect(falha.erro_detalhe).toMatchObject({ status: 400, tipo: "invalid_request_error", request_id: "req_teste", etapa: "composicao", modelo: "claude-sonnet-5-5" });
    expect(falha.erro_detalhe!.mensagem).toContain("xyz");
  });
});

describe("A2: domínio recusado pela busca", () => {
  const recusa = () => erroApi(400, "The following domains are not accessible to our user agent: www.ted.com, khanacademy.org");

  it("tira os domínios, tenta de novo UMA vez e registra; próximas buscas já excluem", async () => {
    const ia = iaRoteirizada([
      recusa(),
      respostaBusca([
        ["https://www.gutenberg.org/ebooks/1", "Livro"],
        ["https://www.planalto.gov.br/lei", "Lei"],
      ]),
      respostaJson(aulaIAExemplo()),
    ]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).etapa).toBe("pronto");
    const [primeira, segunda] = ia.pedidos.map((p) => (p.tools as { allowed_domains: string[] }[] | undefined)?.[0]?.allowed_domains ?? []);
    expect(primeira).toContain("ted.com");
    expect(segunda).not.toContain("ted.com");
    expect(segunda).not.toContain("khanacademy.org");
    expect(segunda).toContain("gutenberg.org");
    expect(m.repo.bloqueados).toEqual(["ted.com", "khanacademy.org"]);

    // Busca seguinte (PDF legal) já sai sem os domínios bloqueados.
    const ia2 = iaRoteirizada([respostaBusca([["https://www.gutenberg.org/ebooks/2", "Outro"]])]);
    const m2 = montar({ ia: ia2, repo: m.repo });
    await m2.rotas.buscarPdf(pedido({ consulta: "Meditações" }));
    const dominios = (ia2.pedidos[0].tools as { allowed_domains: string[] }[])[0].allowed_domains;
    expect(dominios).not.toContain("khanacademy.org");
  });

  it("se falhar de novo, não tenta uma terceira vez", async () => {
    const ia = iaRoteirizada([recusa(), erroApi(400, "The following domains are not accessible: gutenberg.org")]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).erro).toMatchObject({ etapa: "pesquisa", codigo: "erro_api" });
    expect(ia.pedidos).toHaveLength(2);
  });
});

describe("A3: JSON validado no servidor; no máximo UMA chamada de reparo", () => {
  it("resposta inválida → reparo com Haiku, enviando só os erros e o JSON recebido", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson({ titulo: "incompleta" }), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).etapa).toBe("pronto");
    const reparo = ia.pedidos[2];
    expect(reparo.model).toBe("claude-haiku-5-5");
    expect(reparo.betas).toEqual([]); // Haiku 5.5 não tem fallback do servidor
    expect("fallbacks" in reparo).toBe(false);
    expect(reparo.system).toBe("prompt de teste: reparo-json");
    const conteudo = String((reparo.messages[0] as { content: string }).content);
    expect(conteudo).toContain("Erros de validação");
    expect(conteudo).toContain('{"titulo":"incompleta"}');
    expect(conteudo).not.toContain("Palestra TED"); // não reenvia o contexto da aula
    expect(m.repo.chamadas.map((c) => c.funcao)).toContain("aula_composicao_reparo");
  });

  it("reparo também inválido → erro, sem segunda tentativa de reparo", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson({ titulo: "x" }), respostaJson({ ainda: "errado" })]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).erro?.codigo).toBe("resposta_invalida");
    expect(ia.pedidos).toHaveLength(3);
  });
});

describe("A4: idempotência", () => {
  it("o mesmo id depois de concluída devolve a mesma aula, sem chamar a API", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev)).toMatchObject({ etapa: "pronto", id: "aula-1", reaproveitada: true });
    expect(ia.pedidos).toHaveLength(2);
    expect(m.repo.aulas).toHaveLength(1);
  });

  it("duplo clique / duas abas: só uma geração roda; a outra recebe 'em andamento'", async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((r) => (liberar = r));
    const roteiro = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const ia = {
      pedidos: roteiro.pedidos,
      porta: {
        chamar: async (p: Params) => {
          await portao;
          return roteiro.porta.chamar(p);
        },
      },
    };
    const m = montar({ ia });
    const primeira = m.rotas.aula(pedido(corpoAula(G1)));
    await new Promise((r) => setTimeout(r, 5));
    const segunda = await eventos(await m.rotas.aula(pedido(corpoAula(G2)))); // outra aba, outro id
    expect(final(segunda).erro?.codigo).toBe("em_andamento");
    expect(final(segunda).geracao_id).toBe(G1);
    liberar();
    expect(final(await eventos(await primeira)).etapa).toBe("pronto");
    expect(ia.pedidos).toHaveLength(2);
    expect(m.repo.aulas).toHaveLength(1);
  });

  it("status da geração responde sem chamar a IA", async () => {
    const m = montar({ semChave: true });
    await m.repo.repo.criarGeracao({ id: G1, trimestre_id: CONTEXTO.trimestre.id, passo: "nucleo" });
    const r = await m.rotas.aulaStatus(pedido({ geracao_id: G1 }));
    expect(await r.json()).toMatchObject({ status: "pendente", em_andamento: false });
  });
});

describe("B1: checkpoints — 'Tentar de novo' retoma da etapa que falhou", () => {
  it("falha na composição; a nova tentativa reaproveita a busca paga", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), erroApi(500, "falha interna")]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula(G1))));
    expect(final(ev).erro?.etapa).toBe("composicao");
    expect(m.repo.geracoes.get(G1)).toMatchObject({ status: "erro", etapa_falha: "composicao" });
    expect(m.repo.geracoes.get(G1)!.checkpoint.fontes).toHaveLength(3);
    const custoBusca = m.repo.chamadas[0].custo_usd;

    // Novo clique (novo id): cai na mesma geração aberta e só chama a composição.
    const ia2 = iaRoteirizada([respostaJson(aulaIAExemplo())]);
    const m2 = montar({ ia: ia2, repo: m.repo });
    const ev2 = await eventos(await m2.rotas.aula(pedido(corpoAula(G2))));
    expect(final(ev2)).toMatchObject({ etapa: "pronto", geracao_id: G1 });
    expect(ia2.pedidos).toHaveLength(1);
    expect(ia2.pedidos[0].output_config?.format).toBeTruthy();
    const reuso = m.repo.chamadas.find((c) => c.reaproveitado && c.funcao === "aula_pesquisa")!;
    expect(reuso.economia_usd).toBeCloseTo(custoBusca, 4);
  });

  it("B2: reabrir aula concluída não chama a API (explicação guardada também)", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo()), respostaJson({ explicacao: "Outro caminho.", analogia: "Outra analogia." })]);
    const m = montar({ ia });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    const corpo = { aula_id: "00000000-0000-4000-8000-0000000000a1", bloco: 0 };
    m.repo.conteudos.set(corpo.aula_id, m.repo.conteudos.get("aula-1")!);
    const r1 = await (await m.rotas.explicar(pedido(corpo))).json();
    const r2 = await (await m.rotas.explicar(pedido(corpo))).json();
    expect(r1).toMatchObject({ explicacao: "Outro caminho.", reaproveitada: false });
    expect(r2).toMatchObject({ explicacao: "Outro caminho.", reaproveitada: true });
    expect(ia.pedidos).toHaveLength(3);
  });
});

describe("B3: cache de fontes por tema", () => {
  const fresco = (n: number, dias = 2) => ({ fontes: fontesCache(n), custo_usd: 0.05, buscado_em: new Date(AGORA.getTime() - dias * 86_400_000).toISOString() });

  it("reaproveita o cache (reverificado por HTTP, sem IA) e registra a economia", async () => {
    const verificados: string[] = [];
    const f = (async (url: string) => (verificados.push(String(url)), new Response(null, { status: 200 }))) as typeof fetch;
    const ia = iaRoteirizada([respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, fetch: f, repoOpcoes: { fontesTema: fresco(3) } });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(ev.map((e) => e.etapa)).toEqual(["verificacao", "composicao", "conferencia", "pronto"]);
    expect(ev[0].reaproveitado).toBe(true);
    expect(ia.pedidos).toHaveLength(1); // só a composição
    expect(verificados.length).toBeGreaterThanOrEqual(3);
    expect(m.repo.chamadas[0]).toMatchObject({ funcao: "aula_pesquisa", reaproveitado: true, economia_usd: 0.05, custo_usd: 0 });
  });

  it("menos de 3 válidas depois da reverificação → busca de novo", async () => {
    const f = (async (url: string) => new Response(null, { status: String(url).includes("cache-0") ? 200 : 404 })) as typeof fetch;
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, fetch: f, repoOpcoes: { fontesTema: fresco(3) } });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(ia.pedidos[0].tools).toBeTruthy();
  });

  it("cache com mais de 30 dias → busca de novo", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, repoOpcoes: { fontesTema: fresco(5, 31) } });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(ia.pedidos).toHaveLength(2);
  });

  it("'buscar novas fontes' ignora o cache", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, repoOpcoes: { fontesTema: fresco(5) } });
    await eventos(await m.rotas.aula(pedido(corpoAula(G1, { novas_fontes: true }))));
    expect(ia.pedidos).toHaveLength(2);
  });
});

describe("B4/B5: biblioteca primeiro e limite de buscas", () => {
  it("com trechos da obra-base, limita a busca e usa a biblioteca como fonte principal", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, repoOpcoes: { trechos: 4, maxBuscas: 5 } });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    const ferramenta = (ia.pedidos[0].tools as { max_uses: number; allowed_domains: string[] }[])[0];
    expect(ferramenta.max_uses).toBe(2);
    expect(ferramenta.allowed_domains.length).toBeGreaterThan(10);
    expect(String((ia.pedidos[0].messages[0] as { content: string }).content)).toContain("obra-base");
    expect(String((ia.pedidos[1].messages[0] as { content: string }).content)).toContain("use-os como fonte principal");
  });

  it("máximo de buscas configurável", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, repoOpcoes: { trechos: 0, maxBuscas: 6 } });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect((ia.pedidos[0].tools as { max_uses: number }[])[0].max_uses).toBe(6);
  });
});

describe("C1: modelo por etapa configurável", () => {
  it("composição com Opus quando escolhido", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, repoOpcoes: { config: { modelos: { pesquisa: "claude-sonnet-5-5", composicao: "claude-opus-5-5", feynman: "claude-sonnet-5-5", explicar: "claude-haiku-5-5", reparo: "claude-haiku-5-5" } } } });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(ia.pedidos.map((p) => p.model)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
  });
});

describe("D1: conferência automática antes de mostrar a aula", () => {
  it("itens que falham geram UMA chamada de correção só com eles", async () => {
    const ruim = aulaIAExemplo();
    ruim.blocos[1].referencias = [{ fonte_id: "S9", trecho_id: null, citacao: "TED" }];
    ruim.cartoes = ruim.cartoes.filter((c) => c.tipo === "basico");
    const correcao = {
      objetivo: null,
      pre_teste: null,
      blocos: [{ indice: 1, referencias: [{ fonte_id: "S1", trecho_id: null, citacao: "TED" }], perguntas_recuperacao: null }],
      cartoes: [
        { frente: "O que é ilusão de fluência?", verso: "Familiaridade confundida com saber.", tipo: "basico", tags: ["memoria"], fonte: "T1" },
        { frente: "Por que testar-se fixa mais?", verso: "Lembrar reconstrói.", tipo: "por_que", tags: ["memoria"], fonte: "S1" },
        { frente: "O que fazer ao fechar o livro?", verso: "Escrever o que lembra.", tipo: "basico", tags: ["memoria"], fonte: "S1" },
      ],
    };
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(ruim), respostaJson(correcao)]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).etapa).toBe("pronto");
    expect(ia.pedidos).toHaveLength(3);
    const pedidoCorrecao = ia.pedidos[2];
    expect(pedidoCorrecao.model).toBe("claude-sonnet-5-5");
    // Mesma parte fixa da composição (lê o cache) + instrução de correção.
    expect((pedidoCorrecao.system as { text: string }[]).map((s) => s.text)).toEqual([
      "prompt de teste: aula-composicao",
      expect.stringContaining("Perfil do aluno"),
      "prompt de teste: aula-correcao",
    ]);
    const texto = String((pedidoCorrecao.messages[0] as { content: string }).content);
    expect(texto).toContain("S9");
    expect(texto).toContain("## Bloco 1");
    expect(texto).not.toContain("## Bloco 0"); // o bloco 0 estava certo
    const aula = m.repo.aulas[0].dados.conteudo;
    expect(aula.cartoes.some((c) => c.tipo === "por_que")).toBe(true);
    expect(aula.blocos[1].paragrafos.flatMap((p) => p.refs).length).toBeGreaterThan(0);
  });

  it("se a correção falhar, a aula sai mesmo assim (composição já paga), com aviso", async () => {
    const ruim = aulaIAExemplo();
    ruim.blocos[1].referencias = [{ fonte_id: "S9", trecho_id: null, citacao: "TED" }];
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(ruim), erroApi(500, "falha")]);
    const m = montar({ ia });
    const ev = await eventos(await m.rotas.aula(pedido(corpoAula())));
    expect(final(ev).etapa).toBe("pronto");
    expect(m.repo.aulas[0].dados.conteudo.avisos.join(" ")).toContain("não conseguiu corrigir");
  });

  it("aula correta não gera chamada extra", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    await eventos(await montar({ ia }).rotas.aula(pedido(corpoAula())));
    expect(ia.pedidos).toHaveLength(2);
  });
});

describe("D4: cartões repetidos são retirados", () => {
  it("compara com os cartões que o usuário já tem", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo())]);
    const m = montar({ ia, repoOpcoes: { frentes: ["O que é a ilusão de fluência?"] } });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    const aula = m.repo.aulas[0].dados.conteudo;
    expect(aula.cartoes.map((c) => c.frente)).toEqual(["Por que testar-se fixa mais?", "O que fazer ao fechar o livro?"]);
    expect(aula.avisos.join(" ")).toContain("repetiam");
  });
});

describe("E2/E3: limite diário e teto mensal bloqueiam todas as rotas antes de chamar", () => {
  const corpoFeynman = { tema_id: CONTEXTO.tema!.id, explicacao: "Repetição espaçada é revisar o conteúdo várias vezes até decorar, sempre no mesmo dia, para fixar." };
  const casos = [
    ["limite diário", { limite: 5, feitas: 5 }, "limite_diario"],
    ["teto mensal", { teto: 15, custoMes: 15.01 }, "teto_mensal"],
  ] as const;

  it.each(casos)("%s na aula", async (_n, opcoes, codigo) => {
    const ia = iaRoteirizada([]);
    const ev = await eventos(await montar({ ia, repoOpcoes: opcoes }).rotas.aula(pedido(corpoAula())));
    expect(final(ev).erro?.codigo).toBe(codigo);
    expect(ia.pedidos).toHaveLength(0);
  });

  it.each(casos)("%s no Feynman, no Explicar e na busca de PDF", async (_n, opcoes, codigo) => {
    const ia = iaRoteirizada([]);
    const m = montar({ ia, repoOpcoes: opcoes });
    m.repo.conteudos.set("00000000-0000-4000-8000-0000000000a1", { titulo: "t", objetivo: "o", pre_teste: [], blocos: [{ titulo: "b", paragrafos: [{ texto: "p", refs: [] }], analogia: "a", perguntas: [] }], referencias: [], para_ir_alem: [], cartoes: [], avisos: [] });
    const respostas = [
      await m.rotas.feynman(pedido(corpoFeynman)),
      await m.rotas.explicar(pedido({ aula_id: "00000000-0000-4000-8000-0000000000a1", bloco: 0 })),
      await m.rotas.buscarPdf(pedido({ consulta: "Meditações" })),
    ];
    for (const r of respostas) expect((await r.json()).erro.codigo).toBe(codigo);
    expect(ia.pedidos).toHaveLength(0);
  });

  it("o reparo também respeita o limite diário", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson({ titulo: "x" })]);
    const ev = await eventos(await montar({ ia, repoOpcoes: { limite: 2 } }).rotas.aula(pedido(corpoAula())));
    expect(final(ev).erro?.codigo).toBe("limite_diario");
    expect(ia.pedidos).toHaveLength(2);
  });

  it("status avisa a partir de 80% do teto", async () => {
    const r = await montar({ repoOpcoes: { teto: 10, custoMes: 8.5 } }).rotas.status(pedido({}));
    expect(await r.json()).toMatchObject({ configurada: true, alerta: "perto_do_teto", teto_mensal: 10 });
    const b = await montar({ repoOpcoes: { teto: 10, custoMes: 10 } }).rotas.status(pedido({}));
    expect((await b.json()).alerta).toBe("bloqueado");
  });
});

describe("POST /api/ia/feynman", () => {
  const corpo = { tema_id: CONTEXTO.tema!.id, explicacao: "Repetição espaçada é revisar o conteúdo várias vezes até decorar, sempre no mesmo dia, para fixar." };

  it("avalia com Sonnet, contexto enxuto (resumo das aulas do tema) e salva", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo()), respostaJson(feynmanIAExemplo())]);
    const m = montar({ ia });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    const r = await m.rotas.feynman(pedido(corpo));
    expect(r.status).toBe(200);
    expect((await r.json()).avaliacao.perguntas).toHaveLength(3);
    const p = ia.pedidos[2];
    expect(p.model).toBe("claude-sonnet-5-5");
    const texto = String((p.messages[0] as { content: string }).content);
    expect(texto).toContain("Conceitos-chave: A ilusão de saber; Como aplicar");
    expect(texto).not.toContain("Testar-se fixa."); // sem trechos longos da biblioteca
    expect(m.repo.feynman).toHaveLength(1);
  });

  it("explicação curta demais → 400", async () => {
    const r = await montar().rotas.feynman(pedido({ ...corpo, explicacao: "É revisar." }));
    expect(r.status).toBe(400);
  });

  it("tema inexistente → 404", async () => {
    const r = await montar().rotas.feynman(pedido({ ...corpo, tema_id: "00000000-0000-4000-8000-0000000000ff" }));
    expect(r.status).toBe(404);
  });
});

describe("POST /api/ia/explicar", () => {
  it("envia só o bloco e o objetivo, com Haiku", async () => {
    const ia = iaRoteirizada([respostaBusca(TRES_TED), respostaJson(aulaIAExemplo()), respostaJson({ explicacao: "Outro caminho.", analogia: "Outra." })]);
    const m = montar({ ia });
    await eventos(await m.rotas.aula(pedido(corpoAula())));
    const id = "00000000-0000-4000-8000-0000000000a1";
    m.repo.conteudos.set(id, m.repo.conteudos.get("aula-1")!);
    const r = await m.rotas.explicar(pedido({ aula_id: id, bloco: 1 }));
    expect(r.status).toBe(200);
    const p = ia.pedidos[2];
    expect(p.model).toBe("claude-haiku-5-5");
    const texto = String((p.messages[0] as { content: string }).content);
    expect(texto).toContain("Objetivo da aula");
    expect(texto).toContain("Como aplicar");
    expect(texto).not.toContain("A ilusão de saber"); // outro bloco
    expect(m.repo.conteudos.get(id)!.blocos[1].alternativa?.explicacao).toBe("Outro caminho.");
  });
});

describe("POST /api/biblioteca/buscar-pdf", () => {
  it("restringe a busca a domínios de download legal e devolve só esses", async () => {
    const ia = iaRoteirizada([
      respostaBusca([
        ["https://www.gutenberg.org/ebooks/2680", "Meditations"],
        ["https://books.google.com/books?id=1", "Prévia"],
      ]),
    ]);
    const r = await montar({ ia }).rotas.buscarPdf(pedido({ consulta: "Meditações Marco Aurélio" }));
    expect(r.status).toBe(200);
    const { fontes } = await r.json();
    expect(fontes.map((f: { url: string }) => f.url)).toEqual(["https://www.gutenberg.org/ebooks/2680"]);
    const dominios = (ia.pedidos[0].tools as { allowed_domains: string[] }[])[0].allowed_domains;
    expect(dominios).toContain("gutenberg.org");
    expect(dominios).not.toContain("books.google.com");
    expect(dominios).not.toContain("amazon.com.br");
    expect(dominios).not.toContain("archive.org");
  });

  it("nada encontrado → 422 busca_vazia", async () => {
    const ia = iaRoteirizada([respostaBusca([])]);
    const r = await montar({ ia }).rotas.buscarPdf(pedido({ consulta: "livro recente protegido" }));
    expect(r.status).toBe(422);
    expect((await r.json()).erro.codigo).toBe("busca_vazia");
  });
});

describe("POST /api/biblioteca/importar", () => {
  it("recusa domínio fora da lista legal sem baixar nada", async () => {
    let baixou = false;
    const f = (async () => ((baixou = true), new Response("x"))) as typeof fetch;
    const r = await montar({ fetch: f }).rotas.importar(pedido({ url: "https://pirata.com/livro.pdf", titulo: "X" }));
    expect(r.status).toBe(400);
    expect((await r.json()).erro.codigo).toBe("fonte_nao_permitida");
    expect(baixou).toBe(false);
  });

  it("baixa de fonte oficial, guarda na pasta do usuário e processa", async () => {
    const f = (async () => new Response("CAPÍTULO I\n\nTexto integral.", { headers: { "content-type": "text/plain; charset=utf-8" } })) as typeof fetch;
    let processado = "";
    const m = montar({ fetch: f, processar: async (_sb, id) => ((processado = id), { ids: [id] }) });
    const r = await m.rotas.importar(pedido({ url: "https://www.gutenberg.org/ebooks/2680", titulo: "Meditações", autor: "Marco Aurélio" }));
    expect(r.status).toBe(200);
    expect(Object.keys(m.storage)[0]).toMatch(/^u1\/[0-9a-f-]+\.txt$/);
    expect(m.inseridos[0]).toMatchObject({ origem: "fonte_aberta", formato: "txt", fonte_url: "https://www.gutenberg.org/cache/epub/2680/pg2680.txt" });
    expect(processado).toBe("arq-1");
  });
});
