import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { aulaIAExemplo, CONTEXTO, feynmanIAExemplo, iaRoteirizada, mensagem, repoMemoria, respostaBusca, respostaJson } from "./__testes__/dubles";
import { erros } from "./ia/erros";
import type { Deps } from "./ia/servicos";
import { criarRotas, type Fabricas } from "./rotas";

const sempreNoAr = (async () => new Response(null, { status: 200 })) as typeof fetch;
const prompts = () => "prompt de teste";

function montar(opcoes: { ia?: ReturnType<typeof iaRoteirizada>; repo?: ReturnType<typeof repoMemoria>; semChave?: boolean; autenticado?: boolean; processar?: Fabricas["processar"]; fetch?: typeof fetch } = {}) {
  const ia = opcoes.ia ?? iaRoteirizada([]);
  const repo = opcoes.repo ?? repoMemoria();
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
      if (opcoes.autenticado === false || !req.headers.get("authorization")) throw erros.naoAutenticado();
      return { sb, userId: "u1" };
    },
    deps: (): Deps => {
      if (opcoes.semChave) throw erros.semChave();
      return { ia: ia.porta, repo: repo.repo, prompts, modelo: "claude-opus-5-5", betas: ["server-side-fallback-2026-07-01"], fetch: sempreNoAr };
    },
    processar: opcoes.processar ?? (async () => ({ ids: ["arq-1"] })),
    fetch: opcoes.fetch,
  };
  return { rotas: criarRotas(fab), ia, repo, storage, inseridos };
}

const pedido = (corpo: unknown, token = "tok") =>
  new Request("http://teste/api", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) });

const corpoAula = { trimestre_id: CONTEXTO.trimestre.id, passo: "nucleo" };

describe("POST /api/ia/aula", () => {
  it("sem login → 401", async () => {
    const r = await montar().rotas.aula(pedido(corpoAula, ""));
    expect(r.status).toBe(401);
    expect((await r.json()).erro.codigo).toBe("nao_autenticado");
  });

  it("corpo inválido → 400", async () => {
    const r = await montar().rotas.aula(pedido({ trimestre_id: "x", passo: "outro" }));
    expect(r.status).toBe(400);
  });

  it("sem chave da API → 503 com mensagem clara", async () => {
    const r = await montar({ semChave: true }).rotas.aula(pedido(corpoAula));
    expect(r.status).toBe(503);
    expect((await r.json()).erro.mensagem).toContain("ANTHROPIC_API_KEY");
  });

  it("limite diário atingido → 429 sem chamar a API", async () => {
    const ia = iaRoteirizada([]);
    const r = await montar({ ia, repo: repoMemoria({ limite: 5, feitas: 4 }) }).rotas.aula(pedido(corpoAula));
    expect(r.status).toBe(429);
    expect((await r.json()).erro.codigo).toBe("limite_diario");
    expect(ia.pedidos).toHaveLength(0);
  });

  it("gera a aula: busca restrita, composição com schema, salva aula, fontes e custos", async () => {
    const ia = iaRoteirizada([
      respostaBusca([
        ["https://www.ted.com/talks/a", "Palestra TED"],
        ["https://www.ted.com/talks/b", "Outra palestra"],
        ["https://pirata.com/livro.pdf", "Cópia"],
      ]),
      respostaJson(aulaIAExemplo()),
    ]);
    const repo = repoMemoria();
    const r = await montar({ ia, repo }).rotas.aula(pedido(corpoAula));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: "aula-1" });

    const [busca, composicao] = ia.pedidos;
    const ferramenta = (busca.tools as { type: string; allowed_domains: string[] }[])[0];
    expect(ferramenta.type).toBe("web_search_20260209");
    expect(ferramenta.allowed_domains).toContain("gutenberg.org");
    expect(ferramenta.allowed_domains).not.toContain("pirata.com");
    expect(busca.model).toBe("claude-opus-5-5");
    expect(composicao.output_config?.format).toBeTruthy();
    expect(String((composicao.messages[0] as { content: string }).content)).toContain("[S1] Palestra TED");
    expect(String((composicao.messages[0] as { content: string }).content)).not.toContain("pirata");

    expect(repo.chamadas.map((c) => c.funcao)).toEqual(["aula_pesquisa", "aula_composicao"]);
    expect(repo.chamadas[0].custo_usd).toBeGreaterThan(0);
    expect(repo.aulas).toHaveLength(1);
    expect((repo.fontes as { url: string }[]).map((f) => f.url)).toEqual(["https://www.ted.com/talks/b"]);
  });

  it("retoma a busca quando a API pausa o turno (pause_turn)", async () => {
    const pausa = mensagem([{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }], { stop_reason: "pause_turn" });
    const ia = iaRoteirizada([pausa, respostaBusca([["https://www.ted.com/talks/a", "TED"]]), respostaJson(aulaIAExemplo())]);
    const r = await montar({ ia }).rotas.aula(pedido(corpoAula));
    expect(r.status).toBe(200);
    expect(ia.pedidos[1].messages).toHaveLength(2);
  });

  it("busca sem resultado legal: gera a aula mesmo assim, com aviso", async () => {
    const ia = iaRoteirizada([respostaBusca([["https://pirata.com/x.pdf", "Cópia"]]), respostaJson(aulaIAExemplo())]);
    const repo = repoMemoria({ trechos: 0 });
    await montar({ ia, repo }).rotas.aula(pedido(corpoAula));
    const aula = repo.aulas[0] as { conteudo: { avisos: string[] } };
    expect(aula.conteudo.avisos[0]).toContain("não encontrou fontes");
  });

  it("resposta fora do schema → 502 e a chamada fica registrada", async () => {
    const ia = iaRoteirizada([respostaBusca([]), respostaJson({ titulo: "incompleta" })]);
    const repo = repoMemoria();
    const r = await montar({ ia, repo }).rotas.aula(pedido(corpoAula));
    expect(r.status).toBe(502);
    expect((await r.json()).erro.codigo).toBe("resposta_invalida");
    expect(repo.chamadas).toHaveLength(2);
  });

  it("recusa do modelo → 422", async () => {
    const ia = iaRoteirizada([respostaBusca([]), mensagem([{ type: "text", text: "" }], { stop_reason: "refusal" })]);
    const repo = repoMemoria();
    const r = await montar({ ia, repo }).rotas.aula(pedido(corpoAula));
    expect(r.status).toBe(422);
    expect(repo.chamadas[1]).toMatchObject({ sucesso: false, erro: "recusa" });
  });
});

describe("POST /api/ia/feynman", () => {
  const corpo = { tema_id: CONTEXTO.tema!.id, explicacao: "Repetição espaçada é revisar o conteúdo várias vezes até decorar, sempre no mesmo dia, para fixar." };

  it("avalia, salva no histórico e devolve lacunas e perguntas", async () => {
    const ia = iaRoteirizada([respostaJson(feynmanIAExemplo())]);
    const repo = repoMemoria();
    const r = await montar({ ia, repo }).rotas.feynman(pedido(corpo));
    expect(r.status).toBe(200);
    const dados = await r.json();
    expect(dados.avaliacao.perguntas).toHaveLength(3);
    expect(repo.feynman).toHaveLength(1);
    expect(repo.chamadas[0].funcao).toBe("feynman");
  });

  it("explicação curta demais → 400", async () => {
    const r = await montar().rotas.feynman(pedido({ ...corpo, explicacao: "É revisar." }));
    expect(r.status).toBe(400);
  });

  it("tema inexistente → 404", async () => {
    const ia = iaRoteirizada([]);
    const r = await montar({ ia }).rotas.feynman(pedido({ ...corpo, tema_id: "00000000-0000-4000-8000-0000000000ff" }));
    expect(r.status).toBe(404);
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
